import type { PhaseIO } from '../phase-io';
import type { GoalClassification } from '../../domain/goal-taxonomy';
import type { AdherenceScore } from '../../domain/adherence-model';
import type { DomainKnowledgeCard } from '../../domain/domain-knowledge/bank';
import type { HabitState } from '../../domain/habit-state';
import type { RiskForecast } from '../../domain/risk-forecast';
import type { ActivityRequest, SchedulerOutput, SchedulerInput, Tradeoff } from '../../scheduler/types';
import type { V5Plan } from '../../domain/rolling-wave-plan';
import type { SlackPolicy } from '../../domain/slack-policy';
import type { PlanItem } from '../../domain/plan-item';

// ─── 1. Classify ──────────────────────────────────────────────────────────────
export interface ClassifyInput { text: string; }
export type ClassifyOutput = GoalClassification;

// ─── 2. Requirements ──────────────────────────────────────────────────────────
export interface RequirementsInput {
  goalText: string;
  classification: GoalClassification;
}
export interface RequirementsOutput { questions: string[]; }

// ─── 3. Profile ───────────────────────────────────────────────────────────────
export interface ProfileInput { answers: Record<string, string>; }
export interface UserProfileV5 {
  freeHoursWeekday: number;
  freeHoursWeekend: number;
  energyLevel: 'low' | 'medium' | 'high';
  fixedCommitments: string[];
  scheduleConstraints: string[];
}
export type ProfileOutput = UserProfileV5;

// ─── 4. Strategy ──────────────────────────────────────────────────────────────
export interface StrategicRoadmapPhase {
  name: string;
  durationWeeks?: number;
  focus_esAR: string;
}
export interface StrategicRoadmap {
  phases: StrategicRoadmapPhase[];
  milestones: string[];
}
export interface StrategyInterpretationContext {
  parsedGoal: string;
  implicitAssumptions: string[];
}
export interface StrategyCriticFindingContext {
  severity: 'critical' | 'warning' | 'info';
  category: 'feasibility' | 'specificity' | 'progression' | 'scheduling' | 'motivation' | 'domain';
  message: string;
  suggestion: string | null;
  affectedPhaseIds: string[];
}
export interface StrategyCriticReportContext {
  overallScore: number;
  mustFix: StrategyCriticFindingContext[];
  shouldFix: StrategyCriticFindingContext[];
  verdict: 'approve' | 'revise' | 'rethink';
  reasoning: string;
}
export interface StrategyDomainContext {
  card: DomainKnowledgeCard | null;
  specificAdvice?: string | null;
  warnings?: string[];
}
export interface StrategyPlanningContext {
  interpretation?: StrategyInterpretationContext;
  clarificationAnswers?: Record<string, string>;
  domainContext?: StrategyDomainContext | null;
  previousCriticFindings?: StrategyCriticFindingContext[];
  previousCriticReports?: StrategyCriticReportContext[];
}
export interface StrategyInput {
  goalText: string;
  profile: UserProfileV5;
  classification: GoalClassification;
  habitStates?: HabitState[];
  planningContext?: StrategyPlanningContext;
}
export type StrategyOutput = StrategicRoadmap;

// ─── 5. Template Builder ──────────────────────────────────────────────────────
export interface TemplateInput {
  goalText: string;
  roadmap: StrategicRoadmap;
}
export interface TemplateOutput { activities: ActivityRequest[]; }

// ─── 6. Schedule (MILP) ───────────────────────────────────────────────────────
export interface ScheduleInput { activities: ActivityRequest[]; }
export type ScheduleOutput = SchedulerOutput;

// ─── 7. Hard Validate ─────────────────────────────────────────────────────────
export interface HardFinding {
  code: string;
  severity: 'FAIL';
  description: string;
  affectedItems: string[];
}
export interface HardValidateInput {
  schedule: SchedulerOutput;
  originalInput: SchedulerInput;
  profile: UserProfileV5;
  timezone: string;
}
export interface HardValidateOutput { findings: HardFinding[]; }

// ─── 8. Soft Validate ─────────────────────────────────────────────────────────
export interface SoftFinding {
  code: string;
  severity: 'WARN' | 'INFO';
  suggestion_esAR: string;
}
export interface SoftValidateInput { schedule: SchedulerOutput; profile: UserProfileV5; timezone: string; }
export interface SoftValidateOutput { findings: SoftFinding[]; }

// ─── 9. CoVe Verify ───────────────────────────────────────────────────────────
export interface CoVeFinding {
  code: string;
  question: string;
  answer: string;
  severity: 'FAIL' | 'WARN' | 'INFO';
  groundedByFacts: boolean;
  supportingFacts: string[];
}
export interface CoVeVerifyInput {
  schedule: SchedulerOutput;
  timezone: string;
  profile: UserProfileV5;
}
export interface CoVeVerifyOutput { findings: CoVeFinding[]; }

