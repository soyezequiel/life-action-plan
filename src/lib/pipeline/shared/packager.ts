import { DateTime } from 'luxon';

import { t } from '../../../i18n';
import { mergeHabitStateForReplan, type HabitState } from '../../domain/habit-state';
import type { GoalClassification } from '../../domain/goal-taxonomy';
import {
  V5PlanSchema,
  type OperationalBuffer,
  type OperationalDay,
  type SkeletonFrequency,
  type SkeletonPhase,
  type V5Detail,
  type V5Operational,
  type V5Plan,
  type V5Skeleton,
} from '../../domain/rolling-wave-plan';
import { SlackPolicySchema, type SlackPolicy } from '../../domain/slack-policy';
import type { FlexTaskItem, MetricItem, MilestoneItem, PlanItem, TimeEventItem, TriggerRuleItem } from '../../domain/plan-item';
import type {
  CoVeFinding,
  HardFinding,
  PackageInput,
  PlanPackage,
  SoftFinding,
  StrategicRoadmap,
} from './phase-io';

const DETAIL_HORIZON_WEEKS = 2;
const SKELETON_HORIZON_WEEKS = 12;
const OPERATIONAL_HORIZON_DAYS = 7;
const DEFAULT_SLACK_POLICY = SlackPolicySchema.parse({
  weeklyTimeBufferMin: 120,
  maxChurnMovesPerWeek: 3,
  frozenHorizonDays: 2,
});

const VALIDATION_WARNING_TEXT = {
  blocked: 'Este paquete quedo bloqueado y no conviene usarlo todavia.',
  degraded: 'Este paquete quedo con advertencias importantes y conviene revisarlo antes de usarlo.',
} as const;

const GENERIC_GOAL_TOKENS = new Set([
  'plan',
  'objetivo',
  'meta',
  'hacer',
  'querer',
  'quiero',
  'aprender',
  'mejorar',
  'seguir',
  'sostener',
  'avanzar',
  'trabajar',
  'rutina',
  'semana',
  'mes',
  'meses',
  'año',
  'ano',
  'year',
  'years',
  'week',
  'weeks',
]);

const TOKEN_SYNONYMS = new Map<string, string>([
  ['correr', 'run'],
  ['corriendo', 'run'],
  ['corrida', 'run'],
  ['running', 'run'],
  ['run', 'run'],
  ['jog', 'run'],
  ['jogging', 'run'],
  ['trote', 'run'],
  ['trote', 'run'],
  ['guitarra', 'guitar'],
  ['guitar', 'guitar'],
  ['ingles', 'english'],
  ['ingleses', 'english'],
  ['english', 'english'],
  ['idioma', 'language'],
  ['idiomas', 'language'],
  ['cocinar', 'cook'],
  ['cocina', 'cook'],
  ['cocinando', 'cook'],
  ['cooking', 'cook'],
  ['cook', 'cook'],
  ['receta', 'cook'],
  ['recetas', 'cook'],
  ['plato', 'cook'],
  ['platos', 'cook'],
  ['pastas', 'pasta'],
  ['pasta', 'pasta'],
  ['italiano', 'italian'],
  ['italiana', 'italian'],
  ['italianos', 'italian'],
  ['italianas', 'italian'],
  ['weight', 'weight'],
  ['peso', 'weight'],
  ['kilo', 'weight'],
  ['kilos', 'weight'],
  ['kg', 'weight'],
  ['bajar', 'lose'],
  ['perder', 'lose'],
  ['adelgazar', 'lose'],
  ['salud', 'health'],
  ['fitness', 'health'],
  ['medico', 'medical'],
  ['médico', 'medical'],
  ['profesional', 'professional'],
  ['supervision', 'supervision'],
  ['supervisión', 'supervision'],
  ['principiante', 'beginner'],
  ['basico', 'basic'],
  ['básico', 'basic'],
  ['basica', 'basic'],
  ['básica', 'basic'],
  ['consolidacion', 'consolidation'],
  ['consolidación', 'consolidation'],
  ['practica', 'practice'],
  ['práctica', 'practice'],
  ['guiada', 'guided'],
]);

const STOP_WORDS = new Set([
  'a',
  'al',
  'con',
  'de',
  'del',
  'el',
  'en',
  'la',
  'las',
  'los',
  'para',
  'por',
  'que',
  'un',
  'una',
  'uno',
  'y',
  'sin',
  'sobre',
  'mi',
  'tu',
  'su',
  'se',
  'es',
  'son',
  'ser',
  'este',
  'esta',
  'esto',
  'estas',
  'estos',
]);

const STRUCTURAL_PHASE_PATTERNS = [
  /\bbase(?: tecnica)?\b/i,
  /\bfundamentos?\b/i,
  /\bintroduccion\b/i,
  /\bconsolidacion\b/i,
  /\bconsolidación\b/i,
  /\bfase(?:\s+\d+)?\b/i,
  /\betapa(?:\s+\d+)?\b/i,
  /\bpractica guiada\b/i,
  /\baprendizaje\b/i,
  /\bprogresion\b/i,
  /\bprogresión\b/i,
];

const HEALTH_RISK_PATTERNS = [
  /\b(bajar de peso|perder peso|adelgaz|sobrepeso|obesidad|peso|kg\b|kilos?|imc|bmi|cintura|medidas|fitness|salud)\b/i,
  /\b(50\s*kg|drastic|extrem|rapido|rápido|30 dias|30 días|12 meses|1 año|un año)\b/i,
];

const SAFETY_PATTERNS = [
  /\b(profesional|medico|médico|supervision|supervisión|seguimiento|consulta|nutricion|nutrición|control|especialista)\b/i,
];

const NEGATED_SAFETY_PATTERNS = [
  /\b(no|sin|ningun|ninguna|falta(?:n)?|carece(?:n)?|omite|omitir|evita(?:r)?|rechaza(?:r)?)\b.{0,60}\b(profesional|medico|médico|supervision|supervisión|seguimiento|consulta|nutricion|nutrición|control|especialista|nutricionista|acompanamiento|acompañamiento)\b/i,
  /\b(profesional|medico|médico|supervision|supervisión|seguimiento|consulta|nutricion|nutrición|control|especialista|nutricionista|acompanamiento|acompañamiento)\b.{0,30}\b(no|sin|ausente|inexistente)\b/i,
  /\bno\s+(?:tengo|hay|cuento|contamos|dispongo|dispone|quiero\s+basar)\b.{0,80}\b(profesional|medico|médico|supervision|supervisión|seguimiento|consulta|nutricion|nutrición|control|especialista|nutricionista|acompanamiento|acompañamiento)\b/i,
];

export type PackageValidationStatus = 'ok' | 'degraded' | 'blocked';

export interface PackageValidationIssue {
  code:
    | 'goal_mismatch'
    | 'domain_mismatch'
    | 'calendar_phase_leak'
    | 'semantic_nonsense'
    | 'health_safety_gap'
    | 'intake_signals_missing'
    | 'low_concreteness';
  severity: 'block' | 'warn';
  message: string;
  evidence: string[];
}

export interface PackageValidationInput {
  goalText: string;
  package: Pick<PlanPackage, 'plan' | 'items' | 'warnings' | 'summary_esAR' | 'qualityScore' | 'implementationIntentions' | 'tradeoffs'>;
  classification?: GoalClassification;
  requestedDomain?: string | null;
  clarificationAnswers?: Record<string, string>;
  goalSignalsSnapshot?: PackageInput['goalSignalsSnapshot'];
}

export interface PackageValidationResult {
  status: PackageValidationStatus;
  issues: PackageValidationIssue[];
  scorePenalty: number;
  requestDomain: PlanPackage['requestDomain'];
  packageDomain: PlanPackage['packageDomain'];
  intakeCoverage: PlanPackage['intakeCoverage'];
}

function normalizeComparableGoalText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalizeToken(token: string): string {
  const normalized = normalizeComparableGoalText(token);
  if (!normalized) {
    return '';
  }

  if (TOKEN_SYNONYMS.has(normalized)) {
    return TOKEN_SYNONYMS.get(normalized) ?? normalized;
  }

  if (normalized.endsWith('es') && normalized.length > 4) {
    const base = normalized.slice(0, -2);
    if (TOKEN_SYNONYMS.has(base)) {
      return TOKEN_SYNONYMS.get(base) ?? base;
    }
    return base;
  }

  if (normalized.endsWith('s') && normalized.length > 4) {
    const base = normalized.slice(0, -1);
    if (TOKEN_SYNONYMS.has(base)) {
      return TOKEN_SYNONYMS.get(base) ?? base;
    }
    return base;
  }

  return normalized;
}

