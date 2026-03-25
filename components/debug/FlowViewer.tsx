'use client'

import React, { useCallback, useState, useMemo, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Panel,
  ReactFlowProvider,
  MarkerType,
  NodeMouseHandler,
  FitViewOptions
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './flow-viewer.css'
import { AnimatePresence } from 'framer-motion'
import { t } from '../../src/i18n'

import { FlowStepNode } from './FlowStepNode'
import { FlowDetailModal } from './FlowDetailModal'
import { generateGraphData } from '@lib/flow/flow-to-graph'
import { FLOW_PHASES } from '@lib/flow/flow-definition'
import type { PipelineRuntimeData } from '@lib/flow/pipeline-runtime-data'

const nodeTypes = {
  flowStep: FlowStepNode
}

const defaultEdgeOptions = {
  style: { strokeWidth: 2, stroke: 'rgba(255, 255, 255, 0.2)' },
  type: 'smoothstep', // Usamos smoothstep por defecto para curvas limpias
  animated: true,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: 'rgba(255, 255, 255, 0.2)',
  },
}

interface SelectedNodeInfo {
  phaseId: string
  phaseName: string
  phaseColor: string
  runtimeData: Record<string, unknown>
  fullRuntimeData: any
}

function FlowUI() {
  const [pipelineData, setPipelineData] = useState<PipelineRuntimeData | null>(null)
  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo | null>(null)

  const openModal = useCallback((nodeData: any) => {
    if (!nodeData.runtimeData) return
    const phase = FLOW_PHASES.find(p => p.id === nodeData.phaseId)
    setSelectedNode({
      phaseId: nodeData.phaseId ?? '',
      phaseName: phase?.name ?? nodeData.phase ?? nodeData.phaseId ?? '',
      phaseColor: phase?.color ?? nodeData.color ?? '#fff',
      runtimeData: nodeData.runtimeData as Record<string, unknown>,
      fullRuntimeData: nodeData.fullRuntimeData
    })
  }, [])

  // Obtener contexto del pipeline al montar y hacer polling cada 2s
  useEffect(() => {
    let cancelled = false

    async function fetchContext() {
      try {
        const res = await fetch('/api/debug/pipeline-context')
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled && json.data) {
          setPipelineData(json.data)
        }
      } catch {
        // Non-fatal — debug fetch failure
      }
    }

    fetchContext()
    const interval = setInterval(fetchContext, 2000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => generateGraphData(pipelineData),
    [pipelineData]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync nodes when pipelineData updates, injecting the openModal callback into each node's data
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = generateGraphData(pipelineData)
    setNodes(newNodes.map(n => ({ ...n, data: { ...n.data, onInspect: openModal } })))
    setEdges(newEdges)
  }, [pipelineData, setNodes, setEdges, openModal])

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds) as any),
    [setEdges]
  )

  const resetLayout = useCallback(() => {
    const { nodes: resetNodes, edges: resetEdges } = generateGraphData(pipelineData)
    setNodes(resetNodes)
    setEdges(resetEdges)
  }, [setNodes, setEdges, pipelineData])

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    openModal(node.data)
  }, [openModal])

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 40px)', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2, minZoom: 0.1, maxZoom: 1.5 }}
        className="flow-grid-background"
      >
        <Background color="#333" gap={40} size={1} />
        <Controls showInteractive={false} />

        <Panel position="top-left" className="flow-viewer-overlay">
          <header className="flow-viewer-header">
            <h1 className="flow-viewer-title">Pipeline LAP — Mapa de Flujo</h1>
            <p className="flow-viewer-subtitle">
              Mapa estratégico del flujo multi-agente con loops de reparación y auditoría de viabilidad.
            </p>

            <div className="flow-viewer-legend">
              {FLOW_PHASES.map(phase => (
                <div key={phase.id} className="legend-item">
                  <div className="legend-dot" style={{ backgroundColor: phase.color }} />
                  <span>{phase.name}</span>
                </div>
              ))}
            </div>

            <button
              onClick={resetLayout}
              className="app-button app-button--secondary"
              style={{ marginTop: '1.5rem', width: '100%', minHeight: '2.5rem', fontSize: '0.85rem' }}
            >
              🔄 Restablecer Orden
            </button>
          </header>
        </Panel>

        <MiniMap
          nodeColor={(n) => (n.data as any).color}
          maskColor="rgba(0,0,0,0.1)"
          style={{ backgroundColor: '#111' }}
        />
      </ReactFlow>

      {/* Modal rendered outside ReactFlow to avoid z-index issues */}
      <AnimatePresence>
        {selectedNode && (
          <FlowDetailModal
            phaseId={selectedNode.phaseId}
            phaseName={selectedNode.phaseName}
            phaseColor={selectedNode.phaseColor}
            runtimeData={selectedNode.runtimeData}
            fullRuntimeData={selectedNode.fullRuntimeData}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export function FlowViewer() {
  return (
    <ReactFlowProvider>
      <FlowUI />
    </ReactFlowProvider>
  )
}
