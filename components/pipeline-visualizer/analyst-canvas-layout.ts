import { MarkerType, type Edge, type Node, type XYPosition } from '@xyflow/react';

import type {
  PhaseNodeStatus,
  PipelineVisualizerState,
} from './pipeline-visualizer-types';
import type {
  V6MachineVisualEdge,
  V6MachineVisualNode,
} from '@/src/lib/pipeline/v6/xstate/visualization';

type LaneTone = 'user' | 'server' | 'pipeline' | 'storage' | 'notifications';

export type AnalystCanvasNodeStatus = PhaseNodeStatus | 'blocked' | 'info';

export interface AnalystZoneNodeData extends Record<string, unknown> {
  kind: 'zone';
  title: string;
  subtitle: string;
  tone: LaneTone;
}

export interface AnalystPipelineNodeData extends Record<string, unknown> {
  kind: 'pipeline';
  lane: 'pipeline';
  stateId: string;
  labelKey: string;
  fallbackLabel: string;
  agentName: string | null;
  progress: number;
  status: AnalystCanvasNodeStatus;
  orderIndex: number;
  iteration?: number;
}

export interface AnalystSupportNodeData extends Record<string, unknown> {
  kind: 'support';
  lane: Exclude<LaneTone, 'pipeline'>;
  labelKey: string;
  fallbackLabel: string;
  eyebrow: string;
  note?: string;
  status: AnalystCanvasNodeStatus;
}

export type AnalystCanvasNodeData =
  | AnalystZoneNodeData
  | AnalystPipelineNodeData
  | AnalystSupportNodeData;

export interface AnalystCanvasTopology {
  nodes: Array<Node<AnalystCanvasNodeData>>;
  edges: Edge[];
}

const SPECIAL_PIPELINE_STATES = new Set(['paused_for_input', 'revise', 'blocked', 'failed']);

const LANE_SPECS: Record<LaneTone, { x: number; width: number; title: string; subtitle: string }> = {
  user: {
    x: 40,
    width: 260,
    title: 'Usuario',
    subtitle: 'Meta, respuestas y decision final',
  },
  server: {
    x: 336,
    width: 256,
    title: 'Servidor',
    subtitle: 'Entrada inicial y reanudacion',
  },
  pipeline: {
    x: 628,
    width: 540,
    title: 'Motor de generacion',
    subtitle: 'Maquina XState viva',
  },
  storage: {
    x: 1204,
    width: 256,
    title: 'Almacenamiento',
    subtitle: 'Persistencia de sesion y plan',
  },
  notifications: {
    x: 1496,
    width: 292,
    title: 'Notificaciones',
    subtitle: 'Eventos emitidos al navegador',
  },
};

const ZONE_Y = 40;
const ZONE_BORDER_RADIUS = 30;
const MAIN_PIPELINE_X = 748;
const BRANCH_PIPELINE_X = 930;
const MAIN_PIPELINE_Y = 120;
const PIPELINE_VERTICAL_GAP = 144;
const SUPPORT_X_OFFSET = 28;

const FIXED_NODE_IDS = new Set([
  'zone-user',
  'zone-server',
  'zone-pipeline',
  'zone-storage',
  'zone-notifications',
]);

const BROADCAST_PHASES = new Set([
  'interpret',
  'clarify',
  'plan',
  'check',
  'schedule',
  'critique',
  'revise',
  'package',
]);

function edgeLabelFor(source: string, target: string): string | null {
  const key = `${source}->${target}`;
  const labels: Record<string, string> = {
    'clarify->paused_for_input': 'necesita respuestas',
    'clarify->plan': 'maximo 3 rondas',
    'check->plan': 'replanifica',
    'critique->revise': 'encontro problemas',
    'revise->critique': 'maximo 2 ciclos',
    'critique->clarify': 'vuelve a clarificar',
    'critique->package': 'aprobado',
    'package->blocked': 'bloqueado',
    'package->failed': 'fallo',
  };

  return labels[key] ?? null;
}

