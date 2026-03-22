import type {
  AvailabilityGrid,
  FlowCheckpoint,
  FlowSession,
  FlowStep,
  GoalDraft,
  PresentationDraft,
  RealityAdjustment,
  RealityCheckResult,
  StrategicPlanDraft,
  StrategicSimulationSnapshot,
  TopDownLevelDraft
} from './flow'

export interface FlowSessionResult {
  success: boolean
  session?: FlowSession
  checkpoints?: FlowCheckpoint[]
  error?: string
}

export type FlowSessionIntent =
  | 'default'
  | 'redo-profile'
  | 'change-objectives'
  | 'restart-flow'

export interface FlowSessionCreateRequest {
  workflowId?: string
  sourceWorkflowId?: string
  intent?: FlowSessionIntent
}

export interface FlowTaskProgress {
  workflowId: string
  step: FlowStep
  stage: string
  current: number
  total: number
  message: string
}

export interface FlowGateRequest {
  choice?: 'pulso' | 'advanced'
  llmMode?: 'service' | 'own' | 'codex' | 'local'
  provider?: string
  backendCredentialId?: string | null
  hasUserApiKey?: boolean
}

export interface FlowObjectivesRequest {
  objectives: string[]
  orderedGoalIds?: string[]
  goals?: GoalDraft[]
}

export interface FlowIntakeRequest {
  answers: Record<string, string>
}

export interface FlowRealityCheckRequest {
  adjustment?: RealityAdjustment
}

export interface FlowPresentationRequest {
  accept?: boolean
  feedback?: string
  edits?: Array<{ id: string; label?: string; detail?: string }>
}

export interface FlowCalendarRequest {
  grid?: AvailabilityGrid
  notes?: string
  icsText?: string
}

export interface FlowTopDownRequest {
  action?: 'generate' | 'confirm' | 'revise' | 'back'
}

export interface FlowResumePatchRequest {
  changeSummary?: string
}

export interface FlowStrategyResult {
  success: boolean
  session?: FlowSession
  strategy?: StrategicPlanDraft
  error?: string
}

export interface FlowRealityResult {
  success: boolean
  session?: FlowSession
  realityCheck?: RealityCheckResult
  error?: string
}

export interface FlowSimulationResult {
  success: boolean
  session?: FlowSession
  simulation?: StrategicSimulationSnapshot
  error?: string
}

export interface FlowPresentationResult {
  success: boolean
  session?: FlowSession
  presentation?: PresentationDraft
  error?: string
}

export interface FlowCalendarResult {
  success: boolean
  session?: FlowSession
  error?: string
}

export interface FlowTopDownResult {
  success: boolean
  session?: FlowSession
  levels?: TopDownLevelDraft[]
  error?: string
}

export interface FlowActivationResult {
  success: boolean
  session?: FlowSession
  profileId?: string
  planId?: string
  error?: string
}