function tokenizeMeaningfulText(value: string): string[] {
  return normalizeComparableGoalText(value)
    .split(' ')
    .map((token) => canonicalizeToken(token))
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function uniqueTokens(values: string[]): Set<string> {
  return new Set(
    values
      .flatMap((value) => tokenizeMeaningfulText(value))
      .filter((token) => token.length > 0),
  );
}

function ratioOfOverlap(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.min(left.size, right.size);
}

function isNearDuplicateText(left: string, right: string): boolean {
  const normalizedLeft = normalizeComparableGoalText(left);
  const normalizedRight = normalizeComparableGoalText(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return true;
  }

  const leftTokens = new Set(tokenizeMeaningfulText(normalizedLeft));
  const rightTokens = new Set(tokenizeMeaningfulText(normalizedRight));
  const smallerSize = Math.min(leftTokens.size, rightTokens.size);

  // Short labels (≤ 3 meaningful tokens) share domain vocabulary too easily
  // to be flagged by ratio alone. Exact match and substring checks above
  // still catch true duplicates.
  if (smallerSize <= 3) {
    return false;
  }

  return ratioOfOverlap(leftTokens, rightTokens) >= 0.8;
}

function isStructuralPhaseLabel(value: string): boolean {
  const normalized = normalizeComparableGoalText(value);
  if (!normalized) {
    return false;
  }

  if (/\b(receta|recetas|salsa|salsas|mise en place|pasta|pastas|cocinar|lectura|emplatado|ciclismo|natacion|fuerza|chequeo|supervision)\b/.test(normalized)) {
    return false;
  }

  return STRUCTURAL_PHASE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function hasSafetyFraming(texts: string[]): boolean {
  return texts.some((text) => hasAffirmativeSafetyFraming(text));
}

function hasAffirmativeSafetyFraming(text: string): boolean {
  const normalized = normalizeComparableText(text);
  if (!normalized) {
    return false;
  }

  if (!SAFETY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  return !NEGATED_SAFETY_PATTERNS.some((pattern) => pattern.test(normalized));
}

function hasNegatedSafetyContext(value: string | null | undefined): boolean {
  const normalized = normalizeComparableText(value);
  if (!normalized) {
    return false;
  }

  return NEGATED_SAFETY_PATTERNS.some((pattern) => pattern.test(normalized));
}

function looksLikeHealthRisk(goalText: string, classification?: GoalClassification): boolean {
  if (classification?.risk === 'HIGH_HEALTH') {
    return true;
  }

  const normalized = normalizeComparableGoalText(goalText);
  return HEALTH_RISK_PATTERNS.some((pattern) => pattern.test(normalized));
}

function collectPackageTexts(input: PackageValidationInput): string[] {
  const timeEventTitles = input.package.items
    .filter((item): item is Extract<PlanItem, { kind: 'time_event' }> => item.kind === 'time_event')
    .map((item) => `${item.title} ${item.notes ?? ''}`);
  const phaseTexts = input.package.plan.skeleton.phases.map((phase) => `${phase.title} ${phase.objectives.join(' ')}`);
  const milestoneTexts = input.package.plan.skeleton.milestones.map((milestone) => `${milestone.title} ${milestone.notes ?? ''}`);

  return [
    ...timeEventTitles,
    ...phaseTexts,
    ...milestoneTexts,
  ];
}

function buildValidationPenalty(issues: PackageValidationIssue[]): number {
  return issues.reduce((total, issue) => total + (issue.severity === 'block' ? 50 : 12), 0);
}

function buildValidationStatus(issues: PackageValidationIssue[], packageScore: number): PackageValidationStatus {
  if (issues.some((issue) => issue.severity === 'block')) {
    return 'blocked';
  }

  if (issues.length > 0 || packageScore < 70) {
    return 'degraded';
  }

  return 'ok';
}

function buildValidationWarning(status: PackageValidationStatus): string | null {
  if (status === 'blocked') {
    return VALIDATION_WARNING_TEXT.blocked;
  }

  if (status === 'degraded') {
    return VALIDATION_WARNING_TEXT.degraded;
  }

  return null;
}

function buildValidationPublicationState(validation: PackageValidationResult): NonNullable<PlanPackage['publicationState']> {
  if (validation.issues.some((issue) => issue.code === 'health_safety_gap' && issue.severity === 'block')) {
    return 'requires_supervision';
  }

  if (validation.status === 'blocked') {
    return 'failed_for_quality_review';
  }

  if (validation.status === 'degraded') {
    return 'requires_regeneration';
  }

  return 'publishable';
}

function getGoalSignalSnapshotAnswer(
  snapshot: PackageInput['goalSignalsSnapshot'],
  signalKey: string,
): string | null {
  return snapshot?.normalizedUserAnswers.find((answer) => answer.signalKey === signalKey)?.answer ?? null;
}

function collectSignalEvidence(expectedValue: string, packageTokens: Set<string>): string[] {
  return tokenizeMeaningfulText(expectedValue).filter((token) => packageTokens.has(token));
}

function matchesSignalValue(
  expectedValue: string | null | undefined,
  normalizedPackageText: string,
  packageTokens: Set<string>,
): { used: boolean; evidence: string[] } {
  const normalizedExpectedValue = normalizeComparableText(expectedValue);
  if (!normalizedExpectedValue) {
    return { used: false, evidence: [] };
  }

  if (normalizedPackageText.includes(normalizedExpectedValue)) {
    return { used: true, evidence: [normalizedExpectedValue] };
  }

  const evidence = collectSignalEvidence(normalizedExpectedValue, packageTokens);
  const expectedTokens = tokenizeMeaningfulText(normalizedExpectedValue);
  const hasNumericEvidence = expectedTokens.some((token) => /\d/.test(token)) && evidence.length > 0;
  const used = evidence.length >= Math.min(expectedTokens.length, 2)
    || (expectedTokens.length <= 2 && evidence.length >= 1)
    || hasNumericEvidence;

  return {
    used,
    evidence,
  };
}

function matchTimeframeSignal(
  input: PackageInput,
  expectedValue: string | null | undefined,
  normalizedPackageText: string,
  packageTokens: Set<string>,
): { used: boolean; evidence: string[] } {
  const directMatch = matchesSignalValue(expectedValue, normalizedPackageText, packageTokens);
  if (directMatch.used) {
    return directMatch;
  }

  const requestedWeeks = parseHorizonWeeks(expectedValue ?? null);
  const roadmapWeeks = input.roadmap
    ? resolveRoadmapHorizonWeeks(input.roadmap)
    : 0;

  if (!requestedWeeks || roadmapWeeks <= 0) {
    return directMatch;
  }

  const minAcceptedWeeks = Math.max(1, Math.floor(requestedWeeks * 0.7));
  const maxAcceptedWeeks = Math.max(minAcceptedWeeks, Math.ceil(requestedWeeks * 1.35));
  if (roadmapWeeks >= minAcceptedWeeks && roadmapWeeks <= maxAcceptedWeeks) {
    return {
      used: true,
      evidence: [`${roadmapWeeks} semanas`],
    };
  }

  return directMatch;
}

function buildSnapshotSignalUsage(
  input: PackageInput,
  normalizedPackageText: string,
  packageTokens: Set<string>,
): NonNullable<PlanPackage['intakeCoverage']> {
  const signalUsage: NonNullable<PlanPackage['intakeCoverage']>['signalUsage'] = [];
  const requiredSignals: string[] = [];
  const snapshot = input.goalSignalsSnapshot;

  const registerSignal = (signal: string, expectedValue: string | null | undefined) => {
    if (!expectedValue || !expectedValue.trim()) {
      return;
    }

    requiredSignals.push(signal);
    const match = signal === 'timeframe'
      ? matchTimeframeSignal(input, expectedValue, normalizedPackageText, packageTokens)
      : matchesSignalValue(expectedValue, normalizedPackageText, packageTokens);
    signalUsage.push({
      signal,
      expectedValue,
      used: match.used,
      evidence: match.evidence,
    });
  };

  registerSignal('metric', snapshot?.metric ?? null);
  registerSignal('timeframe', snapshot?.timeframe ?? null);
  registerSignal('modality', getGoalSignalSnapshotAnswer(snapshot, 'modality'));
  registerSignal('current_baseline', getGoalSignalSnapshotAnswer(snapshot, 'current_baseline'));
  registerSignal('success_criteria', getGoalSignalSnapshotAnswer(snapshot, 'success_criteria'));
  registerSignal('constraints', getGoalSignalSnapshotAnswer(snapshot, 'constraints'));
  registerSignal('safety_context', getGoalSignalSnapshotAnswer(snapshot, 'safety_context'));

  if ((snapshot?.anchorTokens.length ?? 0) > 0) {
    const expectedValue = snapshot?.anchorTokens.join(', ') ?? '';
    const evidence = snapshot?.anchorTokens.filter((token) => packageTokens.has(canonicalizeToken(token))) ?? [];
    const minimumMatches = Math.max(1, Math.min(2, Math.ceil((snapshot?.anchorTokens.length ?? 0) / 2)));
    requiredSignals.push('anchor_tokens');
    signalUsage.push({
      signal: 'anchor_tokens',
      expectedValue,
      used: evidence.length >= minimumMatches,
      evidence,
    });
  }

  return {
    requiredSignals: uniqueNonEmpty(requiredSignals),
    missingSignals: uniqueNonEmpty(signalUsage.filter((usage) => !usage.used).map((usage) => usage.signal)),
    signalUsage,
  };
}

export function evaluatePackageValidation(input: PackageValidationInput): PackageValidationResult {
  const goalTokens = new Set(
    Array.from(uniqueTokens([input.goalText])).filter((token) => !GENERIC_GOAL_TOKENS.has(token)),
  );
  const packageTexts = collectPackageTexts(input);
  const packageTokens = uniqueTokens(packageTexts);
  const issues: PackageValidationIssue[] = [];
  const requestDomain = canonicalizeKnownDomain(input.requestedDomain);
  const packageDomain = requestDomain
    ? inferKnownDomain(packageTexts.join(' '))
    : null;
  const intakeCoverage = buildSignalUsage({
    goalText: input.goalText,
    classification: input.classification,
    requestedDomain: requestDomain,
    clarificationAnswers: input.clarificationAnswers,
    goalSignalsSnapshot: input.goalSignalsSnapshot,
    roadmap: {
      phases: input.package.plan.skeleton.phases.map((phase) => ({
        name: phase.title,
        durationWeeks: Math.max(1, phase.endWeek - phase.startWeek + 1),
        focus_esAR: phase.objectives.join(' '),
      })),
      milestones: input.package.plan.skeleton.milestones.map((milestone) => milestone.title),
    },
    finalSchedule: {
      events: input.package.items.filter((item): item is TimeEventItem => item.kind === 'time_event'),
      unscheduled: [],
      metrics: {
        fillRate: 0,
        solverTimeMs: 0,
        solverStatus: 'not_run',
      },
      tradeoffs: input.package.tradeoffs ?? [],
    },
    timezone: input.package.plan.timezone,
  }, packageTexts.join(' '));
  const criticalValidationSignals = new Set([
    'metric',
    'timeframe',
    'modality',
    'current_baseline',
    'success_criteria',
    'constraints',
    'anchor_tokens',
    'safety_context',
  ]);
  const criticalSignalLosses = (intakeCoverage?.signalUsage ?? []).filter((usage) =>
    !usage.used && criticalValidationSignals.has(usage.signal),
  );
  const degradedSkip = input.goalSignalsSnapshot?.clarificationMode === 'degraded_skip';
  const blockingMissingSignals = criticalSignalLosses.filter((usage) =>
    usage.signal === 'metric' || usage.signal === 'timeframe' || usage.signal === 'safety_context',
  );
  const confirmedCriticalSignals = (intakeCoverage?.signalUsage ?? []).filter((usage) =>
    usage.used && criticalValidationSignals.has(usage.signal),
  );
  const confirmedOverlaySignals = (intakeCoverage?.signalUsage ?? []).filter((usage) =>
    usage.used && !criticalValidationSignals.has(usage.signal),
  );

  const contentOverlap = ratioOfOverlap(goalTokens, packageTokens);
  const hasUsefulDomainOverlay = Boolean(requestDomain && packageDomain && requestDomain === packageDomain);
  const hasSemanticAlignment = contentOverlap >= 0.1
    || confirmedCriticalSignals.length > 0
    || confirmedOverlaySignals.length > 0
    || hasUsefulDomainOverlay;
  const losesCriticalGoalSignals = blockingMissingSignals.length > 0
    || (
      criticalSignalLosses.some((usage) => usage.signal === 'modality')
      && criticalSignalLosses.some((usage) => usage.signal === 'anchor_tokens')
      && !hasSemanticAlignment
    );
  const fallbackGoalMismatch = !input.goalSignalsSnapshot
    && requestDomain !== null
    && (intakeCoverage?.requiredSignals.length ?? 0) === 0
    && goalTokens.size >= 2
    && packageTokens.size > 0
    && contentOverlap < 0.2
    && !hasSemanticAlignment;
  if ((losesCriticalGoalSignals && !degradedSkip) || fallbackGoalMismatch) {
    const goalMismatchEvidence = blockingMissingSignals.length > 0
      ? blockingMissingSignals.map((usage) => `${usage.signal}: ${usage.expectedValue}`)
      : criticalSignalLosses.length > 0
        ? criticalSignalLosses.map((usage) => `${usage.signal}: ${usage.expectedValue}`)
        : [
          `overlap=${contentOverlap.toFixed(2)}`,
          `request_domain=${requestDomain ?? 'none'}`,
          `package_domain=${packageDomain ?? 'none'}`,
        ];
    issues.push({
      code: 'goal_mismatch',
      severity: 'block',
      message: blockingMissingSignals.length > 0
        ? `[Alineación] El paquete pierde señales críticas del intake (${blockingMissingSignals.map((usage) => usage.signal).join(', ')}) y queda desalineado con el objetivo.`
        : '[Alineación] El paquete no conserva alineación semántica suficiente con el objetivo original.',
      evidence: goalMismatchEvidence,
    });
  }

  if (requestDomain && packageDomain && requestDomain !== packageDomain) {
    issues.push({
      code: 'domain_mismatch',
      severity: 'warn',
      message: `[Dominio] El paquete activa señales del dominio "${packageDomain}" aunque el overlay pedido era "${requestDomain}".`,
      evidence: [requestDomain, packageDomain],
    });
  }

  const scheduledEventTitles = input.package.items
    .filter((item): item is Extract<PlanItem, { kind: 'time_event' }> => item.kind === 'time_event')
    .map((item) => item.title);
  const phaseTitles = input.package.plan.skeleton.phases.map((phase) => phase.title);

  for (const title of scheduledEventTitles) {
    if (isStructuralPhaseLabel(title)) {
      issues.push({
        code: 'semantic_nonsense',
        severity: 'block',
        message: '[Calidad] Hay un evento de calendario con una etiqueta estructural en vez de una tarea concreta.',
        evidence: [title],
      });
      continue;
    }

    if (phaseTitles.some((phaseTitle) => isNearDuplicateText(title, phaseTitle))) {
      issues.push({
        code: 'calendar_phase_leak',
        severity: 'block',
        message: '[Estructura] Un evento de calendario repite o copia el nombre de una fase en vez de describir una acción concreta.',
        evidence: [title, ...phaseTitles],
      });
    }
  }

  for (const phase of input.package.plan.skeleton.phases) {
    if (hasSemanticNonsense(phase.title)) {
      issues.push({
        code: 'semantic_nonsense',
        severity: 'block',
        message: '[Calidad] Hay una fase con texto semánticamente inválido en vez de una descripción concreta.',
        evidence: [phase.title],
      });
    }

    const objectiveText = phase.objectives.join(' ');
    if (objectiveText && hasSemanticNonsense(objectiveText)) {
      issues.push({
        code: 'semantic_nonsense',
        severity: 'block',
        message: 'La fase contiene un objetivo semanticamente invalido o demasiado generico.',
        evidence: [phase.title, objectiveText],
      });
    }
  }

  for (const milestone of input.package.plan.skeleton.milestones) {
    if (hasSemanticNonsense(milestone.title)) {
      issues.push({
        code: 'semantic_nonsense',
        severity: 'block',
        message: 'Hay un hito semanticamente invalido en el paquete.',
        evidence: [milestone.title],
      });
    }
  }

  if (looksLikeHealthRisk(input.goalText, input.classification)) {
    const safetyTexts = [
      input.goalText,
      input.package.summary_esAR,
      ...input.package.warnings,
      ...input.package.implementationIntentions,
      ...input.package.plan.skeleton.phases.flatMap((phase) => [phase.title, ...phase.objectives]),
      ...scheduledEventTitles,
    ];
    const healthSignals = extractHealthSignals(input.goalText, input.clarificationAnswers);

    if (hasNegatedSafetyContext(healthSignals.support) || !hasSafetyFraming(safetyTexts)) {
      issues.push({
        code: 'health_safety_gap',
        severity: 'block',
        message: '[Seguridad] Para una meta de salud de alto riesgo hace falta una referencia clara a supervisión profesional o seguimiento médico.',
        evidence: uniqueNonEmpty([
          input.goalText,
          healthSignals.support ?? '',
        ]),
      });
    }
  }

  const concreteEvents = scheduledEventTitles.filter((title) => !isStructuralPhaseLabel(title));
  if (concreteEvents.length === 0) {
    issues.push({
      code: 'low_concreteness',
      severity: 'warn',
      message: '[Estructura] No quedaron acciones semanales concretas suficientes; la agenda sigue demasiado estructural.',
      evidence: scheduledEventTitles.slice(0, 3),
    });
  }

  if ((intakeCoverage?.missingSignals?.length ?? 0) > 0) {
    const missingBlockingSignals = (intakeCoverage?.missingSignals ?? []).filter((signal) =>
      signal === 'metric' || signal === 'timeframe' || signal === 'safety_context',
    );
    if (degradedSkip || missingBlockingSignals.length > 0) {
      issues.push({
        code: 'intake_signals_missing',
        severity: degradedSkip ? 'warn' : 'block',
        message: degradedSkip
          ? `[Intake] El plan avanza con degraded_skip y deja señales incompletas o poco visibles: ${intakeCoverage?.missingSignals.join(', ')}.`
          : `[Intake] El plan no reutiliza señales críticas del intake: ${missingBlockingSignals.join(', ')}.`,
        evidence: intakeCoverage?.missingSignals ?? [],
      });
    }
  }

  if (degradedSkip && (input.goalSignalsSnapshot?.missingCriticalSignals.length ?? 0) > 0) {
    issues.push({
      code: 'intake_signals_missing',
      severity: 'warn',
      message: `El plan se construyo en modo degraded_skip; quedan huecos explicitados en ${input.goalSignalsSnapshot?.missingCriticalSignals.join(', ')} y conviene revisarlos antes de ejecutarlo.`,
      evidence: input.goalSignalsSnapshot?.missingCriticalSignals ?? [],
    });
  }

  const status = buildValidationStatus(issues, input.package.qualityScore);

  return {
    status,
    issues,
    scorePenalty: buildValidationPenalty(issues),
    requestDomain,
    packageDomain,
    intakeCoverage,
  };
}

function buildValidatedWarnings(baseWarnings: string[], validation: PackageValidationResult): string[] {
  const warnings = new Set(baseWarnings);

  for (const issue of validation.issues) {
    warnings.add(issue.message);
  }

  const statusWarning = buildValidationWarning(validation.status);
  if (statusWarning) {
    warnings.add(statusWarning);
  }

  return Array.from(warnings);
}

function buildValidatedQualityScore(baseScore: number, validation: PackageValidationResult): number {
  if (validation.status === 'blocked') {
    return 0;
  }

  return Math.max(0, Math.min(100, baseScore - validation.scorePenalty));
}

function buildValidatedSummary(
  goalText: string | undefined,
  eventCount: number,
  roadmap: StrategicRoadmap | undefined,
  qualityScore: number,
  warningCount: number,
  validationStatus: PackageValidationStatus,
): string {
  const roadmapWeeks = roadmap?.phases.length
    ? roadmap.phases.reduce((total, phase) => total + Math.max(1, phase.durationWeeks ?? 2), 0)
    : 0;
  const phasesText = roadmap?.phases.length
    ? ` Lo organizamos en ${roadmap.phases.length} etapas a lo largo de ${roadmapWeeks} semanas para que no quieras hacer todo de golpe.`
    : '';
  const warningsText = warningCount > 0
    ? ` Ojo: hay ${warningCount} advertencia${warningCount === 1 ? '' : 's'} para mirar con calma.`
    : '';
  const statusText = validationStatus === 'blocked'
    ? ' El paquete quedo bloqueado porque todavia no queda coherente con el pedido original.'
    : validationStatus === 'degraded'
      ? ' Hay alertas importantes y conviene revisarlo antes de usarlo.'
      : '';

  if (eventCount === 0) {
    return `Este plan ordena${goalText ? ` "${goalText}"` : ' tu objetivo'} en etapas e hitos.${phasesText} Todavia no lo baja a bloques concretos de calendario para esta semana.${warningsText}${statusText}`;
  }

  return `Este plan convierte${goalText ? ` "${goalText}"` : ' tu objetivo'} en ${eventCount} bloques concretos para esta semana.${phasesText} El puntaje de calidad actual es ${qualityScore}/100.${warningsText}${statusText}`;
}

function hasValidationProjection(pkg: PlanPackage, validation: PackageValidationResult): boolean {
  const statusWarning = buildValidationWarning(validation.status);
  const expectedPublicationState = buildValidationPublicationState(validation);
  const expectedDegraded = validation.status !== 'ok';

  return pkg.publicationState === expectedPublicationState
    && pkg.degraded === expectedDegraded
    && pkg.requestDomain === validation.requestDomain
    && pkg.packageDomain === validation.packageDomain
    && pkg.intakeCoverage?.requiredSignals.length === validation.intakeCoverage?.requiredSignals.length
    && pkg.intakeCoverage?.missingSignals.length === validation.intakeCoverage?.missingSignals.length
    && validation.issues.every((issue) => pkg.warnings.includes(issue.message))
    && (!statusWarning || pkg.warnings.includes(statusWarning));
}

function buildValidatedMetricItems(items: PlanItem[], qualityScore: number): PlanItem[] {
  return items.map((item) => {
    if (item.kind !== 'metric' || item.id !== 'metric-plan-quality') {
      return item;
    }

    return {
      ...item,
      target: {
        ...item.target,
        targetValue: Math.max(qualityScore, 85),
      },
      series: [
        {
          at: item.series?.[0]?.at ?? item.createdAt,
          value: qualityScore,
        },
      ],
    };
  });
}

export function projectValidatedPackage(
  pkg: PlanPackage,
  validation: PackageValidationResult,
  goalText?: string,
): PlanPackage {
  if (hasValidationProjection(pkg, validation)) {
    return pkg;
  }

  const warnings = buildValidatedWarnings(pkg.warnings, validation);
  const qualityScore = buildValidatedQualityScore(pkg.qualityScore, validation);

  return {
    ...pkg,
    items: buildValidatedMetricItems(pkg.items, qualityScore),
    warnings,
    qualityScore,
    summary_esAR: buildValidatedSummary(
      goalText,
      pkg.items.filter((item): item is TimeEventItem => item.kind === 'time_event').length,
      {
        phases: pkg.plan.skeleton.phases.map((phase) => ({
          name: phase.title,
          durationWeeks: Math.max(1, phase.endWeek - phase.startWeek + 1),
          focus_esAR: phase.objectives[0] ?? phase.title,
        })),
        milestones: pkg.plan.skeleton.milestones.map((milestone) => milestone.title),
      },
      qualityScore,
      warnings.length,
      validation.status,
    ),
    publicationState: buildValidationPublicationState(validation),
    qualityIssues: validation.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity === 'block' ? 'blocking' : 'warning',
      message: issue.message,
    })),
    requestDomain: validation.requestDomain ?? null,
    packageDomain: validation.packageDomain ?? null,
    intakeCoverage: validation.intakeCoverage ?? null,
    degraded: validation.status !== 'ok',
  };
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeComparableText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

type KnownDomain = 'cocina-italiana' | 'salud' | 'running' | 'guitarra' | 'idiomas';

const DOMAIN_KEYWORDS: Record<KnownDomain, string[]> = {
  'cocina-italiana': ['cocina', 'cocinar', 'italiana', 'italiano', 'italianas', 'italianos', 'pasta', 'pastas', 'salsa', 'salsas', 'receta', 'recetas', 'libro', 'libros'],
  salud: ['salud', 'peso', 'kg', 'kilo', 'kilos', 'bajar', 'adelgazar', 'cintura', 'imc', 'bmi', 'caminar', 'caminata', 'natacion', 'ciclismo', 'bici', 'movilidad'],
  running: ['running', 'correr', 'trote', 'ritmo'],
  guitarra: ['guitarra', 'acordes', 'repertorio'],
  idiomas: ['idioma', 'idiomas', 'ingles', 'frances', 'italiano', 'vocabulario', 'conversacion'],
};

const DOMAIN_ALIASES: Record<KnownDomain, string[]> = {
  'cocina-italiana': ['cocina-italiana', 'cocina italiana', 'cocina', 'cooking', 'cook', 'italian cooking', 'italian cuisine'],
  salud: ['salud', 'health', 'health-weight', 'health-weight-loss', 'weight-loss', 'weight loss', 'fitness', 'wellness'],
  running: ['running', 'run', 'correr'],
  guitarra: ['guitarra', 'guitar'],
  idiomas: ['idiomas', 'idioma', 'language', 'languages'],
};

function canonicalizeKnownDomain(domain: string | null | undefined): KnownDomain | null {
  const normalized = normalizeComparableText(domain ?? '');
  if (!normalized) {
    return null;
  }

  for (const [knownDomain, aliases] of Object.entries(DOMAIN_ALIASES) as Array<[KnownDomain, string[]]>) {
    if (aliases.some((alias) => normalizeComparableText(alias) === normalized)) {
      return knownDomain;
    }
  }

  return null;
}

function inferKnownDomain(text: string): KnownDomain | null {
  const normalized = normalizeComparableText(text);
  let bestDomain: KnownDomain | null = null;
  let bestScore = 0;

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS) as Array<[KnownDomain, string[]]>) {
    const score = keywords.reduce((total, keyword) =>
      total + (new RegExp(`(?:^|\\s)${keyword}(?:$|\\s)`, 'u').test(normalized) ? 1 : 0), 0);
    if (score > bestScore) {
      bestDomain = domain;
      bestScore = score;
    }
  }

  return bestScore > 0 ? bestDomain : null;
}

