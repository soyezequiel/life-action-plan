import { DateTime } from 'luxon';

import { createInstrumentedRuntime } from '../../debug/instrumented-runtime';
import { traceCollector } from '../../debug/trace-collector';
import type { Perfil } from '../../shared/schemas/perfil';
import type { PlanEvent } from '../../shared/types/lap-api';
import { apiErrorMessages } from '../../shared/api-utils';
import { DEFAULT_OLLAMA_FALLBACK_MODEL, buildWithOllamaFallback } from '../../utils/plan-build-fallback';
import { FlowRunnerV5 } from '../pipeline/v5/runner';
import { buildSchedulingContextFromProfile } from '../pipeline/v5/scheduling-context';
import type { FlowRunnerV5Context, PipelinePhaseV5 } from '../pipeline/v5/runner';
import type { AdaptiveStatus, PlanPackage, V5PhaseSnapshot } from '../pipeline/v5/phase-io-v5';
import { getProvider } from '../providers/provider-factory';
import type { AgentRuntime } from '../runtime/types';
import type { ResolvedPlanBuildExecution } from '../runtime/build-execution';
import { createPipelineRuntimeRecorder } from '../flow/pipeline-runtime-data';
import { summarizeResourceUsage } from '../runtime/resource-usage-summary';

export interface GeneratedPlan {
  nombre: string;
  resumen: string;
  eventos: PlanEvent[];
  tokensUsed: { input: number; output: number };
}

export interface PlanGenerationOptions {
  profileId: string;
  thinkingMode?: 'enabled' | 'disabled';
  traceId?: string | null;
  requestedExecution: ResolvedPlanBuildExecution;
  fallbackExecution?: ResolvedPlanBuildExecution | null;
  previousFindings?: Array<{ code: string; status: string; params?: Record<string, string | number> }>;
  buildConstraints?: string[];
  onProgress?: (stage: string, current: number, total: number, charCount: number, chunk?: string) => void;
  onFallback?: (
    originalModel: string,
    fallbackModel: string,
    originalError: Error,
    requestedMode: string,
    fallbackMode?: string | null
  ) => void;
}

export interface PlanGenerationOutcome {
  result: GeneratedPlan;
  package: PlanPackage;
  phaseSnapshot: V5PhaseSnapshot;
  adaptiveStatus: AdaptiveStatus;
  fallbackUsed: boolean;
  finalModelId: string;
  requestedExecution: ResolvedPlanBuildExecution;
  finalExecution: ResolvedPlanBuildExecution;
  streamedCharCount: number;
}

const TRACE_SKILL_NAME = 'plan-builder-v5';
const REPAIR_LOOP_PHASES = ['hardValidate', 'softValidate', 'coveVerify', 'repair'] as const

type RepairLoopPhase = (typeof REPAIR_LOOP_PHASES)[number]

function normalizeText(value: string | null | undefined): string {
  return value?.trim() || '';
}

