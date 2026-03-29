import { z } from 'zod';

import {
  GoalDomainRiskSchema,
  GoalTypeSchema,
  type GoalDomainRisk,
  type GoalType,
} from '../../domain/goal-taxonomy';
import {
  DomainKnowledgeCardSchema,
  type DomainKnowledgeCard,
} from '../../domain/domain-knowledge/bank';
import { HabitStateSchema } from '../../domain/habit-state';
import { PlanItemSchema } from '../../domain/plan-item';
import { V5PlanSchema } from '../../domain/rolling-wave-plan';
import { SlackPolicySchema } from '../../domain/slack-policy';
import {
  SchedulerOutputSchema as SchedulerOutputBaseSchema,
  TradeoffSchema,
  type SchedulerOutput,
} from '../../scheduler/types';
import type { AgentRuntime } from '../../runtime/types';
import type {
  PlanPackage as V5PlanPackage,
  StrategicRoadmap as V5StrategicRoadmap,
  UserProfileV5,
} from '../shared/phase-io';

export type { DomainKnowledgeCard, GoalDomainRisk, GoalType, SchedulerOutput, UserProfileV5 };
export { DomainKnowledgeCardSchema, GoalDomainRiskSchema, GoalTypeSchema };

export const V6AgentNameSchema = z.enum([
  'goal-interpreter',
  'clarifier',
  'planner',
  'feasibility-checker',
  'scheduler',
  'critic',
  'domain-expert',
  'packager',
]);
export type V6AgentName = z.infer<typeof V6AgentNameSchema>;

export const OrchestratorPhaseSchema = z.enum([
  'interpret',
  'clarify',
  'plan',
  'check',
  'schedule',
  'critique',
  'revise',
  'package',
  'done',
  'failed',
]);
export type OrchestratorPhase = z.infer<typeof OrchestratorPhaseSchema>;

export const GoalInterpretationSchema = z.object({
  parsedGoal: z.string(),
  goalType: GoalTypeSchema,
  implicitAssumptions: z.array(z.string()),
  ambiguities: z.array(z.string()),
  riskFlags: z.array(GoalDomainRiskSchema),
  suggestedDomain: z.string().nullable(),
  confidence: z.number().min(0).max(1),
}).strict();
export type GoalInterpretation = z.infer<typeof GoalInterpretationSchema>;

export const ClarificationQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  purpose: z.string(),
  type: z.enum(['text', 'number', 'select', 'range']),
  options: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
}).strict();
export type ClarificationQuestion = z.infer<typeof ClarificationQuestionSchema>;

export const ClarificationRoundSchema = z.object({
  questions: z.array(ClarificationQuestionSchema).max(4),
  reasoning: z.string(),
  informationGaps: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  readyToAdvance: z.boolean(),
}).strict();
export type ClarificationRound = z.infer<typeof ClarificationRoundSchema>;

export const FeasibilityConflictSchema = z.object({
  description: z.string(),
  severity: z.enum(['blocking', 'warning']),
  affectedPhases: z.array(z.string()),
}).strict();
export type FeasibilityConflict = z.infer<typeof FeasibilityConflictSchema>;

export const FeasibilityAdjustmentSchema = z.object({
  type: z.enum(['reduce_hours', 'extend_timeline', 'drop_phase', 'reorder']),
  description: z.string(),
  impact: z.string(),
}).strict();
export type FeasibilityAdjustment = z.infer<typeof FeasibilityAdjustmentSchema>;

export const FeasibilityReportSchema = z.object({
  status: z.enum(['feasible', 'tight', 'infeasible']),
  hoursBudget: z.object({
    available: z.number(),
    required: z.number(),
    gap: z.number(),
  }).strict(),
  energyAnalysis: z.object({
    highEnergyNeeded: z.number(),
    highEnergyAvailable: z.number(),
  }).strict(),
  conflicts: z.array(FeasibilityConflictSchema),
  suggestions: z.array(FeasibilityAdjustmentSchema),
}).strict();
export type FeasibilityReport = z.infer<typeof FeasibilityReportSchema>;