function extractAnswerValues(answers: Record<string, string> | undefined): string[] {
  if (!answers) {
    return [];
  }

  return uniqueNonEmpty(Object.values(answers));
}

function extractCookingSignals(answers: Record<string, string> | undefined) {
  const values = extractAnswerValues(answers);
  const normalizedValues = values.map((value) => normalizeComparableText(value));

  const level = values.find((_, index) => /\b(principiante|intermedio|avanzado)\b/.test(normalizedValues[index] ?? '')) ?? null;
  const subtopic = values.find((_, index) => /\b(pasta|pastas|salsa|salsas|risotto|pizza|gnocchi)\b/.test(normalizedValues[index] ?? '')) ?? null;
  const method = values.find((_, index) => /\b(libro|libros|recetario|recetarios|curso|cursos|video|videos|tutorial|tutoriales|youtube|clase|clases|mentor|mentoria|autodidacta|autoestudio|por mi cuenta)\b/.test(normalizedValues[index] ?? '')) ?? null;
  const horizon = values.find((_, index) => /\b(\d+)\s*(ano|anos|año|años|mes|meses|semana|semanas)\b/.test(normalizedValues[index] ?? '')) ?? null;

  return { level, subtopic, method, horizon };
}

function buildCookingMethodFragments(method: string): string[] {
  const normalized = normalizeComparableText(method);

  if (/\b(video|videos|tutorial|tutoriales|youtube)\b/.test(normalized)) {
    return ['video', 'videos', 'tutorial', 'tutoriales', 'youtube'];
  }

  if (/\b(libro|libros|recetario|recetarios|manual|manuales)\b/.test(normalized)) {
    return ['libro', 'libros', 'receta', 'recetas', 'lectura'];
  }

  if (/\b(clase|clases|curso|cursos)\b/.test(normalized)) {
    return ['clase', 'clases', 'curso', 'cursos'];
  }

  if (/\b(mentor|mentoria|tutor|tutora)\b/.test(normalized)) {
    return ['mentor', 'mentoria', 'tutor', 'tutora'];
  }

  if (/\b(autodidact|por mi cuenta|autoestudio)\b/.test(normalized)) {
    return ['autodidacta', 'autodidact', 'por mi cuenta', 'autoestudio'];
  }

  return uniqueNonEmpty(normalized.split(/\s+/).filter((fragment) => fragment.length >= 4));
}