// ─── 10. Repair Manager ───────────────────────────────────────────────────────
export interface PatchOp {
  type: 'MOVE' | 'SWAP' | 'DROP' | 'RESIZE';
  targetId: string;
}
export interface RepairPatchCandidate extends PatchOp {
  extraId?: string;
  newStartAt?: string;
  newDurationMin?: number;
}
export interface RepairAttemptRecord {
  candidate: RepairPatchCandidate | null;
  source: 'deterministic' | 'llm-ranked';
  baselineScore: number;
  candidateScore: number;
  decision: 'committed' | 'reverted' | 'escalated';
  remainingFindings: Array<{ severity: string; message: string }>;
}
export interface RepairInput {
  schedule: SchedulerOutput;
  hardFindings: HardFinding[];
  softFindings: SoftFinding[];
  coveFindings: CoVeFinding[];
  originalInput: SchedulerInput;
  profile: UserProfileV5;
}
export interface RepairOutput {
  status: 'fixed' | 'no_change' | 'escalated';
  patchesApplied: PatchOp[];
  iterations: number;
  scoreBefore: number;
  scoreAfter: number;
  finalSchedule: SchedulerOutput;
  remainingFindings: Array<{ severity: string; message: string }>;
  attempts: RepairAttemptRecord[];
  attemptedPatch?: PatchOp;
}

// ─── 11. Packager ─────────────────────────────────────────────────────────────
export interface PlanPackage {
  plan: V5Plan;
  items: PlanItem[];
  habitStates: HabitState[];
  slackPolicy: SlackPolicy;
  timezone: string;
  summary_esAR: string;
  qualityScore: number;
  implementationIntentions: string[];
  warnings: string[];
  tradeoffs?: Tradeoff[];
  publicationState?: 'publishable' | 'requires_regeneration' | 'failed_for_quality_review';
  qualityIssues?: Array<{
    code: string;
    severity: 'warning' | 'blocking';
    message: string;
  }>;
  requestDomain?: string | null;
  packageDomain?: string | null;
  intakeCoverage?: {
    requiredSignals: string[];
    missingSignals: string[];
    signalUsage: Array<{
      signal: string;
      expectedValue: string;
      used: boolean;
      evidence: string[];
    }>;
  } | null;
  agentOutcomes?: Array<{
    agent:
      | 'goal-interpreter'
      | 'clarifier'
      | 'planner'
      | 'feasibility-checker'
      | 'scheduler'
      | 'critic'
      | 'domain-expert'
      | 'packager';
    phase:
      | 'interpret'
      | 'clarify'
      | 'plan'
      | 'check'
      | 'schedule'
      | 'critique'
      | 'revise'
      | 'package'
      | 'done'
      | 'failed';
    source: 'llm' | 'fallback' | 'deterministic';
    errorCode: string | null;
    errorMessage: string | null;
    durationMs: number;
  }>;
  degraded?: boolean;
}
export interface PackageInput {
  finalSchedule: SchedulerOutput;
  timezone: string;
  classification?: GoalClassification;
  roadmap?: StrategicRoadmap;
  goalText?: string;
  goalId?: string;
  requestedDomain?: string | null;
  clarificationAnswers?: Record<string, string>;
  weekStartDate?: string;
  hardFindings?: HardFinding[];
  softFindings?: SoftFinding[];
  coveFindings?: CoVeFinding[];
  repairSummary?: Pick<RepairOutput, 'status' | 'patchesApplied' | 'iterations' | 'scoreAfter'>;
  profile?: UserProfileV5;
  currentHabitStates?: HabitState[];
  habitProgressionKeys?: string[];
  slackPolicy?: SlackPolicy;
}
export type PackageOutput = PlanPackage;

// ─── 12. Adapt (Future/Feedback loop) ─────────────────────────────────────────
export type AdaptiveMode = 'ABSORB' | 'PARTIAL_REPAIR' | 'REBASE';
export type AdaptiveStatus = 'pending' | 'ready' | 'error';
export type AdaptiveActivityOutcome = 'SUCCESS' | 'PARTIAL' | 'MISSED';
export type AdaptiveRelaunchPhase =
  | 'strategy'
  | 'template'
  | 'schedule'
  | 'hardValidate'
  | 'softValidate'
  | 'coveVerify'
  | 'repair'
  | 'package';

export interface AdaptiveActivityLog {
  progressionKey?: string;
  activityId?: string;
  planItemId?: string;
  occurredAt: string;
  scheduledStartAt?: string;
  plannedMinutes?: number;
  completedMinutes?: number;
  overlapMinutes?: number;
  note?: string;
  outcome: AdaptiveActivityOutcome;
}

