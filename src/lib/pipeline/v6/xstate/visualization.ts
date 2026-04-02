import { toDirectedGraph } from 'xstate/graph';

import type { V6AgentName, V6MachineStateValue } from '../types';

import { v6GenerationMachine } from './machine';

export type V6VisualizerMode = 'standard' | 'analyst';

export interface V6MachineVisualNode {
  stateId: V6MachineStateValue;
  labelKey: string;
  fallbackLabel: string;
  progressTarget: number;
  agentName: V6AgentName | null;
  orderHint: number;
  hidden: boolean;
  visibleIn: V6VisualizerMode[];
}

export interface V6MachineVisualEdge {
  id: string;
  source: V6MachineStateValue;
  target: V6MachineStateValue;
  label: string | null;
}

interface MachineVisualMeta {
  labelKey?: string;
  fallbackLabel?: string;
  progressTarget?: number;
  agentName?: V6AgentName | null;
  orderHint?: number;
  hidden?: boolean;
  visibleIn?: V6VisualizerMode[];
}

function humanizeStateId(stateId: string): string {
  return stateId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isMachineStateValue(value: string): value is V6MachineStateValue {
  return [
    'boot',
    'interpret',
    'clarify',
    'paused_for_input',
    'plan',
    'check',
    'schedule',
    'critique',
    'revise',
    'package',
    'done',
    'blocked',
    'failed',
  ].includes(value);
}

function resolveStateMeta(stateId: V6MachineStateValue): V6MachineVisualNode {
  const stateNode = v6GenerationMachine.root.states[stateId];
  const meta = (stateNode?.config?.meta as { visual?: MachineVisualMeta } | undefined)?.visual ?? {};

  return {
    stateId,
    labelKey: meta.labelKey ?? `visualizer.phase.${stateId}`,
    fallbackLabel: meta.fallbackLabel ?? humanizeStateId(stateId),
    progressTarget: meta.progressTarget ?? 0,
    agentName: typeof meta.agentName === 'undefined' ? null : meta.agentName,
    orderHint: meta.orderHint ?? 999,
    hidden: meta.hidden === true,
    visibleIn: meta.visibleIn ?? ['analyst'],
  };
}

function collectVisualStates(): Map<V6MachineStateValue, V6MachineVisualNode> {
  const directedGraph = toDirectedGraph(v6GenerationMachine);
  const visualStates = new Map<V6MachineStateValue, V6MachineVisualNode>();

  const visit = (node: typeof directedGraph): void => {
    const stateId = node.stateNode.key;
    if (isMachineStateValue(stateId) && !visualStates.has(stateId)) {
      visualStates.set(stateId, resolveStateMeta(stateId));
    }

    node.children.forEach(visit);
  };

  visit(directedGraph);

  return visualStates;
}

const ALL_VISUAL_STATES = collectVisualStates();

export function getV6MachineVisualNodes(mode: V6VisualizerMode): V6MachineVisualNode[] {
  return Array.from(ALL_VISUAL_STATES.values())
    .filter((node) => !node.hidden && node.visibleIn.includes(mode))
    .sort((left, right) => left.orderHint - right.orderHint || left.stateId.localeCompare(right.stateId));
}

function collectEdges(): V6MachineVisualEdge[] {
  const directedGraph = toDirectedGraph(v6GenerationMachine);
  const edges = new Map<string, V6MachineVisualEdge>();

  const visit = (node: typeof directedGraph): void => {
    node.edges.forEach((edge) => {
      const sourceId = edge.source.key;
      const targetId = edge.target.key;

      if (!isMachineStateValue(sourceId) || !isMachineStateValue(targetId)) {
        return;
      }

      const labelText = edge.label?.text?.trim() || null;
      const edgeId = `${sourceId}->${targetId}:${labelText ?? 'direct'}`;

      if (!edges.has(edgeId)) {
        edges.set(edgeId, {
          id: edgeId,
          source: sourceId,
          target: targetId,
          label: labelText,
        });
      }
    });

    node.children.forEach(visit);
  };

  visit(directedGraph);

  return Array.from(edges.values());
}

const ALL_VISUAL_EDGES = collectEdges();

export function getV6MachineVisualEdges(mode: V6VisualizerMode): V6MachineVisualEdge[] {
  const visibleNodeIds = new Set(getV6MachineVisualNodes(mode).map((node) => node.stateId));

  return ALL_VISUAL_EDGES.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
}

export function getV6MachineInitialVisibleState(mode: V6VisualizerMode): V6MachineStateValue | null {
  return getV6MachineVisualNodes(mode)[0]?.stateId ?? null;
}
