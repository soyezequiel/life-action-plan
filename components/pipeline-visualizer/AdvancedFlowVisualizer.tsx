'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import {
  Background,
  Controls,
  ControlButton,
  Edge,
  Handle,
  MiniMap,
  Node,
  NodeProps,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { motion } from 'framer-motion';

import { MaterialIcon } from '@/components/midnight-mint/MaterialIcon';
import { t } from '@/src/i18n';
import {
  getV6MachineVisualEdges,
  getV6MachineVisualNodes,
} from '@/src/lib/pipeline/v6/xstate/visualization';

import {
  type AnalystCanvasNodeData,
  type AnalystCanvasNodeStatus,
  type AnalystPipelineNodeData,
  type AnalystSupportNodeData,
  type AnalystZoneNodeData,
  buildAnalystCanvasTopology,
  mergeAnalystCanvasNodes,
} from './analyst-canvas-layout';
import type { PipelineVisualizerState } from './pipeline-visualizer-types';
import styles from './AdvancedFlowVisualizer.module.css';

function resolveLabel(labelKey: string, fallbackLabel: string): string {
  const translated = t(labelKey);
  return translated === labelKey ? fallbackLabel : translated;
}

function getStatusLabel(status: AnalystCanvasNodeStatus): string {
  switch (status) {
    case 'active':
      return 'activo';
    case 'completed':
      return 'resuelto';
    case 'failed':
      return 'fallo';
    case 'waiting':
      return 'espera';
    case 'degraded':
      return 'degradado';
    case 'blocked':
      return 'bloqueado';
    case 'info':
      return 'info';
    default:
      return 'pendiente';
  }
}

function getStatusIcon(status: AnalystCanvasNodeStatus): string {
  switch (status) {
    case 'active':
      return 'sync';
    case 'completed':
      return 'check_circle';
    case 'failed':
      return 'error';
    case 'waiting':
      return 'hourglass_bottom';
    case 'degraded':
      return 'warning';
    case 'blocked':
      return 'gpp_bad';
    case 'info':
      return 'info';
    default:
      return 'radio_button_unchecked';
  }
}

function nodeStatusClass(status: AnalystCanvasNodeStatus): string {
  switch (status) {
    case 'active':
      return styles.nodeActive;
    case 'completed':
      return styles.nodeCompleted;
    case 'failed':
      return styles.nodeFailed;
    case 'waiting':
      return styles.nodeWaiting;
    case 'degraded':
      return styles.nodeDegraded;
    case 'blocked':
      return styles.nodeBlocked;
    case 'info':
      return styles.nodeInfo;
    default:
      return styles.nodePending;
  }
}

function laneClass(lane: AnalystSupportNodeData['lane'] | AnalystZoneNodeData['tone']): string {
  switch (lane) {
    case 'user':
      return styles.laneUser;
    case 'server':
      return styles.laneServer;
    case 'storage':
      return styles.laneStorage;
    case 'notifications':
      return styles.laneNotifications;
    default:
      return styles.lanePipeline;
  }
}

const hiddenHandleStyle = { opacity: 0, width: 10, height: 10 };

