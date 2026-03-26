import { DateTime } from 'luxon';
import { z } from 'zod';

import { AdherenceScoreSchema, calculateAdherence } from '../../domain/adherence-model';
import {
  HabitStateSchema,
  MinimumViableDoseSchema,
  type HabitState,
  type MinimumViableDose,
} from '../../domain/habit-state';
import { PlanItemSchema } from '../../domain/plan-item';
import { RiskForecastSchema, forecastRisk, type RiskForecast } from '../../domain/risk-forecast';
import { V5PlanSchema } from '../../domain/rolling-wave-plan';
import { SlackPolicySchema, type SlackPolicy } from '../../domain/slack-policy';
import { TradeoffSchema } from '../../scheduler/types';
import type {
  AdaptiveActivityAdjustment,
  AdaptiveActivityLog,
  AdaptiveAssessment,
  AdaptiveDispatch,
  AdaptiveInput,
  AdaptiveMode,
  AdaptiveOutput,
  PlanPackage,
} from './phase-io-v5';

const AdaptiveActivityOutcomeSchema = z.enum(['SUCCESS', 'PARTIAL', 'MISSED']);

const AdaptiveActivityLogSchema = z.object({
  progressionKey: z.string().optional(),
  activityId: z.string().optional(),
  planItemId: z.string().optional(),
  occurredAt: z.string(),
  scheduledStartAt: z.string().optional(),
  plannedMinutes: z.number().int().min(0).optional(),
  completedMinutes: z.number().int().min(0).optional(),
  overlapMinutes: z.number().int().min(0).optional(),
  note: z.string().optional(),
  outcome: AdaptiveActivityOutcomeSchema,
}).strict();

const PlanPackageSchema = z.object({
  plan: V5PlanSchema,
  items: z.array(PlanItemSchema),
  habitStates: z.array(HabitStateSchema),
  slackPolicy: SlackPolicySchema,
  summary_esAR: z.string(),
  qualityScore: z.number(),
  implementationIntentions: z.array(z.string()),
  warnings: z.array(z.string()),
  tradeoffs: z.array(TradeoffSchema).optional(),
}).strict();

const AdaptiveInputSchema = z.object({
  package: PlanPackageSchema,
  activityLogs: z.array(AdaptiveActivityLogSchema),
  anchorAt: z.string().optional(),
  userFeedback: z.string().optional(),
}).strict();

const AdaptiveAssessmentSchema = z.object({
  progressionKey: z.string(),
  activityIds: z.array(z.string()),
  habitState: HabitStateSchema,
  adherence: AdherenceScoreSchema,
  risk: RiskForecastSchema,
  logCount: z.number().int().min(0),
  failureCount: z.number().int().min(0),
  partialCount: z.number().int().min(0),
  overlapMinutes: z.number().int().min(0),
  banalOverlap: z.boolean(),
}).strict();

const AdaptiveActivityAdjustmentSchema = z.object({
  activityId: z.string(),
  originalDurationMin: z.number().int().positive().optional(),
  suggestedDurationMin: z.number().int().positive().optional(),
  minimumViableMinutes: z.number().int().positive().optional(),
  minimumViableDescription: z.string().optional(),
  relaxConstraintTierTo: z.enum(['hard', 'soft_strong', 'soft_weak']).optional(),
  countsMinimumViableAsSuccess: z.boolean().optional(),
}).strict();

const AdaptiveDispatchSchema = z.object({
  rerunFromPhase: z.enum(['schedule', 'strategy']),
  phasesToRun: z.array(z.enum([
    'strategy',
    'template',
    'schedule',
    'hardValidate',
    'softValidate',
    'coveVerify',
    'repair',
    'package',
  ])),
  preserveSkeleton: z.boolean(),
  preserveHabitState: z.boolean(),
  allowSlackRecovery: z.boolean(),
  relaxSoftConstraints: z.boolean(),
  maxChurnMoves: z.number().int().min(0),
  affectedProgressionKeys: z.array(z.string()),
  activityAdjustments: z.array(AdaptiveActivityAdjustmentSchema),
  slackPolicy: SlackPolicySchema,
  reason: z.string(),
}).strict();

