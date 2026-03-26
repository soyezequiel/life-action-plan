import type { PhaseIO } from './phase-io';

export interface PipelineBuildResult {
  nombre: string;
  resumen?: string;
  fallbackUsed?: boolean;
  tokensUsed?: { input: number; output: number };
  eventos?: Array<{
    semana: number;
    dia: string;
    hora: string;
    duracion: number;
    actividad: string;
    categoria: string;
  }>;
}

export interface PipelineSimulationResult {
  qualityScore?: number;
  findings: Array<{
    status: string;
    code: string;
    params?: Record<string, string | number>;
  }>;
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
}

export interface PipelineContext {
  profileId?: string;
  planId?: string;
  phaseIO: Record<string, PhaseIO<Record<string, unknown>, Record<string, unknown>> | undefined>;
  intakeSummary?: {
    nombre?: string;
    edad?: number;
    ciudad?: string;
    objetivo?: string;
  };
  enrichment?: {
    inferences: Array<{
      field: string;
      value: unknown;
      confidence: string;
      reason: string;
    }>;
    warnings: string[];
  };
  readiness?: {
    warnings: string[];
    constraints: string[];
  };
  results: {
    build?: PipelineBuildResult;
    simulate?: {
      simulation: PipelineSimulationResult;
    };
  };
  repair?: {
    attempts: number;
    history: Array<{
      attempt: number;
      findingsCount: number;
      qualityScore: number;
      repairNotes: string;
    }>;
  };
  output?: {
    deliveryMode: string;
    finalQualityScore: number;
  };
}
