'use client'

import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react'
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
  type: 'smoothstep',
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
  const [runnerState, setRunnerState] = useState<{ lastStepId: string | null; active: boolean }>({ 
    lastStepId: null, 
    active: false 
  })

  // Ref para mantener el histórico de pasos visitados en esta ejecución
  const visitedSteps = useRef<Set<string>>(new Set())

  // Polling del estado del runner CLI
  useEffect(() => {
    let timer: NodeJS.Timeout
    
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/debug/pipeline/status')
        if (res.ok) {
          const data = await res.json()
          
          // Si el runner acaba de empezar o cambió de fase, limpiamos los visitados de la sesión anterior
          if (data.active && runnerState.active === false) {
             visitedSteps.current.clear()
          }

          if (data.lastStepId) {
            visitedSteps.current.add(data.lastStepId)
          }

          setRunnerState(data)
          
          setNodes((nds) => nds.map((node) => {
            const isActive = node.id === data.lastStepId && data.active
            
            // Normalizar phaseId: flow-definition usa 'simulation' pero el pipeline usa 'simulate'
            const nodePhaseId = (node.data as any).phaseId
            const normalizedPhaseId = nodePhaseId === 'simulation' ? 'simulate' : nodePhaseId
            const phaseData = data.phaseMap ? data.phaseMap[normalizedPhaseId] : null
            const wasVisited = visitedSteps.current.has(node.id) || phaseData?.status === 'completed'

            return {
              ...node,
              data: {
                ...node.data,
                active: isActive,
                completed: wasVisited && !isActive,
                results: phaseData
              }
            }
          }))
        }
      } catch (err) {
        // Ignorar
      }
      timer = setTimeout(fetchStatus, 1000)
    }

    fetchStatus()
    return () => clearTimeout(timer)
  }, [setNodes, runnerState.active])

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  const resetLayout = useCallback(() => {
    const { nodes: resetNodes, edges: resetEdges } = generateGraphData()
    setNodes(resetNodes)
    setEdges(resetEdges)
    visitedSteps.current.clear()
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
              Mapa estratégico del flujo multi-agente con monitoreo de ejecución CLI en tiempo real.
            </p>
            
            {runnerState.active ? (
                <div className="runner-active-badge">
                    <span className="badge-pulse"></span>
                    CLI RUNNER ACTIVE: Procesando {runnerState.lastStepId}
                </div>
            ) : runnerState.lastStepId ? (
                <div className="runner-idle-badge">
                    ✅ ÚLTIMA EJECUCIÓN COMPLETADA
                </div>
            ) : null}

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
              style={{ marginTop: '1rem', width: '100%', minHeight: '2.5rem', fontSize: '0.85rem' }}
            >
              🔄 Restablecer Blueprint Reset
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
