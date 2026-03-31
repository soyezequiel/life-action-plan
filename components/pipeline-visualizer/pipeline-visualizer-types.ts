import type { OrchestratorPhase, V6AgentName } from '../../src/lib/pipeline/v6/types';

export type PhaseNodeStatus =
  | 'pending'
  | 'active'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'degraded';

export interface PhaseNodeData {
  phase: OrchestratorPhase;
  labelKey: string;
  targetProgress: number;
  status: PhaseNodeStatus;
  agentName: V6AgentName | null;
  iteration?: number;
  maxIterations?: number;
  statusDetail?: string;
}

export interface VisualizerNotification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  messageKey?: string;
  message?: string;
  timestamp: string;
}

export interface PipelineVisualizerState {
  phases: PhaseNodeData[];
  currentPhase: OrchestratorPhase | null;
  progressScore: number;
  lastAction: string;
  lifecycle: 'idle' | 'running' | 'paused_for_input' | 'completed' | 'failed';
  sessionId: string | null;
  degraded: boolean;
  notifications: VisualizerNotification[];
  storage: {
    sessionSaved: boolean;
    planSaved: boolean;
  };
}

export const PHASE_ORDER: Array<{
  phase: OrchestratorPhase;
  targetProgress: number;
  agentName: V6AgentName | null;
  labelKey: string;
}> = [
  { phase: 'interpret', targetProgress: 10, agentName: 'goal-interpreter', labelKey: 'visualizer.phase.interpret' },
  { phase: 'clarify', targetProgress: 25, agentName: 'clarifier', labelKey: 'visualizer.phase.clarify' },
  { phase: 'plan', targetProgress: 40, agentName: 'planner', labelKey: 'visualizer.phase.plan' },
  { phase: 'check', targetProgress: 50, agentName: 'feasibility-checker', labelKey: 'visualizer.phase.check' },
  { phase: 'schedule', targetProgress: 65, agentName: 'scheduler', labelKey: 'visualizer.phase.schedule' },
  { phase: 'critique', targetProgress: 80, agentName: 'critic', labelKey: 'visualizer.phase.critique' },
  { phase: 'revise', targetProgress: 70, agentName: 'planner', labelKey: 'visualizer.phase.revise' },
  { phase: 'package', targetProgress: 95, agentName: 'packager', labelKey: 'visualizer.phase.package' },
  { phase: 'done', targetProgress: 100, agentName: null, labelKey: 'visualizer.phase.done' },
  { phase: 'failed', targetProgress: 0, agentName: null, labelKey: 'visualizer.phase.failed' }
];