export const CriticFindingSchema = z.object({
  id: z.string(),
  severity: z.enum(['critical', 'warning', 'info']),
  category: z.enum(['feasibility', 'specificity', 'progression', 'scheduling', 'motivation', 'domain']),
  message: z.string(),
  suggestion: z.string().nullable(),
  affectedPhaseIds: z.array(z.string()),
}).strict();
export type CriticFinding = z.infer<typeof CriticFindingSchema>;

export const CriticReportSchema = z.object({
  overallScore: z.number().min(0).max(100),
  findings: z.array(CriticFindingSchema),
  mustFix: z.array(CriticFindingSchema),
  shouldFix: z.array(CriticFindingSchema),
  verdict: z.enum(['approve', 'revise', 'rethink']),
  reasoning: z.string(),
}).strict();
export type CriticReport = z.infer<typeof CriticReportSchema>;

export const ReasoningEntrySchema = z.object({
  phase: OrchestratorPhaseSchema,
  agent: V6AgentNameSchema,
  iteration: z.number().int().min(1),
  action: z.string(),
  reasoning: z.string(),
  result: z.string(),
  tokensUsed: z.number().int().min(0),
  timestamp: z.string(),
}).strict();
export type ReasoningEntry = z.infer<typeof ReasoningEntrySchema>;

export const AgentExecutionOutcomeSchema = z.object({
  agent: V6AgentNameSchema,
  phase: OrchestratorPhaseSchema,
  source: z.enum(['llm', 'fallback', 'deterministic']),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  durationMs: z.number().int().min(0),
}).strict();
export type AgentExecutionOutcome = z.infer<typeof AgentExecutionOutcomeSchema>;

export const OrchestratorDebugEventSchema = z.object({
  sequence: z.number().int().min(1),
  timestamp: z.string(),
  category: z.enum(['lifecycle', 'phase', 'agent', 'critic', 'publication']),
  action: z.string().trim().min(1),
  summary_es: z.string().trim().min(1),
  phase: OrchestratorPhaseSchema.nullable(),
  agent: V6AgentNameSchema.nullable(),
  iteration: z.number().int().min(0),
  revisionCycle: z.number().int().min(0),
  clarifyRound: z.number().int().min(0),
  progressScore: z.number().min(0).max(100),
  degraded: z.boolean(),
  fallbackCount: z.number().int().min(0),
  publicationState: z.enum(['ready', 'blocked', 'failed']).nullable(),
  failureCode: z.string().nullable(),
  errorCode: z.string().nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
}).strict();
export type OrchestratorDebugEvent = z.infer<typeof OrchestratorDebugEventSchema>;

export const OrchestratorDebugStatusSchema = z.object({
  lifecycle: z.enum(['idle', 'running', 'paused_for_input', 'completed', 'failed']),
  currentPhase: OrchestratorPhaseSchema.nullable(),
  currentAgent: V6AgentNameSchema.nullable(),
  currentAction: z.string().trim().min(1),
  currentSummary_es: z.string().trim().min(1),
  iteration: z.number().int().min(0),
  revisionCycles: z.number().int().min(0),
  clarifyRounds: z.number().int().min(0),
  progressScore: z.number().min(0).max(100),
  degraded: z.boolean(),
  fallbackCount: z.number().int().min(0),
  publicationState: z.enum(['ready', 'blocked', 'failed']).nullable(),
  failureCode: z.string().nullable(),
  lastEventSequence: z.number().int().min(0),
  lastEventTimestamp: z.string().nullable(),
  lastEventSummary_es: z.string().nullable(),
}).strict();
export type OrchestratorDebugStatus = z.infer<typeof OrchestratorDebugStatusSchema>;

export const OrchestratorHeartbeatSchema = z.object({
  timestamp: z.string(),
  status: OrchestratorDebugStatusSchema,
}).strict();
export type OrchestratorHeartbeat = z.infer<typeof OrchestratorHeartbeatSchema>;

export const PlanQualityIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(['warning', 'blocking']),
  message: z.string(),
}).strict();
export type PlanQualityIssue = z.infer<typeof PlanQualityIssueSchema>;

export const PlanSignalUsageSchema = z.object({
  signal: z.string(),
  expectedValue: z.string(),
  used: z.boolean(),
  evidence: z.array(z.string()),
}).strict();
export type PlanSignalUsage = z.infer<typeof PlanSignalUsageSchema>;