const AdaptiveOutputSchema = z.object({
  mode: z.enum(['ABSORB', 'PARTIAL_REPAIR', 'REBASE']),
  overallRisk: RiskForecastSchema,
  assessments: z.array(AdaptiveAssessmentSchema),
  dispatch: AdaptiveDispatchSchema,
  summary_esAR: z.string(),
  recommendations: z.array(z.string()),
  changesMade: z.array(z.string()),
}).strict();

const SCHEDULE_RERUN_PHASES = ['schedule', 'hardValidate', 'softValidate', 'coveVerify', 'repair', 'package'] as const;
const REBASE_RERUN_PHASES = ['strategy', 'template', 'schedule', 'hardValidate', 'softValidate', 'coveVerify', 'repair', 'package'] as const;
const OVERLAP_FEEDBACK_PATTERN = /(solap|superpu|cruce|choque|pis[oa]|overlap)/i;

function toMillis(value: string, label: string): number {
  const parsed = DateTime.fromISO(value, { setZone: true });
  if (!parsed.isValid) {
    throw new Error(`${label} must be a valid ISO datetime`);
  }

  return parsed.toMillis();
}

function roundMinimumViableMinutes(baseDurationMin: number): number {
  return Math.max(5, Math.min(baseDurationMin, Math.ceil((baseDurationMin * 0.25) / 5) * 5));
}

function buildFallbackMinimumViable(planPackage: PlanPackage): MinimumViableDose {
  const shortestEvent = planPackage.plan.operational.scheduledEvents.reduce<number | null>((shortest, event) => {
    if (shortest === null || event.durationMin < shortest) {
      return event.durationMin;
    }
    return shortest;
  }, null);
  const baseDurationMin = shortestEvent ?? 30;

  return MinimumViableDoseSchema.parse({
    minutes: roundMinimumViableMinutes(baseDurationMin),
    description: 'Version minima para sostener el ritmo de esta semana',
  });
}

function buildFallbackHabitState(planPackage: PlanPackage): HabitState {
  const firstFrequency = planPackage.plan.skeleton.phases.flatMap((phase) => phase.frequencies)[0];
  const weeklySessions = planPackage.plan.skeleton.phases
    .flatMap((phase) => phase.frequencies)
    .reduce((total, frequency) => total + frequency.sessionsPerWeek, 0);

  return HabitStateSchema.parse({
    progressionKey: firstFrequency?.activityId ?? planPackage.plan.goalIds[0] ?? 'adaptive-plan',
    weeksActive: 0,
    level: 0,
    currentDose: {
      sessionsPerWeek: Math.max(weeklySessions, 1),
      minimumViable: buildFallbackMinimumViable(planPackage),
    },
    protectedFromReset: false,
  });
}

function resolveHabitStates(planPackage: PlanPackage): HabitState[] {
  if (planPackage.habitStates.length > 0) {
    return planPackage.habitStates;
  }

  return [buildFallbackHabitState(planPackage)];
}

function sortLogs(logs: AdaptiveActivityLog[]): AdaptiveActivityLog[] {
  return [...logs].sort((left, right) => toMillis(left.occurredAt, 'activityLog.occurredAt') - toMillis(right.occurredAt, 'activityLog.occurredAt'));
}

function resolveLogsForState(
  state: HabitState,
  logs: AdaptiveActivityLog[],
  totalStates: number,
): AdaptiveActivityLog[] {
  const directMatches = logs.filter((log) => log.progressionKey === state.progressionKey);
  if (directMatches.length > 0) {
    return sortLogs(directMatches);
  }

  if (totalStates === 1) {
    return sortLogs(logs.filter((log) => !log.progressionKey || log.progressionKey === state.progressionKey));
  }

  return [];
}

