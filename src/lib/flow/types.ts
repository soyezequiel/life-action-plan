export type FlowStepType = 'action' | 'validation' | 'persistence' | 'external' | 'branch' | 'loop' | 'output'

export type FlowPhase = {
  id: string;
  name: string;
  color: string;
}

export type FlowStep = {
  id: string;
  phaseId: string;
  name: string;
  description: string;
  type: FlowStepType;
  dependsOn?: string[];
  tags?: string[];
  questions?: string[];
  prompt?: string; // Nuevo: El prompt de entrada / rol del agente
}

// ─── Runtime data types (injected from pipeline execution) ───────────────────

export type FlowNodeRuntimeStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped'