function extractHealthSignals(goalText: string | undefined, answers: Record<string, string> | undefined) {
  const values = extractAnswerValues(answers);
  const normalizedValues = values.map((value) => normalizeComparableText(value));
  const normalizedGoal = normalizeComparableText(goalText);

  const weight = values.find((_, index) => /\b(\d+(?:[.,]\d+)?)\s*(kg|kilo|kilos)\b/.test(normalizedValues[index] ?? '')) ?? null;
  const height = values.find((_, index) => /\b(\d+(?:[.,]\d+)?)\s*(cm|m)\b/.test(normalizedValues[index] ?? '')) ?? null;
  const medicalContext = values.find((_, index) => /\b(medico|doctor|doctora|lesion|dolor|medicacion|hipertension|diabetes|operacion|cirugia|ninguna|ninguno|no tengo)\b/.test(normalizedValues[index] ?? '')) ?? null;
  const viableActivities = values.filter((_, index) => /\b(cicl|bici|cycling|natac|swim|pileta|agua|camina|walk|fuerza|pesas|movilidad)\b/.test(normalizedValues[index] ?? ''));
  const support = values.find((_, index) => /\b(nutri|nutricion|medico|doctor|entrenador|supervision|acompanamiento|solo|sola|ninguno|ninguna)\b/.test(normalizedValues[index] ?? '')) ?? null;

  const aggressiveLossMatch = `${normalizedGoal} ${normalizedValues.join(' ')}`.match(/\b(bajar|perder)\s*(\d+)\s*(kg|kilos).*(\d+)\s*(mes|meses|ano|anos|año|años)\b/);
  return {
    weight,
    height,
    medicalContext,
    viableActivities: uniqueNonEmpty(viableActivities),
    support,
    aggressiveLossMatch,
  };
}