function isTerminalStatus(status: AnalystCanvasNodeStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'blocked';
}

function isActiveStatus(status: AnalystCanvasNodeStatus): boolean {
  return status === 'active' || status === 'waiting' || status === 'degraded';
}

function toneForStatuses(
  sourceStatus: AnalystCanvasNodeStatus,
  targetStatus: AnalystCanvasNodeStatus,
): { color: string; width: number; animated: boolean; dash?: string } {
  if (sourceStatus === 'blocked' || targetStatus === 'blocked') {
    return { color: '#f59e0b', width: 2.25, animated: false, dash: '7 5' };
  }

  if (sourceStatus === 'failed' || targetStatus === 'failed') {
    return { color: '#ef4444', width: 2.2, animated: false };
  }

  if (sourceStatus === 'degraded' || targetStatus === 'degraded') {
    return { color: '#e9d5ff', width: 2.1, animated: true, dash: '6 6' };
  }

  if (isActiveStatus(sourceStatus) || isActiveStatus(targetStatus)) {
    return { color: '#38bdf8', width: 2.4, animated: true };
  }

  if (isTerminalStatus(sourceStatus) && isTerminalStatus(targetStatus)) {
    return { color: '#a7f3d0', width: 1.95, animated: false };
  }

  if (sourceStatus === 'completed') {
    return { color: '#a7f3d0', width: 1.95, animated: false };
  }

  return { color: 'rgba(100, 116, 139, 0.65)', width: 1.45, animated: false, dash: '3 5' };
}

function resolveHandles(
  sourcePosition: XYPosition,
  targetPosition: XYPosition,
): {
  sourceHandle: 'top' | 'right' | 'bottom' | 'left';
  targetHandle: 'top' | 'right' | 'bottom' | 'left';
} {
  const dx = targetPosition.x - sourcePosition.x;
  const dy = targetPosition.y - sourcePosition.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: 'right', targetHandle: 'left' }
      : { sourceHandle: 'left', targetHandle: 'right' };
  }

  return dy >= 0
    ? { sourceHandle: 'bottom', targetHandle: 'top' }
    : { sourceHandle: 'top', targetHandle: 'bottom' };
}

function machineNodeStatus(
  stateId: string,
  state: PipelineVisualizerState,
): AnalystCanvasNodeStatus {
  const phase = state.phases.find((item) => item.phase === stateId);

  if (stateId === 'blocked' && state.currentPhase === 'blocked') {
    return 'blocked';
  }

  if (phase) {
    if (stateId === 'blocked' && phase.status === 'failed') {
      return 'blocked';
    }

    return phase.status;
  }

  if (stateId === 'done' && state.lifecycle === 'completed') {
    return 'completed';
  }

  if (stateId === 'failed' && state.lifecycle === 'failed') {
    return 'failed';
  }

  return 'pending';
}

function supportNodeStatus(
  nodeId: string,
  state: PipelineVisualizerState,
): AnalystCanvasNodeStatus {
  switch (nodeId) {
    case 'user-goal':
      return state.currentPhase || state.progressScore > 0 ? 'completed' : 'active';
    case 'user-input':
      if (state.lifecycle === 'paused_for_input') return 'waiting';
      if (state.sessionId) return 'completed';
      return 'pending';
    case 'user-review':
      return state.lifecycle === 'completed' ? 'completed' : 'pending';
    case 'server-build':
      return state.currentPhase ? 'completed' : 'pending';
    case 'server-resume':
      if (state.lifecycle === 'paused_for_input') return 'active';
      if (state.sessionId) return 'completed';
      return 'pending';
    case 'storage-session':
      return state.storage.sessionSaved ? 'completed' : 'pending';
    case 'storage-plan':
      return state.storage.planSaved ? 'completed' : 'pending';
    case 'notify-phase-change':
      return state.lifecycle === 'running' ? 'active' : state.currentPhase ? 'completed' : 'pending';
    case 'notify-progress':
      return state.lifecycle === 'running' ? 'active' : state.progressScore > 0 ? 'completed' : 'pending';
    case 'notify-needs-input':
      if (state.lifecycle === 'paused_for_input') return 'waiting';
      if (state.sessionId) return 'completed';
      return 'pending';
    case 'notify-complete':
      return state.lifecycle === 'completed' || state.storage.planSaved ? 'completed' : 'pending';
    case 'notify-blocked':
      if (state.currentPhase === 'blocked') return 'blocked';
      if (state.lifecycle === 'failed') return 'failed';
      return 'pending';
    case 'notify-degraded':
      return state.degraded ? 'degraded' : 'pending';
    default:
      return 'info';
  }
}