const PipelineNode = ({ data }: NodeProps<Node<AnalystPipelineNodeData>>) => {
  const label = resolveLabel(data.labelKey, data.fallbackLabel);

  return (
    <div className={`${styles.pipelineNode} ${nodeStatusClass(data.status)}`}>
      <Handle id="top" type="target" position={Position.Top} style={hiddenHandleStyle} />
      <Handle id="right" type="source" position={Position.Right} style={hiddenHandleStyle} />
      <Handle id="bottom" type="source" position={Position.Bottom} style={hiddenHandleStyle} />
      <Handle id="left" type="target" position={Position.Left} style={hiddenHandleStyle} />

      <div className={styles.nodeToolbar}>
        <span className={styles.nodeIndex}>{String(data.orderIndex).padStart(2, '0')}</span>
        <span className={styles.nodeChip}>
          <MaterialIcon
            name={getStatusIcon(data.status)}
            className={`${styles.nodeIcon} ${data.status === 'active' ? `animate-spin ${styles.nodeIconActive}` : ''}`}
          />
          {getStatusLabel(data.status)}
        </span>
      </div>

      <div className={styles.nodeHeader}>
        <div>
          <span className={styles.nodeEyebrow}>motor</span>
          <h4 className={styles.nodeTitle}>{label}</h4>
          <span className={styles.nodeMeta}>{data.agentName ?? 'estado terminal'}</span>
        </div>
        <span className={styles.nodeProgress}>{data.progress}%</span>
      </div>

      {data.iteration && data.iteration > 1 ? (
        <span className={styles.nodeIteration}>iteracion {data.iteration}</span>
      ) : null}

      <div className={styles.nodeMeter}>
        <div className={styles.nodeMeterFill} style={{ width: `${Math.max(12, data.progress)}%` }} />
      </div>
    </div>
  );
};

const SupportNode = ({ data }: NodeProps<Node<AnalystSupportNodeData>>) => {
  const label = resolveLabel(data.labelKey, data.fallbackLabel);

  return (
    <div className={`${styles.supportNode} ${laneClass(data.lane)} ${nodeStatusClass(data.status)}`}>
      <Handle id="top" type="target" position={Position.Top} style={hiddenHandleStyle} />
      <Handle id="right" type="source" position={Position.Right} style={hiddenHandleStyle} />
      <Handle id="bottom" type="source" position={Position.Bottom} style={hiddenHandleStyle} />
      <Handle id="left" type="target" position={Position.Left} style={hiddenHandleStyle} />

      <div className={styles.supportNodeHeader}>
        <span className={styles.supportEyebrow}>{data.eyebrow}</span>
        <span className={styles.supportBadge}>
          <MaterialIcon name={getStatusIcon(data.status)} className={styles.supportBadgeIcon} />
          {getStatusLabel(data.status)}
        </span>
      </div>

      <strong className={styles.supportTitle}>{label}</strong>
      {data.note ? <span className={styles.supportNote}>{data.note}</span> : null}
    </div>
  );
};

const ZoneNode = ({ data }: NodeProps<Node<AnalystZoneNodeData>>) => (
  <div className={`${styles.zoneNode} ${laneClass(data.tone)}`}>
    <div className={styles.zoneHeader}>
      <span className={styles.zoneTitle}>{data.title}</span>
      <span className={styles.zoneSubtitle}>{data.subtitle}</span>
    </div>
  </div>
);

const nodeTypes = {
  pipeline: PipelineNode,
  support: SupportNode,
  zone: ZoneNode,
};

interface AdvancedFlowVisualizerProps {
  state: PipelineVisualizerState;
}

function minimapColor(node: Node<AnalystCanvasNodeData>): string {
  const data = node.data;

  if (!data || data.kind === 'zone') {
    return 'rgba(148, 163, 184, 0.18)';
  }

  switch (data.status) {
    case 'active':
      return '#38bdf8';
    case 'completed':
      return '#a7f3d0';
    case 'failed':
      return '#ef4444';
    case 'waiting':
      return '#c4b5fd';
    case 'degraded':
      return '#e9d5ff';
    case 'blocked':
      return '#f59e0b';
    default:
      return '#64748b';
  }
}

