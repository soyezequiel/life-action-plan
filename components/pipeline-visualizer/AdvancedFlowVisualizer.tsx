'use client';

import React, { useMemo, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  ConnectionMode,
  NodeProps,
  Edge,
  Node,
  Panel,
  ReactFlowProvider,
  useReactFlow,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { t } from '@/src/i18n';
import styles from './AdvancedFlowVisualizer.module.css';
import { motion, AnimatePresence } from 'framer-motion';
import { PipelineVisualizerState, PHASE_ORDER } from './pipeline-visualizer-types';
import { getTopologyNodes, getTopologyEdges } from '@lib/client/topology-layout';
import { MaterialIcon } from '@/components/midnight-mint/MaterialIcon';

// Custom Node Component
const CustomWorkflowNode = ({ data, selected }: NodeProps<Node<any>>) => {
  const { labelKey, phase, agentName, status, progress, iteration } = data;
  
  const isCompleted = status === 'completed';
  const isActive = status === 'active';
  const isFailed = status === 'failed';
  const isWaiting = status === 'waiting';

  return (
    <div className={`${styles.customNode} ${isActive ? styles.customNodeActive : ''} ${isCompleted ? styles.customNodeCompleted : ''}`}>
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      
      <div className={styles.nodeHeader}>
        <MaterialIcon 
          name={isCompleted ? 'check_circle' : isActive ? 'sync' : isFailed ? 'error' : isWaiting ? 'hourglass_bottom' : 'radio_button_unchecked'} 
          className={`${styles.nodeIcon} ${isActive ? 'animate-spin ' + styles.activeIcon : ''} ${isCompleted ? styles.activeIcon : ''}`}
        />
        <span className={styles.nodeProgress}>{progress}%</span>
      </div>

      <div className={styles.nodeContent}>
        <h4 className={styles.nodeTitle}>{t(labelKey)}</h4>
        {agentName && <span className={styles.agentName}>{agentName}</span>}
        {iteration && iteration > 1 && (
          <span className="text-[9px] text-amber-500 font-bold uppercase mt-1">Iteración {iteration}</span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
    </div>
  );
};

// Simplified User/Storage nodes
const UserNode = ({ data }: NodeProps<Node<any>>) => (
  <div className="px-4 py-3 rounded-xl bg-white/5 border border-purple-500/20 backdrop-blur-md text-xs font-bold text-purple-300 uppercase tracking-widest text-center shadow-lg relative">
    <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} />
    <Handle type="target" position={Position.Right} style={{ visibility: 'hidden' }} />
    {t(data.labelKey)}
  </div>
);

const StorageNode = ({ data }: NodeProps<Node<any>>) => (
  <div className="px-4 py-3 rounded-xl bg-white/5 border border-emerald-500/20 backdrop-blur-md text-xs font-bold text-emerald-300 uppercase tracking-widest text-center shadow-lg relative">
    <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />
    {t(data.labelKey)}
  </div>
);

const nodeTypes = {
  pipeline: CustomWorkflowNode,
  user: UserNode,
  storage: StorageNode,
};

interface AdvancedFlowVisualizerProps {
  state: PipelineVisualizerState;
}

const Flow = ({ state }: AdvancedFlowVisualizerProps) => {
  const { setCenter } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Initialize nodes and edges
  useEffect(() => {
    const initialNodes = getTopologyNodes();
    const initialEdges = getTopologyEdges();
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [setNodes, setEdges]);

  const fitViewOptions = useMemo(() => ({ padding: 0.2 }), []);
  const lastSyncRef = useRef<string>('');

  // Sincronizar solo cuando los datos relevantes cambien realmente
  useEffect(() => {
    const currentSyncKey = JSON.stringify(state.phases.map(p => ({ 
      p: p.phase, 
      s: p.status, 
      i: p.iteration,
      d: p.statusDetail 
    })));
    
    if (currentSyncKey === lastSyncRef.current) return;
    lastSyncRef.current = currentSyncKey;

    // Sync state.phases -> nodes.data
    setNodes((nds: Node[]) => 
      nds.map((node) => {
        if (node.type === 'pipeline' && node.data?.phase) {
          const phaseData = state.phases.find(p => p.phase === node.data.phase);
          if (phaseData) {
            return {
              ...node,
              data: {
                ...node.data,
                status: phaseData.status,
                iteration: phaseData.iteration,
              }
            };
          }
        }
        return node;
      })
    );

    // Sync state.phases -> edges.animated
    setEdges((eds: Edge[]) => 
      eds.map((edge) => {
        const sourcePhase = edge.source.replace('node-', '') as any;
        const targetPhase = edge.target.replace('node-', '') as any;
        
        const sourceData = state.phases.find(p => p.phase === sourcePhase);
        const targetData = state.phases.find(p => p.phase === targetPhase);
        
        if (sourceData?.status === 'active' || targetData?.status === 'active') {
          return { ...edge, animated: true, style: { stroke: '#10b981', strokeWidth: 2 } };
        }
        if (sourceData?.status === 'completed' && targetData?.status === 'completed') {
           return { ...edge, animated: false, style: { stroke: 'rgba(16, 185, 129, 0.4)', strokeWidth: 2 } };
        }
        return { ...edge, animated: false, style: { stroke: '#334155', strokeWidth: 1.5 } };
      })
    );
  }, [state.phases, setNodes, setEdges]);

  // Auto-focus on active phase change - manual control
  useEffect(() => {
    if (!state.currentPhase) return;
    
    const phaseIndex = PHASE_ORDER.findIndex(p => p.phase === state.currentPhase);
    if (phaseIndex !== -1) {
      // Current active node center
      const nodeX = 350 + 150; // Engine group x + half width
      const nodeY = 50 + (phaseIndex * 110) + 40; // Vertical pos + half height
      
      // Target a point that keeps the diagram generally centered
      // We center on X=475 (midpoint of the whole layout) 
      // but keep vertical focus on the active node
      setCenter(475, nodeY, { zoom: 0.9, duration: 800 });
    }
  }, [state.currentPhase, setCenter]);

  return (
    <div className={styles.visualizerWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitViewOptions={fitViewOptions}
        minZoom={0.2}
        maxZoom={2}
        className={styles.graphContainer}
      >
        <Background color="#334155" gap={20} />
        <Controls showInteractive={false} className="!bg-slate-900 !border-slate-800" />
        
        <Panel position="top-left" className="p-4">
          <div className="flex flex-col gap-1">
             <h3 className="text-white font-bold text-sm uppercase tracking-widest bg-slate-900/80 px-3 py-1 rounded-lg backdrop-blur-md border border-white/5">
               {t('visualizer.title')}
             </h3>
             <p className="text-[10px] text-slate-400 font-medium">
               {t('dashboard.resource_usage.mode.backend-cloud')}
             </p>
          </div>
        </Panel>

        <Panel position="bottom-right" className="p-4">
           <div className="flex gap-4 items-center bg-slate-900/80 p-3 rounded-2xl border border-white/5 backdrop-blur-md">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Progreso</span>
                <span className="text-emerald-400 font-mono font-bold text-xl">{state.progressScore}%</span>
              </div>
              <div className="h-8 w-[1px] bg-white/5" />
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Última Acción</span>
                <span className="text-slate-300 text-xs font-medium max-w-[200px] truncate">{state.lastAction || 'Validando entrada...'}</span>
              </div>
           </div>
        </Panel>
      </ReactFlow>
    </div>
  );
};

export const AdvancedFlowVisualizer = (props: AdvancedFlowVisualizerProps) => (
  <ReactFlowProvider>
    <Flow {...props} />
  </ReactFlowProvider>
);
