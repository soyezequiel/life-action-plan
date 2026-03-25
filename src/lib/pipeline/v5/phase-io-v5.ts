import type { PhaseIO } from '../phase-io';
import type { GoalClassification } from '../../domain/goal-taxonomy';
import type { ActivityRequest, SchedulerOutput } from '../../scheduler/types';
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
export interface HardValidateInput { schedule: SchedulerOutput; }
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
  items: PlanItem[];
  summary_esAR: string;
  qualityScore: number;
  implementationIntentions: string[];
  warnings: string[];
}
export interface PackageInput { finalSchedule: SchedulerOutput; }
export type PackageOutput = PlanPackage;

// ─── 12. Adapt (Future/Feedback loop) ─────────────────────────────────────────
export interface AdaptationResult { changesMade: string[]; }
export interface AdaptInput { package: PlanPackage; userFeedback: string; }
export type AdaptOutput = AdaptationResult;


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
