'use client'

import React, { useCallback, useState, useMemo } from 'react'
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
  MarkerType
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './flow-viewer.css'

import { FlowStepNode } from './FlowStepNode'
import { generateGraphData } from '@lib/flow/flow-to-graph'
import { FLOW_PHASES } from '@lib/flow/flow-definition'

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

function FlowUI() {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => generateGraphData(), [])
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  const resetLayout = useCallback(() => {
    const { nodes: resetNodes, edges: resetEdges } = generateGraphData()
    setNodes(resetNodes)
    setEdges(resetEdges)
  }, [setNodes, setEdges])

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 40px)', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        className="flow-grid-background"
      >
        <Background color="#333" gap={40} size={1} />
        <Controls showInteractive={false} />
        
        <Panel position="top-left" className="flow-viewer-overlay">
          <header className="flow-viewer-header">
            <h1 className="flow-viewer-title">LAP Pipeline Blueprint</h1>
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
              🔄 Restablecer Orden / Blueprint Reset
            </button>
          </header>
        </Panel>

        <MiniMap 
          nodeColor={(n) => (n.data as any).color} 
          maskColor="rgba(0,0,0,0.1)"
          style={{ backgroundColor: '#111' }}
        />
      </ReactFlow>
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