function resolveActivityCatalog(planPackage: PlanPackage): Map<string, number | undefined> {
  const catalog = new Map<string, number | undefined>();

  for (const phase of planPackage.plan.skeleton.phases) {
    for (const frequency of phase.frequencies) {
      if (!catalog.has(frequency.activityId)) {
        catalog.set(frequency.activityId, frequency.minutesPerSession);
      }
    }
  }

  return catalog;
}

function resolveActivityIds(
  stateLogs: AdaptiveActivityLog[],
  planPackage: PlanPackage,
): string[] {
  const fromLogs = Array.from(new Set(stateLogs.map((log) => log.activityId).filter((value): value is string => Boolean(value))));
  if (fromLogs.length > 0) {
    return fromLogs;
  }

  return Array.from(resolveActivityCatalog(planPackage).keys());
}

function countFailures(logs: AdaptiveActivityLog[]): number {
  return logs.filter((log) => log.outcome !== 'SUCCESS').length;
}

function countPartials(logs: AdaptiveActivityLog[]): number {
  return logs.filter((log) => log.outcome === 'PARTIAL').length;
}

function totalOverlapMinutes(logs: AdaptiveActivityLog[]): number {
  return logs.reduce((total, log) => total + (log.overlapMinutes ?? 0), 0);
}

function hasOverlapFeedback(userFeedback?: string): boolean {
  return userFeedback ? OVERLAP_FEEDBACK_PATTERN.test(userFeedback) : false;
}

function isBanalOverlap(
  logs: AdaptiveActivityLog[],
  slackPolicy: SlackPolicy,
  userFeedback?: string,
): boolean {
  const disruptions = logs.filter((log) => log.outcome !== 'SUCCESS');
  if (disruptions.length === 0) {
    return false;
  }

  const overlapMinutes = totalOverlapMinutes(disruptions);
  const plannedMinutes = disruptions.reduce((total, log) => total + (log.plannedMinutes ?? 0), 0);
  const overlapSignal = overlapMinutes > 0 || hasOverlapFeedback(userFeedback);

  if (!overlapSignal) {
    return false;
  }

  return (
    disruptions.length <= 1 &&
    overlapMinutes <= Math.max(15, Math.floor(slackPolicy.weeklyTimeBufferMin / 2)) &&
    plannedMinutes <= Math.max(30, slackPolicy.weeklyTimeBufferMin)
  );
}

function riskSeverity(risk: RiskForecast): number {
  if (risk === 'CRITICAL') {
    return 2;
  }
  if (risk === 'AT_RISK') {
    return 1;
  }
  return 0;
}

function resolveOverallRisk(assessments: AdaptiveAssessment[]): RiskForecast {
  return assessments.reduce<RiskForecast>((current, assessment) => {
    return riskSeverity(assessment.risk) > riskSeverity(current) ? assessment.risk : current;
  }, 'SAFE');
}

function resolveMode(assessments: AdaptiveAssessment[], overallRisk: RiskForecast): AdaptiveMode {
  if (overallRisk === 'CRITICAL') {
    return 'REBASE';
  }

  const hasEscalatedAtRisk = assessments.some((assessment) => assessment.risk === 'AT_RISK' && !assessment.banalOverlap);
  return hasEscalatedAtRisk ? 'PARTIAL_REPAIR' : 'ABSORB';
}

function buildActivityAdjustments(
  mode: AdaptiveMode,
  assessments: AdaptiveAssessment[],
  activityCatalog: Map<string, number | undefined>,
): AdaptiveActivityAdjustment[] {
  if (mode !== 'PARTIAL_REPAIR') {
    return [];
  }

  const adjustments: AdaptiveActivityAdjustment[] = [];
  const seen = new Set<string>();

  for (const assessment of assessments) {
    if (assessment.risk !== 'AT_RISK' || assessment.banalOverlap) {
      continue;
    }

    for (const activityId of assessment.activityIds) {
      if (seen.has(activityId)) {
        continue;
      }

      seen.add(activityId);
      adjustments.push({
        activityId,
        originalDurationMin: activityCatalog.get(activityId),
        suggestedDurationMin: assessment.habitState.currentDose.minimumViable.minutes,
        minimumViableMinutes: assessment.habitState.currentDose.minimumViable.minutes,
        minimumViableDescription: assessment.habitState.currentDose.minimumViable.description,
        relaxConstraintTierTo: 'soft_weak',
        countsMinimumViableAsSuccess: true,
      });
    }
  }

  return adjustments;
}