const Flow = ({ state }: AdvancedFlowVisualizerProps) => {
  const { fitView } = useReactFlow();
  const machineNodes = useMemo(() => getV6MachineVisualNodes('analyst'), []);
  const machineEdges = useMemo(() => getV6MachineVisualEdges('analyst'), []);
  const initialTopology = useMemo(
    () => buildAnalystCanvasTopology(machineNodes, machineEdges, state),
    [machineEdges, machineNodes, state],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AnalystCanvasNodeData>>(initialTopology.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialTopology.edges);
  const nodesRef = useRef(nodes);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    const topology = buildAnalystCanvasTopology(machineNodes, machineEdges, state, nodesRef.current);
    setNodes((prevNodes) => mergeAnalystCanvasNodes(prevNodes, topology.nodes));
    setEdges(topology.edges);
  }, [machineEdges, machineNodes, setEdges, setNodes, state]);

  const resetLayout = () => {
    const topology = buildAnalystCanvasTopology(machineNodes, machineEdges, state);
    setNodes(topology.nodes);
    setEdges(topology.edges);
    fitView({ duration: 420, padding: 0.16 });
  };

  return (
    <div className={styles.visualizerWrapper}>
      <ReactFlow<Node<AnalystCanvasNodeData>, Edge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18, minZoom: 0.35 }}
        minZoom={0.28}
        maxZoom={1.9}
        nodesConnectable={false}
        elementsSelectable
        className={styles.graphCanvas}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(148, 163, 184, 0.18)" gap={30} size={1.2} />
        <MiniMap<Node<AnalystCanvasNodeData>>
          nodeStrokeWidth={3}
          pannable
          zoomable
          position="bottom-left"
          className={styles.minimap}
          maskColor="rgba(15, 23, 42, 0.82)"
          nodeColor={minimapColor}
        />

        <Controls showInteractive={false} className={styles.controls}>
          <ControlButton onClick={resetLayout} title="Resetear layout">
            <MaterialIcon name="frame_inspect" />
          </ControlButton>
        </Controls>

        <Panel position="top-left" className={styles.panelWrap}>
          <div className={styles.panelCard}>
            <span className={styles.panelEyebrow}>modo analista</span>
            <h3 className={styles.panelTitle}>{t('visualizer.title')}</h3>
            <p className={styles.panelCopy}>
              Canvas draggable por tarjetas, distribuido en cinco zonas: usuario, servidor, maquina, almacenamiento y
              notificaciones.
            </p>
            <button type="button" className={styles.panelButton} onClick={resetLayout}>
              reacomodar canvas
            </button>
          </div>
        </Panel>

        <Panel position="top-right" className={styles.panelWrap}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryRow}>
              <div>
                <span className={styles.summaryLabel}>fase actual</span>
                <strong className={styles.summaryValue}>{state.currentPhase ?? 'boot'}</strong>
              </div>
              <div>
                <span className={styles.summaryLabel}>lifecycle</span>
                <strong className={styles.summaryValue}>{state.lifecycle}</strong>
              </div>
              <div>
                <span className={styles.summaryLabel}>sesion</span>
                <strong className={styles.summaryValue}>{state.sessionId ? 'pausable' : 'directa'}</strong>
              </div>
            </div>
            <div className={styles.legendRow}>
              <span className={styles.legendItem}><i className={styles.legendDotActive} /> Activo</span>
              <span className={styles.legendItem}><i className={styles.legendDotComplete} /> Resuelto</span>
              <span className={styles.legendItem}><i className={styles.legendDotBlocked} /> Bloqueado</span>
              <span className={styles.legendItem}><i className={styles.legendDotWaiting} /> Espera</span>
            </div>
          </div>
        </Panel>

        <Panel position="bottom-right" className={styles.panelWrap}>
          <div className={styles.bottomCard}>
            <div className={styles.bottomMetric}>
              <span className={styles.summaryLabel}>progreso</span>
              <span className={styles.bottomMetricValue}>{state.progressScore}%</span>
            </div>
            <div className={styles.bottomDivider} />
            <div className={styles.bottomMetricCopy}>
              <span className={styles.summaryLabel}>ultima accion</span>
              <span className={styles.bottomAction}>{state.lastAction || 'esperando actividad del motor'}</span>
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
};

export const AdvancedFlowVisualizer = (props: AdvancedFlowVisualizerProps) => (
  <ReactFlowProvider>
    <motion.div initial={{ opacity: 0.98 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <Flow {...props} />
    </motion.div>
  </ReactFlowProvider>
);