function parseHorizonWeeks(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeComparableText(value);
  const yearMatch = normalized.match(/(\d+)\s*(ano|anos|año|años)\b/);
  if (yearMatch) {
    return Number(yearMatch[1]) * 52;
  }

  const monthMatch = normalized.match(/(\d+)\s*(mes|meses)\b/);
  if (monthMatch) {
    return Number(monthMatch[1]) * 4;
  }

  const weekMatch = normalized.match(/(\d+)\s*(semana|semanas)\b/);
  if (weekMatch) {
    return Number(weekMatch[1]);
  }

  return null;
}

function hasSemanticNonsense(text: string): boolean {
  const normalized = normalizeComparableText(text);
  return /\bpractica guiada en principiante\b/.test(normalized)
    || /\bpractica guiada en intermedio\b/.test(normalized)
    || /\bpractica guiada en avanzado\b/.test(normalized)
    || /\ben principiante\b/.test(normalized)
    || /\ben intermedio\b/.test(normalized)
    || /\ben avanzado\b/.test(normalized);
}

function computeQualityScore(
  scheduleFillRate: number,
  hardFindings: HardFinding[],
  softFindings: SoftFinding[],
  coveFindings: CoVeFinding[],
): number {
  let score = Math.round(scheduleFillRate * 100);
  score -= hardFindings.filter((finding) => finding.severity === 'FAIL').length * 20;
  score -= softFindings.filter((finding) => finding.severity === 'WARN').length * 5;
  score -= coveFindings.filter((finding) => finding.severity === 'FAIL').length * 20;
  score -= coveFindings.filter((finding) => finding.severity === 'WARN').length * 5;
  return Math.max(0, Math.min(100, score));
}

function extractActivityId(event: TimeEventItem): string {
  const match = event.id.match(/^(.*)_s\d+(?:_.+)?$/);
  return match?.[1] ?? event.id;
}

function buildMilestones(
  roadmap: StrategicRoadmap | undefined,
  goalId: string,
  weekStartDate: string,
  timezone: string,
  createdAt: string,
): MilestoneItem[] {
  if (!roadmap) {
    return [];
  }

  const weekStart = DateTime.fromISO(weekStartDate, { zone: 'UTC' }).setZone(timezone).startOf('day');
  let accumulatedWeeks = 0;

  return roadmap.milestones.map((milestone, index) => {
    const phaseDuration = roadmap.phases[index]?.durationWeeks ?? 2;
    accumulatedWeeks += phaseDuration;
    return {
      id: `milestone-${index + 1}`,
      kind: 'milestone',
      title: milestone,
      notes: roadmap.phases[index]?.focus_esAR,
      status: 'draft',
      goalIds: [goalId],
      dueDate: weekStart.plus({ weeks: accumulatedWeeks }).toISODate() ?? weekStart.toISODate() ?? createdAt,
      createdAt,
      updatedAt: createdAt,
    };
  });
}

function buildBacklogItems(
  unscheduled: PackageInput['finalSchedule']['unscheduled'],
  goalId: string,
  createdAt: string,
): FlexTaskItem[] {
  return unscheduled.map((item, index) => ({
    id: `flex-${index + 1}-${item.activityId}`,
    kind: 'flex_task',
    title: `Resolver hueco para ${item.activityId}`,
    notes: `${item.reason}. ${item.suggestion_esAR}`,
    status: 'waiting',
    goalIds: [goalId],
    estimateMin: 30,
    createdAt,
    updatedAt: createdAt,
  }));
}

function buildDeferredPhaseTasks(
  roadmap: StrategicRoadmap | undefined,
  goalId: string,
  weekStartDate: string,
  timezone: string,
  createdAt: string,
): FlexTaskItem[] {
  if (!roadmap || roadmap.phases.length === 0) {
    return [];
  }

  const weekStart = DateTime.fromISO(weekStartDate, { zone: 'UTC' }).setZone(timezone).startOf('day');
  let accumulatedWeeks = 0;

  return roadmap.phases.map((phase, index) => {
    accumulatedWeeks += Math.max(1, phase.durationWeeks ?? 2);
    return {
      id: `deferred-phase-${index + 1}`,
      kind: 'flex_task',
      title: phase.focus_esAR,
      notes: `Etapa: ${phase.name}`,
      status: 'waiting',
      goalIds: [goalId],
      estimateMin: 45,
      dueDate: weekStart.plus({ weeks: accumulatedWeeks }).toISODate() ?? undefined,
      createdAt,
      updatedAt: createdAt,
    };
  });
}

