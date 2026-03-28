import { DateTime } from 'luxon';

import {
  ReasoningEntrySchema,
  type OrchestratorPhase,
  type ReasoningEntry,
  type V6AgentName,
} from './types';

const AGENT_LABELS: Record<V6AgentName, string> = {
  'goal-interpreter': 'el interprete de objetivos',
  clarifier: 'el clarificador',
  planner: 'el planificador',
  'feasibility-checker': 'el verificador de factibilidad',
  scheduler: 'el programador de agenda',
  critic: 'el critico',
  'domain-expert': 'el experto de dominio',
  packager: 'el empaquetador',
};

const PHASE_LABELS: Record<OrchestratorPhase, string> = {
  interpret: 'interpretacion',
  clarify: 'aclaracion',
  plan: 'planificacion',
  check: 'chequeo',
  schedule: 'calendarizacion',
  critique: 'critica',
  revise: 'revision',
  package: 'empaquetado',
  done: 'cierre',
  failed: 'falla',
};

function ensureTimestamp(): string {
  const timestamp = DateTime.utc().toISO();

  if (!timestamp) {
    throw new Error('No se pudo generar un timestamp ISO para el scratchpad');
  }

  return timestamp;
}

function normalizeClause(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  const withoutTrailingPeriod = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
  return withoutTrailingPeriod.charAt(0).toLowerCase() + withoutTrailingPeriod.slice(1);
}

function capitalize(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function sortEntries(entries: ReasoningEntry[]): ReasoningEntry[] {
  return [...entries].sort((left, right) => {
    if (left.iteration !== right.iteration) {
      return left.iteration - right.iteration;
    }

    const leftMillis = DateTime.fromISO(left.timestamp).toMillis();
    const rightMillis = DateTime.fromISO(right.timestamp).toMillis();
    return leftMillis - rightMillis;
  });
}

function describeEntry(entry: ReasoningEntry): string {
  const action = normalizeClause(entry.action);
  const result = normalizeClause(entry.result);
  const agent = AGENT_LABELS[entry.agent];
  const phase = PHASE_LABELS[entry.phase];

  if (action && result) {
    return `${agent} en ${phase} ${action}; resultado: ${result}`;
  }

  if (action) {
    return `${agent} en ${phase} ${action}`;
  }

  if (result) {
    return `${agent} en ${phase} dejo como resultado ${result}`;
  }

  return `${agent} registro actividad en ${phase}`;
}

export class Scratchpad {
  private entries: ReasoningEntry[] = []

  add(entry: Omit<ReasoningEntry, 'timestamp'>): void {
    const parsed = ReasoningEntrySchema.parse({
      ...entry,
      timestamp: ensureTimestamp(),
    });

    this.entries.push(parsed);
  }

  getAll(): ReasoningEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  getByPhase(phase: OrchestratorPhase): ReasoningEntry[] {
    return this.entries
      .filter((entry) => entry.phase === phase)
      .map((entry) => ({ ...entry }));
  }

  getByAgent(agent: V6AgentName): ReasoningEntry[] {
    return this.entries
      .filter((entry) => entry.agent === agent)
      .map((entry) => ({ ...entry }));
  }

  summarize(): string {
    if (this.entries.length === 0) {
      return 'No hay razonamiento registrado.';
    }

    const grouped = new Map<number, ReasoningEntry[]>();

    for (const entry of sortEntries(this.entries)) {
      const current = grouped.get(entry.iteration) ?? [];
      current.push(entry);
      grouped.set(entry.iteration, current);
    }

    return Array.from(grouped.entries())
      .sort(([left], [right]) => left - right)
      .map(([iteration, entries]) => {
        const narrative = entries.map(describeEntry).join('. Luego, ');
        return `Iteracion ${iteration}: ${capitalize(narrative)}.`;
      })
      .join(' ');
  }

  totalTokens(): number {
    return this.entries.reduce((total, entry) => total + entry.tokensUsed, 0);
  }

  toJSON(): object {
    return {
      entries: this.getAll(),
    };
  }
}