export interface AdaptiveAssessment {
  progressionKey: string;
  activityIds: string[];
  habitState: HabitState;
  adherence: AdherenceScore;
  risk: RiskForecast;
  logCount: number;
  failureCount: number;
  partialCount: number;
  overlapMinutes: number;
  banalOverlap: boolean;
}

export interface AdaptiveActivityAdjustment {
  activityId: string;
  originalDurationMin?: number;
  suggestedDurationMin?: number;
  minimumViableMinutes?: number;
  minimumViableDescription?: string;
  relaxConstraintTierTo?: ActivityRequest['constraintTier'];
  countsMinimumViableAsSuccess?: boolean;
}

export interface AdaptiveDispatch {
  rerunFromPhase: 'schedule' | 'strategy';
  phasesToRun: AdaptiveRelaunchPhase[];
  preserveSkeleton: boolean;
  preserveHabitState: boolean;
  allowSlackRecovery: boolean;
  relaxSoftConstraints: boolean;
  maxChurnMoves: number;
  affectedProgressionKeys: string[];
  activityAdjustments: AdaptiveActivityAdjustment[];
  slackPolicy: SlackPolicy;
  reason: string;
}

export interface AdaptiveInput {
  package: PlanPackage;
  activityLogs: AdaptiveActivityLog[];
  anchorAt?: string;
  userFeedback?: string;
}

export interface AdaptiveOutput {
  mode: AdaptiveMode;
  overallRisk: RiskForecast;
  assessments: AdaptiveAssessment[];
  dispatch: AdaptiveDispatch;
  summary_esAR: string;
  recommendations: string[];
  changesMade: string[];
}

export type AdaptInput = AdaptiveInput;
export type AdaptOutput = AdaptiveOutput;

export interface V5PhaseTimingSnapshot {
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface V5RepairPhaseSnapshot extends V5PhaseTimingSnapshot {
  phase: 'hardValidate' | 'softValidate' | 'coveVerify' | 'repair';
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped' | 'exhausted';
  summaryLabel: string | null;
}

export interface V5RepairCycleSnapshot {
  cycle: number;
  status: 'repaired' | 'clean' | 'exhausted';
  findings: {
    fail: number;
    warn: number;
    info: number;
  };
  scoreBefore: number | null;
  scoreAfter: number | null;
  phases: V5RepairPhaseSnapshot[];
}

export interface V5PhaseSnapshot {
  runId: string;
  modelId: string | null;
  qualityScore: number;
  startedAt: string;
  finishedAt: string | null;
  phaseTimeline: Partial<Record<
    'classify'
    | 'requirements'
    | 'profile'
    | 'strategy'
    | 'template'
    | 'schedule'
    | 'hardValidate'
    | 'softValidate'
    | 'coveVerify'
    | 'repair'
    | 'package'
    | 'adapt',
    V5PhaseTimingSnapshot
  >>;
  phaseStatuses: Partial<Record<
    'classify'
    | 'requirements'
    | 'profile'
    | 'strategy'
    | 'template'
    | 'schedule'
    | 'hardValidate'
    | 'softValidate'
    | 'coveVerify'
    | 'repair'
    | 'package'
    | 'adapt',
    'pending' | 'running' | 'success' | 'error' | 'skipped'
  >>;
  repairTimeline: V5RepairCycleSnapshot[];
}

export interface StoredAdaptiveState {
  status: AdaptiveStatus;
  output: AdaptiveOutput | null;
  updatedAt: string;
  lastError: string | null;
}


// ─── V5 Registry ──────────────────────────────────────────────────────────────
export interface PhaseIORegistryV5 {
  classify?: PhaseIO<ClassifyInput, ClassifyOutput>;
  requirements?: PhaseIO<RequirementsInput, RequirementsOutput>;
  profile?: PhaseIO<ProfileInput, ProfileOutput>;
  strategy?: PhaseIO<StrategyInput, StrategyOutput>;
  template?: PhaseIO<TemplateInput, TemplateOutput>;
  schedule?: PhaseIO<ScheduleInput, ScheduleOutput>;
  hardValidate?: PhaseIO<HardValidateInput, HardValidateOutput>;
  softValidate?: PhaseIO<SoftValidateInput, SoftValidateOutput>;
  coveVerify?: PhaseIO<CoVeVerifyInput, CoVeVerifyOutput>;
  repair?: PhaseIO<RepairInput, RepairOutput>;
  package?: PhaseIO<PackageInput, PackageOutput>;
  adapt?: PhaseIO<AdaptInput, AdaptOutput>;
}
