import dagre from 'dagre'
import type { FlowStep, FlowPhase, FlowNodeRuntimeStatus } from './types'
import { FLOW_STEPS, FLOW_PHASES } from './flow-definition'
import type { PipelineRuntimeData } from './pipeline-runtime-data'

export type GraphNode = {
  id: string;
  type: string;
  data: {
    label: string;
    description: string;
    type: string;
    phase: string;
    color: string;
    phaseId: string;
    tags?: string[];
    questions?: string[];
    prompt?: string;
    // Runtime data (optional, present after pipeline execution)
    runtimeData?: Record<string, unknown>
    fullRuntimeData?: PipelineRuntimeData | null
    runtimeStatus?: FlowNodeRuntimeStatus
  };
  position: { x: number; y: number };
}

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  type?: string; // Nuevo: Para definir el tipo de linea (p.ej. smoothstep)
  label?: string;
}

// Map from FLOW_STEPS phaseId to PipelineRuntimeData key
// (flow-definition uses 'simulation', pipeline/contracts uses 'simulate')
function resolvePhaseKey(phaseId: string): keyof PipelineRuntimeData {
  const mapping: Record<string, keyof PipelineRuntimeData> = {
    simulation: 'simulate',
    intake: 'intake',
    enrich: 'enrich',
    build: 'build',
    simulate: 'simulate',
    repair: 'repair',
    output: 'output',
    readiness: 'readiness'
  }
  return mapping[phaseId] ?? (phaseId as keyof PipelineRuntimeData)
}

export function generateGraphData(pipelineData?: PipelineRuntimeData | null) {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))

  // Aumentamos el espaciado para acomodar loops sin solapamiento
  dagreGraph.setGraph({
    rankdir: 'LR',
    ranksep: 160, // Más espacio entre columnas
    nodesep: 140, // Más espacio entre filas
    marginx: 50,
    marginy: 50
  })

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  FLOW_STEPS.forEach((step) => {
    const phase = FLOW_PHASES.find(p => p.id === step.phaseId)

    // Todos los nodos reciben runtime status; los que tienen data de fase muestran resumen
    let runtimeData: Record<string, unknown> | undefined
    let runtimeStatus: FlowNodeRuntimeStatus | undefined

    if (pipelineData) {
      const key = resolvePhaseKey(step.phaseId)
      const statusFromPhase = pipelineData.phaseStatuses?.[key as string]
      if (statusFromPhase) {
        runtimeStatus = statusFromPhase
      }

      // Nodos con detalle rico: agentes, validaciones y output
      const showsData = step.type === 'external' || step.type === 'validation' || step.type === 'output'
      if (showsData) {
        const phaseData = pipelineData[key]
        if (phaseData) {
          runtimeData = phaseData as Record<string, unknown>
        }
      }
    }

    // Nodos con prompt y preguntas necesitan más altura
    let blockHeight = 140
    if (step.prompt) blockHeight += 120
    if (step.questions && step.questions.length > 0) blockHeight += (step.questions.length * 24)
    if (runtimeData) blockHeight += 64

    dagreGraph.setNode(step.id, { width: 340, height: blockHeight })

    nodes.push({
      id: step.id,
      type: 'flowStep',
      data: {
        label: step.name,
        description: step.description,
        type: step.type,
        phase: phase?.name ?? 'Etapa',
        phaseId: step.phaseId,
        color: phase?.color ?? '#888',
        tags: step.tags,
        questions: step.questions,
        prompt: step.prompt,
        runtimeData,
        fullRuntimeData: pipelineData,
        runtimeStatus
      },
      position: { x: 0, y: 0 }
    })

    if (step.dependsOn) {
      step.dependsOn.forEach((dependencyId) => {
        // Detectamos si es un loop hacia atrás para animarlo distinto
        const isLoop = dependencyId === 're-verification-loop' && step.id === 'simulator-agent'

        edges.push({
          id: `e-${dependencyId}-${step.id}`,
          source: dependencyId,
          target: step.id,
          animated: true,
          type: isLoop ? 'smoothstep' : 'default', // Usamos smoothstep para loops
          label: isLoop ? 'RE-AUDITORÍA' : undefined
        })
        dagreGraph.setEdge(dependencyId, step.id)
      })
    }
  })

  dagre.layout(dagreGraph)

  const positionedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 170, // Centrar basado en el nuevo width
        y: nodeWithPosition.y - 80
      }
    }
  })

  return { nodes: positionedNodes, edges }
}