function supportNodeNote(nodeId: string, state: PipelineVisualizerState): string | undefined {
  switch (nodeId) {
    case 'server-resume':
      return state.sessionId ? 'retoma desde sesion' : undefined;
    case 'storage-session':
      return state.storage.sessionSaved ? 'sesion persistida' : 'sin pausa';
    case 'storage-plan':
      return state.storage.planSaved ? 'publicado' : 'sin persistir';
    case 'notify-phase-change':
      return state.currentPhase ?? undefined;
    case 'notify-progress':
      return `${state.progressScore}%`;
    case 'notify-needs-input':
      return state.sessionId ? 'esperando respuestas' : undefined;
    case 'notify-complete':
      return state.lifecycle === 'completed' ? 'flujo finalizado' : undefined;
    case 'notify-blocked':
      if (state.currentPhase === 'blocked') return 'publicacion detenida';
      if (state.lifecycle === 'failed') return 'error terminal';
      return undefined;
    case 'notify-degraded':
      return state.degraded ? 'salida con limitaciones' : undefined;
    case 'user-review':
      return state.lifecycle === 'completed' ? 'listo para aceptar' : undefined;
    default:
      return undefined;
  }
}

function buildPipelinePositions(machineNodes: V6MachineVisualNode[]): Map<string, XYPosition> {
  const positions = new Map<string, XYPosition>();
  const mainFlowNodes = machineNodes
    .filter((node) => !SPECIAL_PIPELINE_STATES.has(node.stateId))
    .sort((left, right) => left.orderHint - right.orderHint || left.stateId.localeCompare(right.stateId));

  mainFlowNodes.forEach((node, index) => {
    positions.set(node.stateId, {
      x: MAIN_PIPELINE_X,
      y: MAIN_PIPELINE_Y + index * PIPELINE_VERTICAL_GAP,
    });
  });

  const clarifyY = positions.get('clarify')?.y ?? MAIN_PIPELINE_Y + PIPELINE_VERTICAL_GAP;
  const planY = positions.get('plan')?.y ?? clarifyY + PIPELINE_VERTICAL_GAP;
  const critiqueY = positions.get('critique')?.y ?? MAIN_PIPELINE_Y + PIPELINE_VERTICAL_GAP * 5;
  const packageY = positions.get('package')?.y ?? critiqueY + PIPELINE_VERTICAL_GAP;

  if (machineNodes.some((node) => node.stateId === 'paused_for_input')) {
    positions.set('paused_for_input', {
      x: MAIN_PIPELINE_X - 46,
      y: Math.round((clarifyY + planY) / 2) - 18,
    });
  }

  if (machineNodes.some((node) => node.stateId === 'revise')) {
    positions.set('revise', {
      x: BRANCH_PIPELINE_X,
      y: critiqueY + 118,
    });
  }

  if (machineNodes.some((node) => node.stateId === 'blocked')) {
    positions.set('blocked', {
      x: BRANCH_PIPELINE_X,
      y: packageY + 56,
    });
  }

  if (machineNodes.some((node) => node.stateId === 'failed')) {
    positions.set('failed', {
      x: BRANCH_PIPELINE_X,
      y: (positions.get('blocked')?.y ?? packageY + 36) + 146,
    });
  }

  return positions;
}

