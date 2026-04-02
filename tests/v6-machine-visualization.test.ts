import { describe, expect, it } from 'vitest';

import { buildAnalystCanvasTopology } from '../components/pipeline-visualizer/analyst-canvas-layout';
import {
  getV6MachineInitialVisibleState,
  getV6MachineVisualEdges,
  getV6MachineVisualNodes,
} from '../src/lib/pipeline/v6/xstate/visualization';
import type { PipelineVisualizerState } from '../components/pipeline-visualizer/pipeline-visualizer-types';

function createVisualizerState(): PipelineVisualizerState {
  const phases = getV6MachineVisualNodes('analyst').map((node) => ({
    phase: node.stateId,
    labelKey: node.labelKey,
    fallbackLabel: node.fallbackLabel,
    targetProgress: node.progressTarget,
    status: 'pending' as const,
    agentName: node.agentName,
  }));

  return {
    phases,
    currentPhase: 'clarify',
    progressScore: 25,
    lastAction: 'haciendo preguntas',
    lifecycle: 'running',
    sessionId: null,
    degraded: false,
    notifications: [],
    storage: {
      sessionSaved: false,
      planSaved: false,
    },
  };
}

describe('v6 machine visualization', () => {
  it('deriva nodos del modo analista desde la maquina real', () => {
    const nodes = getV6MachineVisualNodes('analyst');
    const stateIds = nodes.map((node) => node.stateId);

    expect(stateIds).toContain('paused_for_input');
    expect(stateIds).toContain('blocked');
    expect(stateIds).toContain('done');
    expect(stateIds).toContain('failed');
    expect(stateIds).not.toContain('boot');
    expect(getV6MachineInitialVisibleState('analyst')).toBe('interpret');
  });

  it('filtra la vista estandar y conserva las transiciones reales entre estados visibles', () => {
    const nodes = getV6MachineVisualNodes('standard');
    const stateIds = nodes.map((node) => node.stateId);
    const edges = getV6MachineVisualEdges('standard');

    expect(stateIds).not.toContain('paused_for_input');
    expect(stateIds).not.toContain('blocked');
    expect(stateIds).toContain('interpret');
    expect(stateIds).toContain('package');

    expect(edges.some((edge) => edge.source === 'critique' && edge.target === 'revise')).toBe(true);
    expect(edges.some((edge) => edge.source === 'critique' && edge.target === 'clarify')).toBe(true);
    expect(edges.some((edge) => edge.source === 'package' && edge.target === 'done')).toBe(true);
    expect(edges.some((edge) => edge.source === 'package' && edge.target === 'blocked')).toBe(false);
  });

  it('construye el canvas analista con la misma distribucion base por zonas', () => {
    const state = createVisualizerState();
    const topology = buildAnalystCanvasTopology(
      getV6MachineVisualNodes('analyst'),
      getV6MachineVisualEdges('analyst'),
      state,
    );
    const nodeIds = topology.nodes.map((node) => node.id);
    const nodeById = new Map(topology.nodes.map((node) => [node.id, node]));

    expect(nodeIds).toContain('zone-user');
    expect(nodeIds).toContain('zone-server');
    expect(nodeIds).toContain('zone-pipeline');
    expect(nodeIds).toContain('zone-storage');
    expect(nodeIds).toContain('zone-notifications');
    expect(nodeIds).toContain('server-build');
    expect(nodeIds).toContain('notify-phase-change');
    expect(nodeIds).toContain('notify-progress');

    expect((nodeById.get('user-goal')?.position.x ?? 0)).toBeLessThan(nodeById.get('server-build')?.position.x ?? 0);
    expect((nodeById.get('server-build')?.position.x ?? 0)).toBeLessThan(nodeById.get('node-interpret')?.position.x ?? 0);
    expect((nodeById.get('node-interpret')?.position.x ?? 0)).toBeLessThan(nodeById.get('storage-session')?.position.x ?? 0);
    expect((nodeById.get('storage-session')?.position.x ?? 0)).toBeLessThan(nodeById.get('notify-phase-change')?.position.x ?? 0);
  });

  it('preserva posiciones movidas por el usuario cuando cambia el estado runtime', () => {
    const baseState = createVisualizerState();
    const machineNodes = getV6MachineVisualNodes('analyst');
    const machineEdges = getV6MachineVisualEdges('analyst');
    const firstTopology = buildAnalystCanvasTopology(machineNodes, machineEdges, baseState);
    const movedNodes = firstTopology.nodes.map((node) => (
      node.id === 'node-clarify'
        ? { ...node, position: { x: node.position.x + 48, y: node.position.y + 32 } }
        : node
    ));

    const nextState: PipelineVisualizerState = {
      ...baseState,
      currentPhase: 'plan',
      progressScore: 40,
      lastAction: 'planificando',
      phases: baseState.phases.map((phase) => {
        if (phase.phase === 'clarify') {
          return { ...phase, status: 'completed' as const };
        }
        if (phase.phase === 'plan') {
          return { ...phase, status: 'active' as const };
        }
        return phase;
      }),
    };
    const secondTopology = buildAnalystCanvasTopology(machineNodes, machineEdges, nextState, movedNodes);
    const clarifyNode = secondTopology.nodes.find((node) => node.id === 'node-clarify');

    expect(clarifyNode?.position).toEqual(
      movedNodes.find((node) => node.id === 'node-clarify')?.position,
    );
  });
});