function buildDispatch(
  mode: AdaptiveMode,
  assessments: AdaptiveAssessment[],
  slackPolicy: SlackPolicy,
  activityCatalog: Map<string, number | undefined>,
): AdaptiveDispatch {
  const affectedProgressionKeys = Array.from(new Set(
    assessments
      .filter((assessment) => assessment.risk !== 'SAFE' || assessment.banalOverlap)
      .map((assessment) => assessment.progressionKey),
  ));
  const activityAdjustments = buildActivityAdjustments(mode, assessments, activityCatalog);

  if (mode === 'REBASE') {
    return AdaptiveDispatchSchema.parse({
      rerunFromPhase: 'strategy',
      phasesToRun: [...REBASE_RERUN_PHASES],
      preserveSkeleton: false,
      preserveHabitState: true,
      allowSlackRecovery: false,
      relaxSoftConstraints: false,
      maxChurnMoves: 0,
      affectedProgressionKeys,
      activityAdjustments: [],
      slackPolicy,
      reason: 'La rutina real cambio demasiado; conviene rehacer estrategia, plantilla y agenda.',
    });
  }

  if (mode === 'PARTIAL_REPAIR') {
    return AdaptiveDispatchSchema.parse({
      rerunFromPhase: 'schedule',
      phasesToRun: [...SCHEDULE_RERUN_PHASES],
      preserveSkeleton: true,
      preserveHabitState: true,
      allowSlackRecovery: true,
      relaxSoftConstraints: true,
      maxChurnMoves: Math.max(slackPolicy.maxChurnMovesPerWeek, 3),
      affectedProgressionKeys,
      activityAdjustments,
      slackPolicy,
      reason: 'Hace falta bajar exigencia esta o la proxima semana, pero sin tirar el plan de 12 semanas.',
    });
  }

  return AdaptiveDispatchSchema.parse({
    rerunFromPhase: 'schedule',
    phasesToRun: [...SCHEDULE_RERUN_PHASES],
    preserveSkeleton: true,
    preserveHabitState: true,
    allowSlackRecovery: true,
    relaxSoftConstraints: false,
    maxChurnMoves: Math.min(slackPolicy.maxChurnMovesPerWeek, 2),
    affectedProgressionKeys,
    activityAdjustments: [],
    slackPolicy,
    reason: 'El desajuste es chico y se puede absorber con slack y pocos movimientos.',
  });
}

function buildRecommendations(
  mode: AdaptiveMode,
  assessments: AdaptiveAssessment[],
): string[] {
  if (mode === 'REBASE') {
    return [
      'Rearmar desde Strategy para reflejar la vida real de esta semana.',
      'Conservar HabitState, pero no forzar la agenda vieja porque ya no es creible.',
    ];
  }

  if (mode === 'PARTIAL_REPAIR') {
    const viableMinutes = assessments
      .filter((assessment) => assessment.risk === 'AT_RISK' && !assessment.banalOverlap)
      .map((assessment) => `${assessment.habitState.currentDose.minimumViable.minutes} min`)
      .at(0);

    return [
      'Relajar constraints blandos y volver a correr el solver solo para la semana operativa.',
      viableMinutes
        ? `Contar ${viableMinutes} como version minima valida para no cortar la maquina de habito.`
        : 'Contar la version minima del habito como exito valido esta semana.',
    ];
  }

  return [
    'Usar el slack operativo para recolocar el choque sin rehacer el plan completo.',
    'Mantener churn bajo: mover poco y no tocar el horizonte congelado salvo necesidad real.',
  ];
}