function buildZoneNodes(zoneHeight: number): Array<Node<AnalystCanvasNodeData>> {
  return Object.entries(LANE_SPECS).map(([tone, spec]) => ({
    id: `zone-${tone}`,
    type: 'zone',
    position: { x: spec.x, y: ZONE_Y },
    draggable: false,
    selectable: false,
    deletable: false,
    focusable: false,
    data: {
      kind: 'zone',
      title: spec.title,
      subtitle: spec.subtitle,
      tone: tone as LaneTone,
    },
    style: {
      width: spec.width,
      height: zoneHeight,
      borderRadius: ZONE_BORDER_RADIUS,
    },
  }));
}

function preservePosition(
  node: Node<AnalystCanvasNodeData>,
  previousPositions: Map<string, XYPosition>,
): Node<AnalystCanvasNodeData> {
  if (FIXED_NODE_IDS.has(node.id)) {
    return node;
  }

  const position = previousPositions.get(node.id);
  if (!position) {
    return node;
  }

  return {
    ...node,
    position,
  };
}

function createSupportNode(
  id: string,
  lane: Exclude<LaneTone, 'pipeline'>,
  labelKey: string,
  fallbackLabel: string,
  eyebrow: string,
  position: XYPosition,
  state: PipelineVisualizerState,
): Node<AnalystCanvasNodeData> {
  return {
    id,
    type: 'support',
    position,
    draggable: true,
    data: {
      kind: 'support',
      lane,
      labelKey,
      fallbackLabel,
      eyebrow,
      note: supportNodeNote(id, state),
      status: supportNodeStatus(id, state),
    },
  };
}

function createEdge(
  id: string,
  source: string,
  target: string,
  nodesById: Map<string, Node<AnalystCanvasNodeData>>,
  sourceStatus: AnalystCanvasNodeStatus,
  targetStatus: AnalystCanvasNodeStatus,
  overrides?: {
    label?: string | null;
    color?: string;
    width?: number;
    animated?: boolean;
    dash?: string;
  },
): Edge | null {
  const sourceNode = nodesById.get(source);
  const targetNode = nodesById.get(target);

  if (!sourceNode || !targetNode) {
    return null;
  }

  const tone = overrides?.color
    ? {
        color: overrides.color,
        width: overrides.width ?? 1.8,
        animated: overrides.animated ?? false,
        dash: overrides.dash,
      }
    : toneForStatuses(sourceStatus, targetStatus);
  const handles = resolveHandles(sourceNode.position, targetNode.position);

  return {
    id,
    source,
    target,
    sourceHandle: handles.sourceHandle,
    targetHandle: handles.targetHandle,
    type: 'smoothstep',
    animated: tone.animated,
    label: overrides?.label === undefined ? null : overrides.label,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 18,
      height: 18,
      color: tone.color,
    },
    style: {
      stroke: tone.color,
      strokeWidth: tone.width,
      strokeDasharray: overrides?.dash ?? tone.dash,
    },
    labelStyle: {
      fill: '#e2e8f0',
      fontSize: 10,
      fontWeight: 700,
    },
    labelBgStyle: {
      fill: 'rgba(15, 23, 42, 0.9)',
      fillOpacity: 1,
    },
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 999,
  };
}