export const PlanIntakeCoverageSchema = z.object({
  requiredSignals: z.array(z.string()),
  missingSignals: z.array(z.string()),
  signalUsage: z.array(PlanSignalUsageSchema),
}).strict();
export type PlanIntakeCoverage = z.infer<typeof PlanIntakeCoverageSchema>;

export const OrchestratorStateSchema = z.object({
  phase: OrchestratorPhaseSchema,
  iteration: z.number().int().min(0),
  maxIterations: z.number().int().min(1),
  clarifyRounds: z.number().int().min(0),
  maxClarifyRounds: z.number().int().min(1),
  revisionCycles: z.number().int().min(0),
  maxRevisionCycles: z.number().int().min(0),
  tokenBudget: z.object({
    used: z.number().int().min(0),
    limit: z.number().int().min(1),
  }).strict(),
  progressScore: z.number().min(0).max(100),
  scratchpad: z.array(ReasoningEntrySchema),
}).strict();
export type OrchestratorState = z.infer<typeof OrchestratorStateSchema>;

export const UserProfileV5Schema: z.ZodType<UserProfileV5> = z.object({
  freeHoursWeekday: z.number(),
  freeHoursWeekend: z.number(),
  energyLevel: z.enum(['low', 'medium', 'high']),
  fixedCommitments: z.array(z.string()),
  scheduleConstraints: z.array(z.string()),
}).strict();

export type StrategicDraft = V5StrategicRoadmap;
export const StrategicDraftPhaseSchema = z.object({
  name: z.string(),
  durationWeeks: z.number().optional(),
  focus_esAR: z.string(),
}).strict();
export const StrategicDraftSchema: z.ZodType<StrategicDraft> = z.object({
  phases: z.array(StrategicDraftPhaseSchema),
  milestones: z.array(z.string()),
  totalSpanWeeks: z.number().optional(),
}).strict();

export const SchedulerOutputSchema: z.ZodType<SchedulerOutput> = SchedulerOutputBaseSchema;

export const ScheduleExecutionResultSchema = z.object({
  solverOutput: SchedulerOutputSchema,
  tradeoffs: z.array(z.string()),
  qualityScore: z.number().min(0).max(100),
  unscheduledCount: z.number().int().min(0),
}).strict();
export type ScheduleExecutionResult = z.infer<typeof ScheduleExecutionResultSchema>;

export type PlanPackage = Omit<V5PlanPackage, 'agentOutcomes' | 'degraded'> & {
  reasoningTrace?: ReasoningEntry[];
  agentOutcomes?: AgentExecutionOutcome[];
  degraded?: boolean;
};
export const PlanPackageSchema: z.ZodType<PlanPackage> = z.object({
  plan: V5PlanSchema,
  items: z.array(PlanItemSchema),
  habitStates: z.array(HabitStateSchema),
  slackPolicy: SlackPolicySchema,
  timezone: z.string(),
  summary_esAR: z.string(),
  qualityScore: z.number(),
  implementationIntentions: z.array(z.string()),
  warnings: z.array(z.string()),
  tradeoffs: z.array(TradeoffSchema).optional(),
  publicationState: z.enum(['publishable', 'requires_regeneration', 'failed_for_quality_review']).optional(),
  qualityIssues: z.array(PlanQualityIssueSchema).optional(),
  requestDomain: z.string().nullable().optional(),
  packageDomain: z.string().nullable().optional(),
  intakeCoverage: PlanIntakeCoverageSchema.nullable().optional(),
  reasoningTrace: z.array(ReasoningEntrySchema).optional(),
  agentOutcomes: z.array(AgentExecutionOutcomeSchema).optional(),
  degraded: z.boolean().optional(),
}).strict();

export const RevisionHistoryEntrySchema = z.object({
  findings: z.array(CriticFindingSchema),
  appliedFixes: z.array(z.string()),
}).strict();
export type RevisionHistoryEntry = z.infer<typeof RevisionHistoryEntrySchema>;

