import dagre from 'dagre'
import type { FlowStep, FlowPhase } from './types'
import { FLOW_STEPS, FLOW_PHASES } from './flow-definition'

export type GraphNode = {
  id: string;
  type: string;
  data: { 
    label: string; 
    description: string; 
    type: string; 
    phase: string; 
    color: string; 
    tags?: string[];
    questions?: string[];
    prompt?: string;
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

export function generateGraphData() {
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
    
    // Nodos con prompt y preguntas necesitan más altura
    let blockHeight = 140
    if (step.prompt) blockHeight += 120
    if (step.questions && step.questions.length > 0) blockHeight += (step.questions.length * 24)

    dagreGraph.setNode(step.id, { width: 340, height: blockHeight })

    nodes.push({
      id: step.id,
      type: 'flowStep',
      data: {
        label: step.name,
        description: step.description,
        type: step.type,
        phase: phase?.name ?? 'Etapa',
        color: phase?.color ?? '#888',
        tags: step.tags,
        questions: step.questions,
        prompt: step.prompt
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
          label: isLoop ? 'RE-AUDIT' : undefined
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
