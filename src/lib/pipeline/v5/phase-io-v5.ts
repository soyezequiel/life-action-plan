import type { PhaseIO } from '../phase-io';
import type { GoalClassification } from '../../domain/goal-taxonomy';
import type { AdherenceScore } from '../../domain/adherence-model';
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
export interface RequirementsInput { classification: GoalClassification; }
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
export interface StrategyInput {
  profile: UserProfileV5;
  classification: GoalClassification;
  habitStates?: HabitState[];
}
export type StrategyOutput = StrategicRoadmap;

// ─── 5. Template Builder ──────────────────────────────────────────────────────
export interface TemplateInput { roadmap: StrategicRoadmap; }
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
export interface HardValidateInput { schedule: SchedulerOutput; originalInput: SchedulerInput; }
export interface HardValidateOutput { findings: HardFinding[]; }

// ─── 8. Soft Validate ─────────────────────────────────────────────────────────
export interface SoftFinding {
  code: string;
  severity: 'WARN' | 'INFO';
  suggestion_esAR: string;
}
export interface SoftValidateInput { schedule: SchedulerOutput; profile: UserProfileV5; }
export interface SoftValidateOutput { findings: SoftFinding[]; }

// ─── 9. CoVe Vefify ───────────────────────────────────────────────────────────
export interface CoVeFinding {
  question: string;
  answer: string;
  severity: 'FAIL' | 'WARN' | 'INFO';
}
export interface CoVeVerifyInput { schedule: SchedulerOutput; }
export interface CoVeVerifyOutput { findings: CoVeFinding[]; }

// ─── 10. Repair Manager ───────────────────────────────────────────────────────
export interface PatchOp {
  type: 'MOVE' | 'SWAP' | 'DROP' | 'RESIZE';
  targetId: string;
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
  patchesApplied: PatchOp[];
  iterations: number;
  scoreBefore: number;
  scoreAfter: number;
  finalSchedule: SchedulerOutput;
}

// ─── 11. Packager ─────────────────────────────────────────────────────────────
export interface PlanPackage {
  plan: V5Plan;
  items: PlanItem[];
  habitStates: HabitState[];
  slackPolicy: SlackPolicy;
  summary_esAR: string;
  qualityScore: number;
  implementationIntentions: string[];
  warnings: string[];
  tradeoffs?: Tradeoff[];
}
export interface PackageInput {
  finalSchedule: SchedulerOutput;
  classification?: GoalClassification;
  roadmap?: StrategicRoadmap;
  goalText?: string;
  goalId?: string;
  weekStartDate?: string;
  hardFindings?: HardFinding[];
  softFindings?: SoftFinding[];
  coveFindings?: CoVeFinding[];
  repairSummary?: Pick<RepairOutput, 'patchesApplied' | 'iterations' | 'scoreAfter'>;
  profile?: UserProfileV5;
  currentHabitStates?: HabitState[];
  habitProgressionKeys?: string[];
  slackPolicy?: SlackPolicy;
}
export type PackageOutput = PlanPackage;

// ─── 12. Adapt (Future/Feedback loop) ─────────────────────────────────────────
export type AdaptiveMode = 'ABSORB' | 'PARTIAL_REPAIR' | 'REBASE';
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