function normalizeComparableText(value: string | null | undefined): string {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeDayLabel(value: string): string {
  return normalizeComparableText(value).replace(/\s+/g, '');
}

function getPrimaryGoal(profile: Perfil): { id: string; text: string } {
  const primaryGoal = profile.objetivos[0];

  return {
    id: primaryGoal?.id || 'goal-v5-build',
    text: normalizeText(primaryGoal?.descripcion) || 'Armar un plan personal sostenible'
  };
}

function getProfileTimezone(profile: Perfil): string {
  return profile.participantes[0]?.datosPersonales?.ubicacion?.zonaHoraria || 'America/Argentina/Buenos_Aires';
}

function buildAnswers(
  profile: Perfil,
  previousFindings?: PlanGenerationOptions['previousFindings'],
  buildConstraints?: string[]
): Record<string, string> {
  const participant = profile.participantes[0];
  const weekdayFree = participant?.calendario?.horasLibresEstimadas?.diasLaborales ?? 2;
  const weekendFree = participant?.calendario?.horasLibresEstimadas?.diasDescanso ?? 4;
  const fixedCommitments = [
    ...(participant?.calendario?.eventosInamovibles.map((event) => `${event.nombre}: ${event.horario}`) ?? []),
    ...(participant?.compromisos.map((commitment) => commitment.descripcion) ?? [])
  ];
  const restrictions = [
    ...(participant?.problemasActuales ?? []),
    ...(participant?.condicionesSalud.map((condition) => condition.impactoFuncional) ?? []),
    ...(participant?.datosPersonales?.ubicacion?.adversidadesLocales ?? []),
    ...((buildConstraints ?? []).map((constraint) => constraint.trim()).filter(Boolean))
  ];
  const reviewNotes = (previousFindings ?? [])
    .map((finding) => `${finding.code}: ${JSON.stringify(finding.params ?? {})}`)
    .join(' | ');

  return {
    disponibilidad: `Tengo aproximadamente ${weekdayFree} horas libres en dias laborales y ${weekendFree} horas en dias de descanso.`,
    rutina: [
      `Me despierto cerca de ${normalizeText(participant?.rutinaDiaria?.porDefecto?.despertar) || '07:00'}.`,
      `Termino el dia cerca de ${normalizeText(participant?.rutinaDiaria?.porDefecto?.dormir) || '22:00'}.`,
      normalizeText(participant?.rutinaDiaria?.porDefecto?.trabajoInicio) && normalizeText(participant?.rutinaDiaria?.porDefecto?.trabajoFin)
        ? `Mi bloque principal ocupado va de ${participant?.rutinaDiaria?.porDefecto?.trabajoInicio} a ${participant?.rutinaDiaria?.porDefecto?.trabajoFin}.`
        : ''
    ].filter(Boolean).join(' '),
    restricciones: restrictions.join('. '),
    compromisos: fixedCommitments.join('. '),
    energia: [
      `Cronotipo ${participant?.patronesEnergia?.cronotipo ?? 'neutro'}.`,
      `Pico de energia ${normalizeText(participant?.patronesEnergia?.horarioPicoEnergia) || 'sin dato'}.`,
      `Horario bajo ${normalizeText(participant?.patronesEnergia?.horarioBajoEnergia) || 'sin dato'}.`
    ].join(' '),
    contexto: [
      normalizeText(participant?.datosPersonales?.narrativaPersonal),
      normalizeText(profile.estadoDinamico?.notasTemporales?.join('. ')),
      reviewNotes ? `Revisiones previas: ${reviewNotes}.` : ''
    ].filter(Boolean).join(' ')
  };
}

function inferLegacyCategory(goalText: string, phaseContext: FlowRunnerV5Context): PlanEvent['categoria'] {
  const normalized = normalizeComparableText(goalText);

  if (/(correr|running|entren|gim|yoga|movilidad|caminar|natacion|bici|salud)/.test(normalized)) {
    return 'ejercicio';
  }

  if (phaseContext.classification?.goalType === 'SKILL_ACQUISITION') {
    return 'estudio';
  }

  if (phaseContext.classification?.goalType === 'FINITE_PROJECT') {
    return 'trabajo';
  }

  if (phaseContext.classification?.goalType === 'RECURRENT_HABIT') {
    return 'habito';
  }

  return 'otro';
}

function convertPackageToGeneratedPlan(
  context: FlowRunnerV5Context,
  goalId: string,
  goalText: string,
  timezone: string,
  tokensUsed: { input: number; output: number }
): GeneratedPlan {
  if (!context.package) {
    throw new Error('V5 package missing after pipeline run.');
  }

  const defaultCategory = inferLegacyCategory(goalText, context);
  const eventos = context.package.plan.detail.weeks.flatMap((week) =>
    week.scheduledEvents.map((event) => {
      const localStart = DateTime.fromISO(event.startAt, { zone: 'utc' }).setZone(timezone);

      return {
        semana: week.weekIndex,
        dia: normalizeDayLabel(localStart.setLocale('es').toFormat('cccc')),
        hora: localStart.toFormat('HH:mm'),
        duracion: event.durationMin,
        actividad: event.title,
        categoria: defaultCategory,
        objetivoId: event.goalIds[0] || goalId
      } satisfies PlanEvent;
    })
  );

  return {
    nombre: `Plan V5 - ${goalText}`,
    resumen: context.package.summary_esAR,
    eventos,
    tokensUsed
  };
}

function toStageForPhase(phase: PipelinePhaseV5): { stage: string; current: number; total: number } {
  if (phase === 'package') {
    return { stage: 'saving', current: 4, total: 4 };
  }

  if (phase === 'hardValidate' || phase === 'softValidate' || phase === 'coveVerify' || phase === 'repair') {
    return { stage: 'validating', current: 3, total: 4 };
  }

  return { stage: 'generating', current: 2, total: 4 };
}

function skippedPhaseMessage(phase: PipelinePhaseV5): string {
  if (phase === 'repair') {
    return 'Repair skipped because the validation loop found no blocking issues.'
  }

  if (phase === 'adapt') {
    return 'Adapt skipped because there are no activity logs or user feedback for this run.'
  }

  return `Phase ${phase} was skipped.`
}

function isRepairLoopPhase(phase: PipelinePhaseV5): phase is RepairLoopPhase {
  return REPAIR_LOOP_PHASES.includes(phase as RepairLoopPhase)
}

function getRepairLoopCycle(phase: RepairLoopPhase, repairCycles: number): number {
  if (phase === 'repair') {
    return Math.max(repairCycles, 1)
  }

  return repairCycles + 1
}

function buildRepairFindings(context: FlowRunnerV5Context): Array<{ severity: string; message: string }> {
  return [
    ...(context.hardValidate?.findings ?? []).map((finding) => ({
      severity: finding.severity,
      message: finding.description
    })),
    ...(context.softValidate?.findings ?? []).map((finding) => ({
      severity: finding.severity,
      message: finding.suggestion_esAR
    })),
    ...(context.coveVerify?.findings ?? []).map((finding) => ({
      severity: finding.severity,
      message: finding.answer
    }))
  ]
}

function summarizeRepairLoopPhase(phase: RepairLoopPhase, output: unknown): string | null {
  const payload = output && typeof output === 'object'
    ? output as Record<string, unknown>
    : null

  if (!payload) {
    return null
  }

  if (phase === 'hardValidate') {
    const findings = Array.isArray(payload.findings) ? payload.findings : []
    return `${findings.length} FAIL`
  }

  if (phase === 'softValidate' || phase === 'coveVerify') {
    const findings = Array.isArray(payload.findings) ? payload.findings : []
    const failCount = findings.filter((finding) => {
      return finding && typeof finding === 'object' && (finding as Record<string, unknown>).severity === 'FAIL'
    }).length
    const warnCount = findings.filter((finding) => {
      return finding && typeof finding === 'object' && (finding as Record<string, unknown>).severity === 'WARN'
    }).length
    const infoCount = findings.filter((finding) => {
      return finding && typeof finding === 'object' && (finding as Record<string, unknown>).severity === 'INFO'
    }).length

    if (failCount > 0) {
      return `${failCount} FAIL`
    }

    if (warnCount > 0) {
      return `${warnCount} WARN`
    }

    return `${infoCount} INFO`
  }

  const patchesApplied = Array.isArray(payload.patchesApplied) ? payload.patchesApplied : []
  return `${patchesApplied.length} patches`
}

function extractRepairScores(output: unknown): { scoreBefore: number | null; scoreAfter: number | null } {
  const payload = output && typeof output === 'object'
    ? output as Record<string, unknown>
    : null

  return {
    scoreBefore: typeof payload?.scoreBefore === 'number' ? payload.scoreBefore : null,
    scoreAfter: typeof payload?.scoreAfter === 'number' ? payload.scoreAfter : null
  }
}

function getRepairAttemptFindings(
  contextSnapshot: ReturnType<ReturnType<typeof createPipelineRuntimeRecorder>['getSnapshot']>,
  cycle: number
): Array<{ severity: string; message: string }> {
  const match = contextSnapshot.repairAttempts
    .slice()
    .reverse()
    .find((attempt) => attempt.attempt === cycle)

  return match?.findings ?? []
}

function extractTraceMetrics(traceId: string | null, modelId: string): { input: number; output: number; charCount: number } {
  if (!traceId) {
    return { input: 0, output: 0, charCount: 0 };
  }

  const trace = traceCollector.getSnapshot().find((snapshot) => snapshot.traceId === traceId);
  if (!trace) {
    return { input: 0, output: 0, charCount: 0 };
  }

  return trace.spans
    .filter((span) => span.skillName === TRACE_SKILL_NAME && span.provider === modelId)
    .reduce((totals, span) => ({
      input: totals.input + (span.usage?.promptTokens ?? 0),
      output: totals.output + (span.usage?.completionTokens ?? 0),
      charCount: totals.charCount + (span.response?.length ?? 0)
    }), { input: 0, output: 0, charCount: 0 });
}

function createRunner(
  runtime: AgentRuntime,
  profile: Perfil,
  options: PlanGenerationOptions
): FlowRunnerV5 {
  const primaryGoal = getPrimaryGoal(profile);
  const schedulingContext = buildSchedulingContextFromProfile(profile);

  return new FlowRunnerV5({
    runtime,
    text: primaryGoal.text,
    answers: buildAnswers(profile, options.previousFindings, options.buildConstraints),
    timezone: schedulingContext.timezone,
    availability: schedulingContext.availability,
    blocked: schedulingContext.blocked,
    weekStartDate: schedulingContext.weekStartDate,
    goalId: primaryGoal.id,
    slackPolicy: {
      weeklyTimeBufferMin: 120,
      maxChurnMovesPerWeek: 3,
      frozenHorizonDays: 2
    }
  });
}

function resolveActiveExecution(
  nextModelId: string,
  requestedExecution: ResolvedPlanBuildExecution,
  fallbackExecution?: ResolvedPlanBuildExecution | null
): ResolvedPlanBuildExecution | null {
  if (requestedExecution.runtime && nextModelId === requestedExecution.runtime.modelId) {
    return requestedExecution;
  }

  if (fallbackExecution?.runtime && nextModelId === fallbackExecution.runtime.modelId) {
    return fallbackExecution;
  }

  return null;
}

function toV5PhaseSnapshot(
  snapshot: ReturnType<ReturnType<typeof createPipelineRuntimeRecorder>['getSnapshot']>,
  qualityScore: number,
): V5PhaseSnapshot {
  return {
    runId: snapshot.run.runId,
    modelId: snapshot.run.modelId,
    qualityScore,
    startedAt: snapshot.run.startedAt,
    finishedAt: snapshot.run.finishedAt,
    phaseTimeline: snapshot.phaseTimeline,
    phaseStatuses: snapshot.phaseStatuses,
    repairTimeline: snapshot.repairTimeline,
  };
}

export async function executePlanGenerationWorkflow(
  profile: Perfil,
  options: PlanGenerationOptions
): Promise<PlanGenerationOutcome> {
  const {
    profileId,
    thinkingMode,
    traceId: initialTraceId,
    requestedExecution,
    fallbackExecution,
    onProgress,
    onFallback
  } = options;

  if (!requestedExecution.executionContext.canExecute) {
    const error = new Error('PLAN_EXECUTION_BLOCKED');
    (error as { executionBlockReasonCode?: string | null }).executionBlockReasonCode = requestedExecution.executionContext.blockReasonCode;
    (error as { requestedExecution?: ResolvedPlanBuildExecution }).requestedExecution = requestedExecution;
    throw error;
  }

  if (!requestedExecution.runtime) {
    throw new Error('BUILD_RUNTIME_UNAVAILABLE');
  }

  const allowFallback = Boolean(fallbackExecution?.executionContext.canExecute && fallbackExecution.runtime);
  const timezone = getProfileTimezone(profile);
  const { id: goalId, text: goalText } = getPrimaryGoal(profile);
  const runtimeRecorder = createPipelineRuntimeRecorder({
    source: 'api-build',
    modelId: requestedExecution.runtime.modelId,
    goalText,
    profileId
  });

  let traceId = initialTraceId;
  if (!traceId) {
    traceId = traceCollector.startTrace(TRACE_SKILL_NAME, requestedExecution.runtime.modelId, {
      profileId,
      transport: 'api',
      executionMode: requestedExecution.executionContext.mode,
      resourceOwner: requestedExecution.executionContext.resourceOwner
    });
  }

  onProgress?.('preparing', 1, 4, 0);

  try {
    const buildResult = await buildWithOllamaFallback(
      requestedExecution.runtime.modelId,
      async (nextModelId) => {
        const activeExecution = resolveActiveExecution(nextModelId, requestedExecution, fallbackExecution);

        if (!activeExecution || !activeExecution.executionContext.canExecute || !activeExecution.runtime) {
          throw new Error(apiErrorMessages.localAssistantUnavailable());
        }

        runtimeRecorder.startRun({
          source: 'api-build',
          modelId: activeExecution.runtime.modelId,
          goalText,
          profileId
        });

        const runtime = getProvider(activeExecution.runtime.modelId, {
          apiKey: activeExecution.runtime.apiKey,
          baseURL: activeExecution.runtime.baseURL,
          thinkingMode
        });
        const instrumentedRuntime = createInstrumentedRuntime(
          runtime,
          traceId ?? null,
          TRACE_SKILL_NAME,
          activeExecution.runtime.modelId
        );
        const runner = createRunner(instrumentedRuntime, profile, options);
        const phaseSignals = new Set<string>();
        const context = await runner.runBuildPipeline({
          onPhaseStart: (phase, details) => {
            runtimeRecorder.markPhaseStart(phase, {
              startedAt: details?.startedAt ?? null,
              input: details?.input
            });

            if (isRepairLoopPhase(phase)) {
              const cycle = getRepairLoopCycle(phase, runtimeRecorder.getSnapshot().repairCycles)
              runtimeRecorder.markRepairCyclePhaseStart(cycle, phase, {
                startedAt: details?.startedAt ?? null
              })
            }

            const signal = toStageForPhase(phase);
            const signalKey = `${signal.stage}:${signal.current}`;

            if (!phaseSignals.has(signalKey)) {
              onProgress?.(signal.stage, signal.current, signal.total, 0);
              phaseSignals.add(signalKey);
            }
          },
          onPhaseSuccess: (phase, _result, io) => {
            runtimeRecorder.markPhaseSuccess(phase, io);

            if (isRepairLoopPhase(phase)) {
              const cycle = getRepairLoopCycle(phase, runtimeRecorder.getSnapshot().repairCycles)
              runtimeRecorder.markRepairCyclePhaseComplete(cycle, phase, 'success', {
                io,
                summaryLabel: summarizeRepairLoopPhase(phase, io?.output)
              })

              if (phase === 'repair') {
                const scores = extractRepairScores(io?.output)
                const snapshot = runtimeRecorder.getSnapshot()
                runtimeRecorder.finalizeRepairCycle(cycle, {
                  status: 'repaired',
                  findings: getRepairAttemptFindings(snapshot, cycle),
                  scoreBefore: scores.scoreBefore,
                  scoreAfter: scores.scoreAfter
                })
              }
            }

            if (phase === 'classify') {
              const domainCard = runner.getContext().domainCard;
              if (domainCard) {
                runtimeRecorder.setDomainCardMeta({
                  domainLabel: domainCard.domainLabel,
                  method: domainCard.generationMeta.method,
                  confidence: domainCard.generationMeta.confidence
                });
              }
            }
          },
          onPhaseFailure: (phase, error) => {
            runtimeRecorder.markPhaseFailure(phase, error);

            if (isRepairLoopPhase(phase)) {
              const cycle = getRepairLoopCycle(phase, runtimeRecorder.getSnapshot().repairCycles)
              runtimeRecorder.markRepairCyclePhaseComplete(cycle, phase, 'error', {
                summaryLabel: error.message
              })
            }
          },
          onPhaseSkipped: (phase) => {
            runtimeRecorder.markPhaseSkipped(phase, skippedPhaseMessage(phase));

            if (phase === 'repair') {
              const cycle = runtimeRecorder.getSnapshot().repairCycles + 1
              runtimeRecorder.markRepairCyclePhaseComplete(cycle, 'repair', 'skipped', {
                summaryLabel: 'Sin fallas'
              })
              runtimeRecorder.finalizeRepairCycle(cycle, {
                status: 'clean',
                findings: buildRepairFindings(runner.getContext())
              })
            }
          },
          onProgress: (phase, progress) => {
            runtimeRecorder.recordProgress(phase, progress);
          },
          onRepairAttempt: (attempt, maxAttempts, findings) => {
            runtimeRecorder.recordRepairAttempt(attempt, maxAttempts, findings);
          },
          onRepairExhausted: (repairCycles, remainingFindings) => {
            runtimeRecorder.markRepairExhausted();
            runtimeRecorder.markRepairCyclePhaseComplete(repairCycles, 'repair', 'exhausted', {
              summaryLabel: 'Agotado'
            })
            runtimeRecorder.finalizeRepairCycle(repairCycles, {
              status: 'exhausted',
              findings: remainingFindings
            })
          }
        });

        const metrics = extractTraceMetrics(traceId ?? null, activeExecution.runtime.modelId);
        if (!context.package) {
          throw new Error('V5 package missing after build pipeline run.');
        }

        return {
          generatedPlan: convertPackageToGeneratedPlan(
            context,
            goalId,
            goalText,
            timezone,
            { input: metrics.input, output: metrics.output }
          ),
          package: context.package,
        };
      },
      {
        allowFallback,
        onFallback: async (originalError) => {
          onFallback?.(
            requestedExecution.runtime!.modelId,
            fallbackExecution?.runtime?.modelId ?? DEFAULT_OLLAMA_FALLBACK_MODEL,
            originalError,
            requestedExecution.executionContext.mode,
            fallbackExecution?.executionContext.mode ?? null
          );
        }
      }
    );

    const finalExecution = buildResult.fallbackUsed && fallbackExecution
      ? fallbackExecution
      : requestedExecution;
    const metrics = extractTraceMetrics(traceId ?? null, buildResult.modelId);

    onProgress?.('saving', 4, 4, metrics.charCount);
    runtimeRecorder.setRunMetadata({
      modelId: finalExecution.runtime?.modelId ?? buildResult.modelId,
      tokensUsed: {
        input: metrics.input,
        output: metrics.output
      },
      resourceUsage: summarizeResourceUsage({
        executionContext: finalExecution.executionContext,
        billingPolicy: finalExecution.billingPolicy
      })
    })
    runtimeRecorder.completeRun('success');
    const runtimeSnapshot = runtimeRecorder.getSnapshot();
    if (traceId) {
      traceCollector.completeTrace(traceId);
    }

    return {
      result: {
        ...buildResult.result.generatedPlan,
        tokensUsed: {
          input: metrics.input,
          output: metrics.output
        }
      },
      package: buildResult.result.package,
      phaseSnapshot: toV5PhaseSnapshot(runtimeSnapshot, buildResult.result.package.qualityScore),
      adaptiveStatus: 'pending',
      fallbackUsed: buildResult.fallbackUsed,
      finalModelId: buildResult.modelId,
      requestedExecution,
      finalExecution,
      streamedCharCount: metrics.charCount
    };
  } catch (error) {
    const failedMetrics = extractTraceMetrics(traceId ?? null, requestedExecution.runtime.modelId)
    runtimeRecorder.setRunMetadata({
      tokensUsed: {
        input: failedMetrics.input,
        output: failedMetrics.output
      },
      resourceUsage: summarizeResourceUsage({
        executionContext: requestedExecution.executionContext,
        billingPolicy: requestedExecution.billingPolicy
      })
    })
    runtimeRecorder.completeRun('error', {
      message: error instanceof Error ? error.message : String(error)
    });
    if (traceId) {
      traceCollector.failTrace(traceId, error);
    }
    throw error;
  }
}