export const OrchestratorContextSchema = z.object({
  goalText: z.string(),
  interpretation: GoalInterpretationSchema.nullable(),
  clarificationRounds: z.array(ClarificationRoundSchema),
  userAnswers: z.record(z.string()),
  userProfile: UserProfileV5Schema.nullable(),
  domainCard: DomainKnowledgeCardSchema.nullable(),
  strategicDraft: StrategicDraftSchema.nullable(),
  feasibilityReport: FeasibilityReportSchema.nullable(),
  scheduleResult: ScheduleExecutionResultSchema.nullable(),
  criticReport: CriticReportSchema.nullable(),
  revisionHistory: z.array(RevisionHistoryEntrySchema),
  finalPackage: PlanPackageSchema.nullable(),
  availability: z.array(z.object({ day: z.string(), startTime: z.string(), endTime: z.string() })).optional(),
  blocked: z.array(z.object({ day: z.string(), startTime: z.string(), endTime: z.string(), reason: z.string() })).optional(),
}).strict();
export type OrchestratorContext = z.infer<typeof OrchestratorContextSchema>;

export interface V6Agent<TInput, TOutput> {
  name: V6AgentName
  execute(input: TInput, runtime: AgentRuntime): Promise<TOutput>
  fallback(input: TInput): TOutput
}

const AgentRuntimeValueSchema: z.ZodType<AgentRuntime> = z.custom<AgentRuntime>((value): value is AgentRuntime => {
  return typeof value === 'object'
    && value !== null
    && typeof (value as AgentRuntime).chat === 'function'
    && typeof (value as AgentRuntime).stream === 'function'
    && typeof (value as AgentRuntime).newContext === 'function';
});

export function createV6AgentSchema<TInputSchema extends z.ZodTypeAny, TOutputSchema extends z.ZodTypeAny>(
  inputSchema: TInputSchema,
  outputSchema: TOutputSchema,
) {
  return z.object({
    name: V6AgentNameSchema,
    execute: z.function().args(inputSchema, AgentRuntimeValueSchema).returns(z.promise(outputSchema)),
    fallback: z.function().args(inputSchema).returns(outputSchema),
  }).strict();
}

export const V6AgentSchema = createV6AgentSchema(z.unknown(), z.unknown());

export const OrchestratorConfigSchema = z.object({
  maxIterations: z.number().int().min(1),
  maxClarifyRounds: z.number().int().min(1),
  maxRevisionCycles: z.number().int().min(0),
  tokenBudgetLimit: z.number().int().min(1),
  criticApprovalThreshold: z.number().min(0).max(100),
  enableDomainExpert: z.boolean(),
}).strict();
export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;

export const V6BuildSessionRequestSchema = z.object({
  goalText: z.string().trim().min(1),
  profileId: z.string().trim().min(1),
  provider: z.string().trim().min(1).nullable(),
  resourceMode: z.enum(['auto', 'backend', 'user', 'codex']).nullable(),
  apiKey: z.string().trim().min(1).nullable(),
  backendCredentialId: z.string().trim().min(1).nullable(),
  thinkingMode: z.enum(['enabled', 'disabled']).nullable(),
}).strict();
export type V6BuildSessionRequest = z.infer<typeof V6BuildSessionRequestSchema>;

export const PlanOrchestratorSnapshotSchema = z.object({
  config: OrchestratorConfigSchema,
  state: OrchestratorStateSchema,
  context: OrchestratorContextSchema,
  scratchpad: z.array(ReasoningEntrySchema),
  lastAction: z.string(),
  pendingAnswers: z.record(z.string()).nullable(),
  progressHistory: z.array(z.number().min(0).max(100)),
  agentOutcomes: z.array(AgentExecutionOutcomeSchema).optional(),
  debugTrace: z.array(OrchestratorDebugEventSchema).optional(),
}).strict();
export type PlanOrchestratorSnapshot = z.infer<typeof PlanOrchestratorSnapshotSchema>;

export const V6RuntimeSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  pipeline: z.literal('v6'),
  request: V6BuildSessionRequestSchema,
  orchestrator: PlanOrchestratorSnapshotSchema,
}).strict();
export type V6RuntimeSnapshot = z.infer<typeof V6RuntimeSnapshotSchema>;