function buildMetricItems(
  qualityScore: number,
  eventCount: number,
  goalId: string,
  createdAt: string,
): MetricItem[] {
  return [
    {
      id: 'metric-plan-quality',
      kind: 'metric',
      title: 'Calidad del plan',
      status: 'active',
      goalIds: [goalId],
      metricKey: 'plan_quality_score',
      unit: 'puntos',
      direction: 'increase',
      target: {
        targetValue: Math.max(qualityScore, 85),
      },
      cadence: {
        freq: 'weekly',
        aggregation: 'last',
      },
      series: [
        {
          at: createdAt,
          value: qualityScore,
        },
      ],
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'metric-sessions-week',
      kind: 'metric',
      title: 'Sesiones completables por semana',
      status: 'active',
      goalIds: [goalId],
      metricKey: 'scheduled_sessions_per_week',
      unit: 'sesiones',
      direction: 'increase',
      target: {
        targetValue: Math.max(eventCount, 1),
      },
      cadence: {
        freq: 'weekly',
        aggregation: 'count',
      },
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

function buildTriggerRuleItems(goalId: string, createdAt: string): TriggerRuleItem[] {
  return [
    {
      id: 'trigger-low-adherence',
      kind: 'trigger_rule',
      title: t('pipeline.v5.package.trigger.low_adherence_title'),
      status: 'active',
      goalIds: [goalId],
      enabled: true,
      conditions: [
        {
          left: { type: 'metric', ref: 'plan_quality_score' },
          op: 'lt',
          right: { value: 70 },
        },
      ],
      actions: [
        {
          type: 'create_task',
          payload: { title: t('pipeline.v5.package.trigger.review_task_title'), estimateMin: 30 },
        },
      ],
      throttle: { minHoursBetweenRuns: 168 },
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

function buildImplementationIntentions(events: TimeEventItem[], timezone: string): string[] {
  const uniqueIntentions = new Map<string, string>();

  for (const event of events) {
    const start = DateTime.fromISO(event.startAt, { zone: 'UTC' }).setZone(timezone);
    const key = `${event.title}-${start.weekday}-${start.toFormat('HH:mm')}`;
    if (uniqueIntentions.has(key)) {
      continue;
    }

    uniqueIntentions.set(
      key,
      `Si llega ${start.setLocale('es').toFormat("cccc 'a las' HH:mm")}, entonces hago ${event.title} durante ${event.durationMin} minutos.`,
    );

    if (uniqueIntentions.size >= 4) {
      break;
    }
  }

  if (uniqueIntentions.size === 0) {
    uniqueIntentions.set(
      'fallback',
      'Si mi semana se complica, entonces reservo aunque sea un bloque corto para no cortar el envion.',
    );
  }

  return Array.from(uniqueIntentions.values());
}

function buildWarnings(
  input: PackageInput,
): string[] {
  const warnings = new Set<string>();

  if (input.finalSchedule.events.length === 0 && (input.finalSchedule.unscheduled?.length ?? 0) === 0) {
    warnings.add('Todavia no hay bloques concretos en el calendario: antes hay que bajar este objetivo a pasos verificables.');
  }

  if ((input.finalSchedule.unscheduled?.length ?? 0) > 0) {
    warnings.add('Hay actividades que no entraron en la semana y quedaron como pendientes.');
  }

  for (const finding of input.hardFindings ?? []) {
    warnings.add(finding.description);
  }

  for (const finding of input.coveFindings ?? []) {
    if (finding.severity === 'FAIL' || finding.severity === 'WARN') {
      warnings.add(finding.answer);
    }
  }

  if ((input.repairSummary?.patchesApplied.length ?? 0) > 0) {
    warnings.add('El plan tuvo reparaciones automaticas; conviene revisarlo rapido antes de arrancar.');
  }

  if (input.repairSummary?.status === 'fixed') {
    warnings.add('El plan pasó por una reparación automática y conviene revisarlo rápido antes de empezar.');
  }

  return Array.from(warnings);
}

function buildSignalUsage(
  input: PackageInput,
  packageText: string,
): NonNullable<PlanPackage['intakeCoverage']> {
  const requestedDomain = canonicalizeKnownDomain(input.requestedDomain);
  const normalizedPackageText = normalizeComparableText(packageText);
  const packageTokens = uniqueTokens([packageText]);
  const baseCoverage = buildSnapshotSignalUsage(input, normalizedPackageText, packageTokens);
  const signalUsage: NonNullable<PlanPackage['intakeCoverage']>['signalUsage'] = [...baseCoverage.signalUsage];
  const requiredSignals: string[] = [...baseCoverage.requiredSignals];

  if (requestedDomain === 'cocina-italiana') {
    const signals = extractCookingSignals(input.clarificationAnswers);
    const horizonWeeks = parseHorizonWeeks(signals.horizon);
    const planHorizonWeeks = input.roadmap?.phases.reduce((total, phase) => total + Math.max(1, phase.durationWeeks ?? 2), 0) ?? 0;

    if (signals.subtopic) {
      requiredSignals.push('cooking_subtopic');
      signalUsage.push({
        signal: 'cooking_subtopic',
        expectedValue: signals.subtopic,
        used: /\bpasta|pastas|salsa|salsas|risotto|pizza|gnocchi\b/.test(normalizedPackageText),
        evidence: uniqueNonEmpty([
          normalizedPackageText.includes('pasta') || normalizedPackageText.includes('pastas') ? 'pasta' : '',
          normalizedPackageText.includes('salsa') || normalizedPackageText.includes('salsas') ? 'salsa' : '',
        ]),
      });
    }

    if (signals.method) {
      const methodEvidence = uniqueNonEmpty(
        buildCookingMethodFragments(signals.method).filter((fragment) => normalizedPackageText.includes(fragment)),
      );
      requiredSignals.push('cooking_method');
      signalUsage.push({
        signal: 'cooking_method',
        expectedValue: signals.method,
        used: methodEvidence.length > 0,
        evidence: methodEvidence,
      });
    }

    if (signals.level) {
      requiredSignals.push('cooking_level');
      signalUsage.push({
        signal: 'cooking_level',
        expectedValue: signals.level,
        used: /\b(principiante|base|fundamento|fundamentos|tecnica base|nivel inicial|primeras|introductorio)\b/.test(normalizedPackageText),
        evidence: uniqueNonEmpty([
          normalizedPackageText.includes('principiante') ? 'principiante' : '',
          normalizedPackageText.includes('base') ? 'base' : '',
          normalizedPackageText.includes('fundamentos') ? 'fundamentos' : '',
          normalizedPackageText.includes('tecnica base') ? 'tecnica base' : '',
        ]),
      });
    }

    if (signals.horizon) {
      requiredSignals.push('cooking_horizon');
      signalUsage.push({
        signal: 'cooking_horizon',
        expectedValue: signals.horizon,
        used: horizonWeeks === null || planHorizonWeeks >= Math.max(1, Math.floor(horizonWeeks * 0.7)),
        evidence: planHorizonWeeks > 0 ? [`${planHorizonWeeks} semanas`] : [],
      });
    }
  }

  if (requestedDomain === 'salud' || input.classification?.risk === 'HIGH_HEALTH') {
    const signals = extractHealthSignals(input.goalText, input.clarificationAnswers);

    if (signals.viableActivities.length > 0) {
      requiredSignals.push('health_viable_activities');
      signalUsage.push({
        signal: 'health_viable_activities',
        expectedValue: signals.viableActivities.join(', '),
        used: /\bcicl|bici|natac|swim|pileta|caminat|walk|fuerza|movilidad\b/.test(normalizedPackageText),
        evidence: uniqueNonEmpty([
          normalizedPackageText.includes('cicl') || normalizedPackageText.includes('bici') ? 'ciclismo' : '',
          normalizedPackageText.includes('natac') || normalizedPackageText.includes('swim') || normalizedPackageText.includes('pileta') ? 'natacion' : '',
          normalizedPackageText.includes('caminat') || normalizedPackageText.includes('walk') ? 'caminata' : '',
          normalizedPackageText.includes('fuerza') || normalizedPackageText.includes('movilidad') ? 'fuerza y movilidad' : '',
        ]),
      });
    }

    if (signals.weight) {
      requiredSignals.push('health_weight');
      const weightMatch = normalizeComparableText(signals.weight).match(/\b(\d+(?:[.,]\d+)?)\b/);
      const weightValue = weightMatch?.[1] ?? '';
      signalUsage.push({
        signal: 'health_weight',
        expectedValue: signals.weight,
        used: Boolean(weightValue && normalizedPackageText.includes(weightValue))
          || /\b(\d+\s*kg|\d+\s*kilos|\bpeso de\b)/.test(normalizedPackageText),
        evidence: uniqueNonEmpty([
          weightValue && normalizedPackageText.includes(weightValue) ? weightValue : '',
          normalizedPackageText.includes('peso') ? 'peso' : '',
          normalizedPackageText.includes('medidas') ? 'medidas' : '',
          normalizedPackageText.includes('chequeo') ? 'chequeo' : '',
        ]),
      });
    }

    if (signals.height) {
      requiredSignals.push('health_height');
      const heightMatch = normalizeComparableText(signals.height).match(/\b(\d+(?:[.,]\d+)?)\b/);
      const heightValue = heightMatch?.[1] ?? '';
      signalUsage.push({
        signal: 'health_height',
        expectedValue: signals.height,
        used: Boolean(heightValue && normalizedPackageText.includes(heightValue))
          || /\b(\d+\s*cm|\d+\s*m|\baltura\b)/.test(normalizedPackageText),
        evidence: uniqueNonEmpty([
          heightValue && normalizedPackageText.includes(heightValue) ? heightValue : '',
          normalizedPackageText.includes('medidas') ? 'medidas' : '',
          normalizedPackageText.includes('carga') ? 'carga' : '',
          normalizedPackageText.includes('expectativa') ? 'expectativa' : '',
        ]),
      });
    }

    const needsSupervision = Boolean(signals.aggressiveLossMatch) || Boolean(signals.weight && signals.height);
    if (needsSupervision) {
      const hasAffirmativeSupervision = hasAffirmativeSafetyFraming(normalizedPackageText)
        && !hasNegatedSafetyContext(signals.support);
      requiredSignals.push('health_supervision');
      signalUsage.push({
        signal: 'health_supervision',
        expectedValue: signals.support ?? 'supervision profesional',
        used: hasAffirmativeSupervision,
        evidence: uniqueNonEmpty([
          hasAffirmativeSupervision && normalizedPackageText.includes('medico') ? 'medico' : '',
          hasAffirmativeSupervision && normalizedPackageText.includes('profesional') ? 'profesional' : '',
          hasAffirmativeSupervision && normalizedPackageText.includes('supervision') ? 'supervision' : '',
          hasAffirmativeSupervision && (normalizedPackageText.includes('nutricion') || normalizedPackageText.includes('nutricionista')) ? 'nutricion' : '',
        ]),
      });
    }
  }

  return {
    requiredSignals,
    missingSignals: signalUsage.filter((usage) => !usage.used).map((usage) => usage.signal),
    signalUsage,
  };
}

function buildFrequencies(events: TimeEventItem[]): SkeletonFrequency[] {
  const grouped = new Map<string, SkeletonFrequency>();

  for (const event of events) {
    const activityId = extractActivityId(event);
    const existing = grouped.get(activityId);
    if (existing) {
      existing.sessionsPerWeek += 1;
      continue;
    }

    grouped.set(activityId, {
      activityId,
      title: event.title,
      sessionsPerWeek: 1,
      minutesPerSession: event.durationMin,
    });
  }

  return Array.from(grouped.values()).sort((left, right) => left.title.localeCompare(right.title));
}

function createFallbackPhase(
  goalIds: string[],
  goalText: string | undefined,
  weekStart: DateTime,
  frequencies: SkeletonFrequency[],
  milestoneIds: string[],
  horizonWeeks = SKELETON_HORIZON_WEEKS,
): SkeletonPhase {
  return {
    phaseId: 'phase-1',
    title: goalText ?? 'Plan base',
    startWeek: 1,
    endWeek: horizonWeeks,
    startDate: weekStart.toISODate() ?? '',
    endDate: weekStart.plus({ weeks: horizonWeeks }).minus({ days: 1 }).toISODate() ?? '',
    goalIds,
    objectives: [goalText ?? 'Sostener una progresion simple y util.'],
    frequencies,
    milestoneIds,
  };
}

function resolveRoadmapHorizonWeeks(roadmap: StrategicRoadmap | undefined): number {
  if (!roadmap?.phases.length) {
    return SKELETON_HORIZON_WEEKS;
  }

  const roadmapWeeks = roadmap.phases.reduce(
    (total, phase) => total + Math.max(1, phase.durationWeeks ?? 2),
    0,
  );

  return Math.max(1, roadmapWeeks);
}

function buildSkeleton(
  roadmap: StrategicRoadmap | undefined,
  goalIds: string[],
  goalText: string | undefined,
  weekStartDate: string,
  timezone: string,
  milestones: MilestoneItem[],
  events: TimeEventItem[],
): V5Skeleton {
  const weekStart = DateTime.fromISO(weekStartDate, { zone: 'UTC' }).setZone(timezone).startOf('day');
  const frequencies = buildFrequencies(events);
  const horizonWeeks = resolveRoadmapHorizonWeeks(roadmap);

  if (!roadmap || roadmap.phases.length === 0) {
    return {
      horizonWeeks,
      goalIds,
      phases: [createFallbackPhase(goalIds, goalText, weekStart, frequencies, milestones.map((item) => item.id), horizonWeeks)],
      milestones,
    };
  }

  const phases: SkeletonPhase[] = [];
  let cursorWeek = 1;

  for (let index = 0; index < roadmap.phases.length && cursorWeek <= horizonWeeks; index += 1) {
    const phase = roadmap.phases[index];
    const requestedDuration = Math.max(1, phase.durationWeeks ?? 2);
    const lastPhase = index === roadmap.phases.length - 1;
    const endWeek = lastPhase
      ? horizonWeeks
      : Math.min(horizonWeeks, cursorWeek + requestedDuration - 1);
    const startDate = weekStart.plus({ weeks: cursorWeek - 1 }).toISODate() ?? '';
    const endDateWeekOffset = lastPhase ? horizonWeeks : endWeek;
    const endDate = weekStart.plus({ weeks: endDateWeekOffset }).minus({ days: 1 }).toISODate() ?? '';
    const milestoneIds = milestones
      .filter((milestone) => {
        const due = DateTime.fromISO(milestone.dueDate, { zone: timezone });
        return due >= weekStart.plus({ weeks: cursorWeek - 1 }) && due <= weekStart.plus({ weeks: endDateWeekOffset }).minus({ days: 1 });
      })
      .map((milestone) => milestone.id);

    phases.push({
      phaseId: `phase-${index + 1}`,
      title: phase.name,
      startWeek: cursorWeek,
      endWeek,
      startDate,
      endDate,
      goalIds,
      objectives: [phase.focus_esAR],
      frequencies,
      milestoneIds,
    });

    cursorWeek = endWeek + 1;
  }

  if (phases.length === 0) {
    phases.push(createFallbackPhase(goalIds, goalText, weekStart, frequencies, milestones.map((item) => item.id), horizonWeeks));
  }

  return {
    horizonWeeks,
    goalIds,
    phases,
    milestones,
  };
}

function shiftEventByWeeks(event: TimeEventItem, weeks: number): TimeEventItem {
  if (weeks === 0) {
    return event;
  }

  const shiftedStart = DateTime.fromISO(event.startAt, { zone: 'UTC' }).plus({ weeks }).toISO() ?? event.startAt;
  return {
    ...event,
    id: `${event.id}-w${weeks + 1}`,
    startAt: shiftedStart,
  };
}

function sortTimeEvents(events: TimeEventItem[]): TimeEventItem[] {
  return [...events].sort((left, right) =>
    DateTime.fromISO(left.startAt, { zone: 'UTC' }).toMillis() -
    DateTime.fromISO(right.startAt, { zone: 'UTC' }).toMillis(),
  );
}

function normalizeDetailWindow(startWeek: number, horizonWeeks: number, totalHorizonWeeks: number) {
  const effectiveHorizonWeeks = Math.max(1, totalHorizonWeeks);
  const safeStartWeek = Math.max(1, Math.min(startWeek, effectiveHorizonWeeks));
  const maxWindow = Math.max(1, effectiveHorizonWeeks - safeStartWeek + 1);
  const safeHorizonWeeks = Math.max(1, Math.min(horizonWeeks, maxWindow));

  return {
    startWeek: safeStartWeek,
    horizonWeeks: safeHorizonWeeks,
  };
}

export function buildDetailWindow(
  events: TimeEventItem[],
  weekStartDate: string,
  timezone: string,
  startWeek = 1,
  horizonWeeks = DETAIL_HORIZON_WEEKS,
  totalHorizonWeeks = SKELETON_HORIZON_WEEKS,
): V5Detail {
  const weekStart = DateTime.fromISO(weekStartDate, { zone: 'UTC' }).setZone(timezone).startOf('day');
  const window = normalizeDetailWindow(startWeek, horizonWeeks, totalHorizonWeeks);
  const weeks = Array.from({ length: window.horizonWeeks }, (_, index) => {
    const weekIndex = window.startWeek + index;
    const scheduledEvents = sortTimeEvents(
      events.map((event) => shiftEventByWeeks(event, weekIndex - 1)),
    );

    return {
      weekIndex,
      startDate: weekStart.plus({ weeks: weekIndex - 1 }).toISODate() ?? '',
      endDate: weekStart.plus({ weeks: weekIndex }).minus({ days: 1 }).toISODate() ?? '',
      scheduledEvents,
    };
  });

  return {
    horizonWeeks: window.horizonWeeks,
    startDate: weeks[0]?.startDate ?? (weekStart.plus({ weeks: window.startWeek - 1 }).toISODate() ?? ''),
    endDate: weeks.at(-1)?.endDate ?? (weekStart.plus({ weeks: window.startWeek - 1 }).toISODate() ?? ''),
    scheduledEvents: weeks.flatMap((week) => week.scheduledEvents),
    weeks,
  };
}

function buildDetail(
  events: TimeEventItem[],
  weekStartDate: string,
  timezone: string,
  totalHorizonWeeks: number,
): V5Detail {
  return buildDetailWindow(events, weekStartDate, timezone, 1, DETAIL_HORIZON_WEEKS, totalHorizonWeeks);
}

export function projectPackageDetailWindow(
  pkg: PlanPackage,
  startWeek = 1,
  horizonWeeks = DETAIL_HORIZON_WEEKS,
): PlanPackage {
  const baseEvents = sortTimeEvents(
    pkg.items.filter((item): item is TimeEventItem => item.kind === 'time_event'),
  );
  const fallbackEvents = sortTimeEvents(pkg.plan.detail.weeks[0]?.scheduledEvents ?? []);
  const sourceEvents = baseEvents.length > 0 ? baseEvents : fallbackEvents;
  const weekStartDate = pkg.plan.detail.weeks[0]?.startDate
    ?? pkg.plan.detail.startDate
    ?? pkg.plan.operational.startDate;

  return {
    ...pkg,
    plan: {
      ...pkg.plan,
      detail: buildDetailWindow(
        sourceEvents,
        weekStartDate,
        pkg.timezone,
        startWeek,
        horizonWeeks,
        pkg.plan.skeleton.horizonWeeks,
      ),
    },
  };
}

function buildOperationalBuffers(
  events: TimeEventItem[],
  weekStartDate: string,
  timezone: string,
  slackPolicy: SlackPolicy,
): OperationalBuffer[] {
  if (events.length === 0) {
    return [];
  }

  const weekStart = DateTime.fromISO(weekStartDate, { zone: 'UTC' }).setZone(timezone).startOf('day');
  const buffers: OperationalBuffer[] = [];
  const candidateDays = Array.from({ length: OPERATIONAL_HORIZON_DAYS }, (_, index) => {
    const dayStart = weekStart.plus({ days: index });
    const date = dayStart.toISODate() ?? '';
    const dayEvents = events.filter((event) =>
      DateTime.fromISO(event.startAt, { zone: 'UTC' }).setZone(timezone).toISODate() === date,
    );

    return {
      index,
      dayStart,
      dayEvents,
    };
  });

  candidateDays.sort((left, right) => {
    const scheduledDelta = Number(right.dayEvents.length > 0) - Number(left.dayEvents.length > 0);
    return scheduledDelta !== 0 ? scheduledDelta : left.index - right.index;
  });

  const allocatedPerDay = new Map<number, number>();
  let remaining = slackPolicy.weeklyTimeBufferMin;

  while (remaining > 0 && candidateDays.length > 0) {
    const chunk = Math.min(30, remaining);
    const bucket = candidateDays[buffers.length % candidateDays.length];
    const currentAllocated = allocatedPerDay.get(bucket.index) ?? 0;
    const lastEventEnd = bucket.dayEvents.reduce((latest, event) => {
      const eventEnd = DateTime.fromISO(event.startAt, { zone: 'UTC' }).plus({ minutes: event.durationMin });
      const eventEndLocal = eventEnd.setZone(timezone);
      return eventEndLocal > latest ? eventEndLocal : latest;
    }, bucket.dayStart.plus({ hours: 18 }));
    const startAt = lastEventEnd.plus({ minutes: currentAllocated }).toUTC().toISO()
      ?? bucket.dayStart.toUTC().toISO()
      ?? '';

    buffers.push({
      id: `buffer-slack-${bucket.index + 1}-${Math.floor(currentAllocated / 30) + 1}`,
      startAt,
      durationMin: chunk,
      kind: 'slack',
      label: 'Margen libre para absorber imprevistos',
    });

    allocatedPerDay.set(bucket.index, currentAllocated + chunk);
    remaining -= chunk;
  }

  return buffers.sort((left, right) =>
    DateTime.fromISO(left.startAt, { zone: 'UTC' }).toMillis() -
    DateTime.fromISO(right.startAt, { zone: 'UTC' }).toMillis(),
  );
}

function buildOperationalDays(
  events: TimeEventItem[],
  buffers: OperationalBuffer[],
  weekStartDate: string,
  timezone: string,
): OperationalDay[] {
  const weekStart = DateTime.fromISO(weekStartDate, { zone: 'UTC' }).setZone(timezone).startOf('day');

  return Array.from({ length: OPERATIONAL_HORIZON_DAYS }, (_, index) => {
    const date = weekStart.plus({ days: index }).toISODate() ?? '';
    return {
      date,
      scheduledEvents: events.filter((event) =>
        DateTime.fromISO(event.startAt, { zone: 'UTC' }).setZone(timezone).toISODate() === date,
      ),
      buffers: buffers.filter((buffer) =>
        DateTime.fromISO(buffer.startAt, { zone: 'UTC' }).setZone(timezone).toISODate() === date,
      ),
    };
  });
}

function buildOperational(
  events: TimeEventItem[],
  weekStartDate: string,
  timezone: string,
  slackPolicy: SlackPolicy,
): V5Operational {
  const weekStart = DateTime.fromISO(weekStartDate, { zone: 'UTC' }).setZone(timezone).startOf('day');
  const buffers = buildOperationalBuffers(events, weekStartDate, timezone, slackPolicy);
  return {
    horizonDays: 7,
    startDate: weekStart.toISODate() ?? '',
    endDate: weekStart.plus({ days: OPERATIONAL_HORIZON_DAYS - 1 }).toISODate() ?? '',
    frozen: true,
    scheduledEvents: events,
    buffers,
    days: buildOperationalDays(events, buffers, weekStartDate, timezone),
    totalBufferMin: buffers.reduce((total, buffer) => total + buffer.durationMin, 0),
  };
}

function supportsHabitState(input: PackageInput): boolean {
  if (!input.classification) {
    return false;
  }

  if (input.classification.extractedSignals.isRecurring || input.classification.extractedSignals.requiresSkillProgression) {
    return true;
  }

  return input.classification.goalType === 'QUANT_TARGET_TRACKING' || input.classification.goalType === 'IDENTITY_EXPLORATION';
}

function buildMinimumViableMinutes(
  baseDurationMin: number,
  energyLevel: 'low' | 'medium' | 'high' | undefined,
): number {
  const factor = energyLevel === 'low'
    ? 0.25
    : energyLevel === 'high'
      ? 0.5
      : 1 / 3;
  return Math.max(5, Math.min(baseDurationMin, Math.ceil((baseDurationMin * factor) / 5) * 5));
}

function resolveHabitProgressionKeys(input: PackageInput): string[] {
  if ((input.habitProgressionKeys?.length ?? 0) > 0) {
    return Array.from(new Set(input.habitProgressionKeys));
  }

  const fallback = slugify(input.goalId ?? input.goalText ?? input.classification?.goalType ?? '');
  return fallback ? [fallback] : [];
}

function buildHabitStates(
  input: PackageInput,
  timeEvents: TimeEventItem[],
): HabitState[] {
  if (!supportsHabitState(input)) {
    return [];
  }

  const progressionKeys = resolveHabitProgressionKeys(input);
  if (progressionKeys.length === 0) {
    return [];
  }

  const shortestEvent = timeEvents.reduce<TimeEventItem | null>((shortest, event) => {
    if (!shortest || event.durationMin < shortest.durationMin) {
      return event;
    }
    return shortest;
  }, null);
  const baseDurationMin = shortestEvent?.durationMin ?? 30;
  const minimumViableMinutes = buildMinimumViableMinutes(baseDurationMin, input.profile?.energyLevel);
  const minimumViableDescription = shortestEvent
    ? `Version minima de ${shortestEvent.title}`
    : input.goalText
      ? `Version minima de ${input.goalText}`
      : 'Version minima para sostener el habito';
  const sessionsPerWeek = Math.max(timeEvents.length, 1);
  const previousByKey = new Map((input.currentHabitStates ?? []).map((state) => [state.progressionKey, state]));

  return progressionKeys.map((progressionKey) =>
    mergeHabitStateForReplan(
      {
        progressionKey,
        weeksActive: 0,
        level: 0,
        currentDose: {
          sessionsPerWeek,
          minimumViable: {
            minutes: minimumViableMinutes,
            description: minimumViableDescription,
          },
        },
        protectedFromReset: false,
      },
      previousByKey.get(progressionKey),
    ),
  );
}

function buildPlan(
  input: PackageInput,
  goalIds: string[],
  milestones: MilestoneItem[],
  timeEvents: TimeEventItem[],
  createdAt: string,
  updatedAt: string,
  weekStartDate: string,
  slackPolicy: SlackPolicy,
): V5Plan {
  const skeleton = buildSkeleton(input.roadmap, goalIds, input.goalText, weekStartDate, input.timezone, milestones, timeEvents);

  return V5PlanSchema.parse({
    goalIds,
    timezone: input.timezone,
    createdAt,
    updatedAt,
    skeleton,
    detail: buildDetail(timeEvents, weekStartDate, input.timezone, skeleton.horizonWeeks),
    operational: buildOperational(timeEvents, weekStartDate, input.timezone, slackPolicy),
  });
}

export function packagePlan(input: PackageInput): PlanPackage {
  const createdAt = input.finalSchedule.events[0]?.createdAt ?? DateTime.utc().toISO() ?? '';
  const updatedAt = input.finalSchedule.events[0]?.updatedAt ?? createdAt;
  const goalId = input.goalId ?? input.finalSchedule.events[0]?.goalIds[0] ?? 'goal-v5';
  const goalIds = Array.from(new Set(input.finalSchedule.events.flatMap((event) => event.goalIds)));
  if (goalIds.length === 0) {
    goalIds.push(goalId);
  }
  const weekStartDate = input.weekStartDate ?? input.finalSchedule.events[0]?.startAt ?? createdAt;
  const hardFindings = input.hardFindings ?? [];
  const softFindings = input.softFindings ?? [];
  const coveFindings = input.coveFindings ?? [];
  const slackPolicy = SlackPolicySchema.parse(input.slackPolicy ?? DEFAULT_SLACK_POLICY);

  const timeEvents = [...input.finalSchedule.events].sort((left, right) =>
    DateTime.fromISO(left.startAt, { zone: 'UTC' }).toMillis() -
    DateTime.fromISO(right.startAt, { zone: 'UTC' }).toMillis(),
  );

  const qualityScore = computeQualityScore(input.finalSchedule.metrics.fillRate, hardFindings, softFindings, coveFindings);

  const implementationIntentions = buildImplementationIntentions(timeEvents, input.timezone);
  const warnings = buildWarnings(input);
  const milestones = buildMilestones(input.roadmap, goalId, weekStartDate, input.timezone, createdAt);
  const deferredPhaseTasks = timeEvents.length === 0 && (input.finalSchedule.unscheduled?.length ?? 0) === 0
    ? buildDeferredPhaseTasks(input.roadmap, goalId, weekStartDate, input.timezone, createdAt)
    : [];
  const baseItems: PlanItem[] = [
    ...timeEvents,
    ...milestones,
    ...deferredPhaseTasks,
    ...buildBacklogItems(input.finalSchedule.unscheduled, goalId, createdAt),
    ...buildTriggerRuleItems(goalId, createdAt),
  ];
  const habitStates = buildHabitStates(input, timeEvents);
  const plan = buildPlan(input, goalIds, milestones, timeEvents, createdAt, updatedAt, weekStartDate, slackPolicy);
  const provisionalPackage: PlanPackage = {
    plan,
    items: baseItems,
    habitStates,
    slackPolicy,
    timezone: input.timezone,
    summary_esAR: '',
    qualityScore,
    implementationIntentions,
    warnings,
    tradeoffs: input.finalSchedule.tradeoffs ?? [],
  };
  const validation = evaluatePackageValidation({
    goalText: input.goalText ?? plan.skeleton.phases[0]?.title ?? '',
    package: provisionalPackage,
    classification: input.classification,
    requestedDomain: input.requestedDomain,
    clarificationAnswers: input.clarificationAnswers,
    goalSignalsSnapshot: input.goalSignalsSnapshot,
  });
  const finalWarnings = buildValidatedWarnings(warnings, validation);
  const finalQualityScore = buildValidatedQualityScore(qualityScore, validation);
  const finalItems: PlanItem[] = [
    ...timeEvents,
    ...milestones,
    ...deferredPhaseTasks,
    ...buildBacklogItems(input.finalSchedule.unscheduled, goalId, createdAt),
    ...buildMetricItems(finalQualityScore, timeEvents.length, goalId, createdAt),
    ...buildTriggerRuleItems(goalId, createdAt),
  ];

  return {
    plan,
    items: finalItems,
    habitStates,
    slackPolicy,
    timezone: input.timezone,
    summary_esAR: buildValidatedSummary(
      input.goalText,
      timeEvents.length,
      input.roadmap,
      finalQualityScore,
      finalWarnings.length,
      validation.status,
    ),
    qualityScore: finalQualityScore,
    implementationIntentions,
    warnings: finalWarnings,
    tradeoffs: input.finalSchedule.tradeoffs ?? [],
    publicationState: buildValidationPublicationState(validation),
    qualityIssues: validation.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity === 'block' ? 'blocking' : 'warning',
      message: issue.message,
    })),
    requestDomain: validation.requestDomain ?? null,
    packageDomain: validation.packageDomain ?? null,
    intakeCoverage: validation.intakeCoverage ?? null,
    degraded: validation.status !== 'ok',
  };
}