function buildSummary(mode: AdaptiveMode, overallRisk: RiskForecast, assessments: AdaptiveAssessment[]): string {
  if (assessments.length === 0) {
    return 'No entraron logs nuevos; la agenda queda estable y no hace falta rearmar nada.';
  }

  if (mode === 'REBASE') {
    return `El riesgo quedo en ${overallRisk} y la semana actual ya no representa la realidad del usuario. Hace falta rebasear desde Strategy.`;
  }

  if (mode === 'PARTIAL_REPAIR') {
    return `El riesgo quedo en ${overallRisk}. Conviene reparar parcialmente la semana bajando la exigencia sin perder el esqueleto del plan.`;
  }

  return `El riesgo quedo en ${overallRisk} y el desvio es absorbible con slack, pocos movimientos y sin resetear progreso.`;
}

function buildNoopAdaptiveOutput(planPackage: PlanPackage): AdaptiveOutput {
  return AdaptiveOutputSchema.parse({
    mode: 'ABSORB',
    overallRisk: 'SAFE',
    assessments: [],
    dispatch: {
      rerunFromPhase: 'schedule',
      phasesToRun: [...SCHEDULE_RERUN_PHASES],
      preserveSkeleton: true,
      preserveHabitState: true,
      allowSlackRecovery: true,
      relaxSoftConstraints: false,
      maxChurnMoves: Math.min(planPackage.slackPolicy.maxChurnMovesPerWeek, 2),
      affectedProgressionKeys: [],
      activityAdjustments: [],
      slackPolicy: planPackage.slackPolicy,
      reason: 'Todavia no hay evidencia nueva suficiente para alterar la semana.',
    },
    summary_esAR: 'No entraron logs nuevos; la semana sigue igual y solo queda margen para absorber imprevistos.',
    recommendations: ['Esperar mas evidencia antes de relanzar el scheduler.'],
    changesMade: ['Sin cambios operativos hasta tener logs confiables.'],
  });
}

export async function generateAdaptiveResponse(input: AdaptiveInput): Promise<AdaptiveOutput> {
  const parsedInput = AdaptiveInputSchema.parse(input);
  if (parsedInput.activityLogs.length === 0) {
    return buildNoopAdaptiveOutput(parsedInput.package);
  }

  const planPackage = parsedInput.package;
  const slackPolicy = SlackPolicySchema.parse(planPackage.slackPolicy);
  const habitStates = resolveHabitStates(planPackage);
  const activityCatalog = resolveActivityCatalog(planPackage);
  const assessments: AdaptiveAssessment[] = habitStates.map((habitState) => {
    const stateLogs = resolveLogsForState(habitState, parsedInput.activityLogs, habitStates.length);
    const hasEvidence = stateLogs.length > 0;
    const adherence = calculateAdherence(hasEvidence ? stateLogs.map((log) => (log.outcome === 'SUCCESS' ? 1 : 0)) : [1]);
    const risk = hasEvidence ? forecastRisk(adherence, habitState) : 'SAFE';

    return AdaptiveAssessmentSchema.parse({
      progressionKey: habitState.progressionKey,
      activityIds: resolveActivityIds(stateLogs, planPackage),
      habitState,
      adherence,
      risk,
      logCount: stateLogs.length,
      failureCount: countFailures(stateLogs),
      partialCount: countPartials(stateLogs),
      overlapMinutes: totalOverlapMinutes(stateLogs),
      banalOverlap: isBanalOverlap(stateLogs, slackPolicy, parsedInput.userFeedback),
    });
  });

  const overallRisk = resolveOverallRisk(assessments);
  const mode = resolveMode(assessments, overallRisk);
  const dispatch = buildDispatch(mode, assessments, slackPolicy, activityCatalog);
  const recommendations = buildRecommendations(mode, assessments);
  const summary_esAR = buildSummary(mode, overallRisk, assessments);

  return AdaptiveOutputSchema.parse({
    mode,
    overallRisk,
    assessments,
    dispatch,
    summary_esAR,
    recommendations,
    changesMade: [
      `Modo seleccionado: ${mode}.`,
      dispatch.reason,
      ...recommendations,
    ],
  });
}
