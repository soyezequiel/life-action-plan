import {
  V6RuntimeSnapshotSchema,
  type PlanOrchestratorSnapshot,
  type V6BuildSessionRequest,
  type V6RuntimeSnapshot,
} from './types';

export function createV6RuntimeSnapshot(input: {
  request: V6BuildSessionRequest
  orchestrator: PlanOrchestratorSnapshot
}): V6RuntimeSnapshot {
  return V6RuntimeSnapshotSchema.parse({
    schemaVersion: 1,
    pipeline: 'v6',
    request: input.request,
    orchestrator: input.orchestrator,
  });
}

export function parseV6RuntimeSnapshot(snapshot: unknown): V6RuntimeSnapshot {
  return V6RuntimeSnapshotSchema.parse(snapshot);
}