export function buildAnalystCanvasTopology(
  machineNodes: V6MachineVisualNode[],
  machineEdges: V6MachineVisualEdge[],
  state: PipelineVisualizerState,
  previousNodes: Array<Node<AnalystCanvasNodeData>> = [],
): AnalystCanvasTopology {
  const previousPositions = new Map(previousNodes.map((node) => [node.id, node.position]));
  const pipelinePositions = buildPipelinePositions(machineNodes);
  const highestPipelineY = Math.max(...Array.from(pipelinePositions.values()).map((position) => position.y), 940);
  const zoneHeight = Math.max(1240, highestPipelineY + 220);
  const doneY = pipelinePositions.get('done')?.y ?? highestPipelineY;
  const clarifyY = pipelinePositions.get('clarify')?.y ?? MAIN_PIPELINE_Y + PIPELINE_VERTICAL_GAP;
  const pausedY = pipelinePositions.get('paused_for_input')?.y ?? clarifyY + 110;
  const packageY = pipelinePositions.get('package')?.y ?? highestPipelineY - PIPELINE_VERTICAL_GAP;
  const blockedY = pipelinePositions.get('blocked')?.y ?? packageY + 90;

  const nodes: Array<Node<AnalystCanvasNodeData>> = [
    ...buildZoneNodes(zoneHeight),
    createSupportNode(
      'user-goal',
      'user',
      'visualizer.user_define_goal',
      'Define su meta de vida',
      'usuario',
      { x: LANE_SPECS.user.x + SUPPORT_X_OFFSET, y: 136 },
      state,
    ),
    createSupportNode(
      'user-input',
      'user',
      'visualizer.user_answer_questions',
      'Responde preguntas de clarificacion',
      'usuario',
      { x: LANE_SPECS.user.x + SUPPORT_X_OFFSET, y: pausedY + 8 },
      state,
    ),
    createSupportNode(
      'user-review',
      'user',
      'visualizer.user_review_plan',
      'Revisa y acepta el plan',
      'usuario',
      { x: LANE_SPECS.user.x + SUPPORT_X_OFFSET, y: doneY + 42 },
      state,
    ),
    createSupportNode(
      'server-build',
      'server',
      'visualizer.server.build_request',
      'Recibe pedido de nuevo plan',
      'servidor',
      { x: LANE_SPECS.server.x + SUPPORT_X_OFFSET, y: 170 },
      state,
    ),
    createSupportNode(
      'server-resume',
      'server',
      'visualizer.server.resume_request',
      'Recibe respuestas y retoma generacion',
      'servidor',
      { x: LANE_SPECS.server.x + SUPPORT_X_OFFSET, y: pausedY + 8 },
      state,
    ),
    createSupportNode(
      'storage-session',
      'storage',
      'visualizer.storage.session_label',
      'Sesion pausada guardada',
      'datos',
      { x: LANE_SPECS.storage.x + SUPPORT_X_OFFSET, y: pausedY + 8 },
      state,
    ),
    createSupportNode(
      'storage-plan',
      'storage',
      'visualizer.storage.plan_label',
      'Plan guardado en base de datos',
      'datos',
      { x: LANE_SPECS.storage.x + SUPPORT_X_OFFSET, y: doneY + 42 },
      state,
    ),
    createSupportNode(
      'notify-phase-change',
      'notifications',
      'visualizer.notification.phase_change',
      'Cambio de fase',
      'notificacion',
      { x: LANE_SPECS.notifications.x + SUPPORT_X_OFFSET, y: 132 },
      state,
    ),
    createSupportNode(
      'notify-progress',
      'notifications',
      'visualizer.notification.progress_update',
      'Progreso actualizado',
      'notificacion',
      { x: LANE_SPECS.notifications.x + SUPPORT_X_OFFSET, y: 270 },
      state,
    ),
    createSupportNode(
      'notify-needs-input',
      'notifications',
      'visualizer.notification.needs_input',
      'Se necesitan respuestas del usuario',
      'notificacion',
      { x: LANE_SPECS.notifications.x + SUPPORT_X_OFFSET, y: pausedY + 24 },
      state,
    ),
    createSupportNode(
      'notify-degraded',
      'notifications',
      'visualizer.notification.degraded',
      'Plan generado con limitaciones',
      'notificacion',
      { x: LANE_SPECS.notifications.x + SUPPORT_X_OFFSET, y: packageY - 74 },
      state,
    ),
    createSupportNode(
      'notify-blocked',
      'notifications',
      'visualizer.notification.failed',
      'Plan bloqueado',
      'notificacion',
      { x: LANE_SPECS.notifications.x + SUPPORT_X_OFFSET, y: blockedY + 10 },
      state,
    ),
    createSupportNode(
      'notify-complete',
      'notifications',
      'visualizer.notification.completed',
      'Plan completado',
      'notificacion',
      { x: LANE_SPECS.notifications.x + SUPPORT_X_OFFSET, y: doneY + 42 },
      state,
    ),
  ];

  machineNodes.forEach((node, index) => {
    const position = pipelinePositions.get(node.stateId) ?? {
      x: MAIN_PIPELINE_X,
      y: MAIN_PIPELINE_Y + index * PIPELINE_VERTICAL_GAP,
    };
    const phase = state.phases.find((item) => item.phase === node.stateId);

    nodes.push({
      id: `node-${node.stateId}`,
      type: 'pipeline',
      position,
      data: {
        kind: 'pipeline',
        lane: 'pipeline',
        stateId: node.stateId,
        labelKey: node.labelKey,
        fallbackLabel: node.fallbackLabel,
        agentName: node.agentName,
        progress: node.progressTarget,
        status: machineNodeStatus(node.stateId, state),
        orderIndex: index + 1,
        iteration: phase?.iteration,
      },
    });
  });

  const positionedNodes = nodes.map((node) => preservePosition(node, previousPositions));
  const nodesById = new Map(positionedNodes.map((node) => [node.id, node]));
  const edges: Edge[] = [];
  const pushEdge = (edge: Edge | null) => {
    if (edge) {
      edges.push(edge);
    }
  };

  machineEdges.forEach((edge) => {
    const label = edgeLabelFor(edge.source, edge.target);
    const sourceStatus = machineNodeStatus(edge.source, state);
    const targetStatus = machineNodeStatus(edge.target, state);

    pushEdge(
      createEdge(
        edge.id,
        `node-${edge.source}`,
        `node-${edge.target}`,
        nodesById,
        sourceStatus,
        targetStatus,
        { label },
      ),
    );
  });

  const auxColor = '#c4b5fd';
  const storageColor = '#6ee7b7';
  const notificationColor = '#f8c66d';
  const initialMachineState = machineNodes[0]?.stateId;

  if (initialMachineState) {
    pushEdge(
      createEdge(
        'edge-user-goal-server-build',
        'user-goal',
        'server-build',
        nodesById,
        supportNodeStatus('user-goal', state),
        supportNodeStatus('server-build', state),
        { color: auxColor, width: 2.05 },
      ),
    );
    pushEdge(
      createEdge(
        'edge-server-build-machine',
        'server-build',
        `node-${initialMachineState}`,
        nodesById,
        supportNodeStatus('server-build', state),
        machineNodeStatus(initialMachineState, state),
        { color: auxColor, width: 2.05 },
      ),
    );
  }

  if (nodesById.has('node-paused_for_input')) {
    pushEdge(
      createEdge(
        'edge-clarify-needs-input',
        'node-clarify',
        'notify-needs-input',
        nodesById,
        machineNodeStatus('clarify', state),
        supportNodeStatus('notify-needs-input', state),
        { color: notificationColor, width: 1.85, dash: '6 5', label: 'preguntas' },
      ),
    );
    pushEdge(
      createEdge(
        'edge-notify-user-input',
        'notify-needs-input',
        'user-input',
        nodesById,
        supportNodeStatus('notify-needs-input', state),
        supportNodeStatus('user-input', state),
        { color: auxColor, width: 1.8, dash: '6 5' },
      ),
    );
    pushEdge(
      createEdge(
        'edge-user-input-server-resume',
        'user-input',
        'server-resume',
        nodesById,
        supportNodeStatus('user-input', state),
        supportNodeStatus('server-resume', state),
        { color: auxColor, width: 1.95 },
      ),
    );
    pushEdge(
      createEdge(
        'edge-server-resume-clarify',
        'server-resume',
        'node-clarify',
        nodesById,
        supportNodeStatus('server-resume', state),
        machineNodeStatus('clarify', state),
        { color: auxColor, width: 1.95 },
      ),
    );
    pushEdge(
      createEdge(
        'edge-paused-storage-session',
        'node-paused_for_input',
        'storage-session',
        nodesById,
        machineNodeStatus('paused_for_input', state),
        supportNodeStatus('storage-session', state),
        { color: storageColor, width: 1.85, label: 'pausa' },
      ),
    );
    pushEdge(
      createEdge(
        'edge-storage-session-server-resume',
        'storage-session',
        'server-resume',
        nodesById,
        supportNodeStatus('storage-session', state),
        supportNodeStatus('server-resume', state),
        { color: storageColor, width: 1.8, dash: '6 5', label: 'retoma' },
      ),
    );
  }

  if (nodesById.has('node-done')) {
    pushEdge(
      createEdge(
        'edge-done-storage-plan',
        'node-done',
        'storage-plan',
        nodesById,
        machineNodeStatus('done', state),
        supportNodeStatus('storage-plan', state),
        { color: storageColor, width: 1.9 },
      ),
    );
    pushEdge(
      createEdge(
        'edge-done-notify-complete',
        'node-done',
        'notify-complete',
        nodesById,
        machineNodeStatus('done', state),
        supportNodeStatus('notify-complete', state),
        { color: notificationColor, width: 1.95 },
      ),
    );
    pushEdge(
      createEdge(
        'edge-done-user-review',
        'node-done',
        'user-review',
        nodesById,
        machineNodeStatus('done', state),
        supportNodeStatus('user-review', state),
        { color: auxColor, width: 1.7, dash: '6 5' },
      ),
    );
  }

  if (nodesById.has('node-blocked')) {
    pushEdge(
      createEdge(
        'edge-blocked-notify-blocked',
        'node-blocked',
        'notify-blocked',
        nodesById,
        machineNodeStatus('blocked', state),
        supportNodeStatus('notify-blocked', state),
        { color: '#f59e0b', width: 1.9, dash: '7 6' },
      ),
    );
  }

  if (nodesById.has('node-failed')) {
    pushEdge(
      createEdge(
        'edge-failed-notify-blocked',
        'node-failed',
        'notify-blocked',
        nodesById,
        machineNodeStatus('failed', state),
        supportNodeStatus('notify-blocked', state),
        { color: '#ef4444', width: 1.9, dash: '7 6' },
      ),
    );
  }

  if (nodesById.has('node-plan')) {
    pushEdge(
      createEdge(
        'edge-plan-notify-degraded',
        'node-plan',
        'notify-degraded',
        nodesById,
        machineNodeStatus('plan', state),
        supportNodeStatus('notify-degraded', state),
        { color: notificationColor, width: 1.8, dash: '6 6', label: 'IA parcial' },
      ),
    );
  }

  machineNodes
    .filter((node) => BROADCAST_PHASES.has(node.stateId))
    .forEach((node) => {
      pushEdge(
        createEdge(
          `edge-${node.stateId}-notify-phase`,
          `node-${node.stateId}`,
          'notify-phase-change',
          nodesById,
          machineNodeStatus(node.stateId, state),
          supportNodeStatus('notify-phase-change', state),
          { color: 'rgba(248, 198, 109, 0.52)', width: 1.4, dash: '4 8' },
        ),
      );
      pushEdge(
        createEdge(
          `edge-${node.stateId}-notify-progress`,
          `node-${node.stateId}`,
          'notify-progress',
          nodesById,
          machineNodeStatus(node.stateId, state),
          supportNodeStatus('notify-progress', state),
          { color: 'rgba(167, 243, 208, 0.42)', width: 1.35, dash: '3 8' },
        ),
      );
    });

  return {
    nodes: positionedNodes,
    edges,
  };
}

export function mergeAnalystCanvasNodes(
  previousNodes: Array<Node<AnalystCanvasNodeData>>,
  nextNodes: Array<Node<AnalystCanvasNodeData>>,
): Array<Node<AnalystCanvasNodeData>> {
  const previousById = new Map(previousNodes.map((node) => [node.id, node]));

  return nextNodes.map((node) => {
    const previous = previousById.get(node.id);
    if (!previous || FIXED_NODE_IDS.has(node.id)) {
      return node;
    }

    return {
      ...node,
      position: previous.position,
      selected: previous.selected,
      dragging: previous.dragging,
    };
  });
}
