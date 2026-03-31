import { Node, Edge, Position } from '@xyflow/react';
import { OrchestratorPhase } from '../pipeline/v6/types';
import { PHASE_ORDER } from '@/components/pipeline-visualizer/pipeline-visualizer-types';

export interface WorkflowNodeData {
  labelKey: string;
  phase: OrchestratorPhase;
  agentName: string | null;
  status: string;
  iteration?: number;
  progress: number;
}

const X_CENTER = 400;
const Y_START = 50;
const Y_STEP = 150;

export function getTopologyNodes(): Node[] {
  const nodes: Node[] = [];

  // Group: User
  nodes.push({
    id: 'group-user',
    data: { label: 'Usuario' },
    position: { x: 50, y: 0 },
    style: { width: 250, height: 1100, backgroundColor: 'rgba(147, 52, 230, 0.05)', border: '1px solid rgba(147, 52, 230, 0.2)', borderRadius: 24 },
    type: 'group',
  });

  // User Nodes
  nodes.push({
    id: 'user-goal',
    data: { labelKey: 'visualizer.user_define_goal' },
    position: { x: 25, y: 50 },
    parentId: 'group-user',
    extent: 'parent',
    type: 'user',
  });

  nodes.push({
    id: 'user-input',
    data: { labelKey: 'visualizer.user_answer_questions' },
    position: { x: 25, y: 300 },
    parentId: 'group-user',
    extent: 'parent',
    type: 'user',
  });

  nodes.push({
    id: 'user-review',
    data: { labelKey: 'visualizer.user_review_plan' },
    position: { x: 25, y: 1000 },
    parentId: 'group-user',
    extent: 'parent',
    type: 'user',
  });

  // Group: Engine
  nodes.push({
    id: 'group-engine',
    data: { label: 'Motor de Generación' },
    position: { x: 350, y: 0 },
    style: { width: 300, height: 1100, backgroundColor: 'rgba(26, 115, 232, 0.03)', border: '1px solid rgba(26, 115, 232, 0.2)', borderRadius: 24 },
    type: 'group',
  });

  // Engine Nodes (from PHASE_ORDER)
  PHASE_ORDER.forEach((p, idx) => {
    if (p.phase === 'failed') return; // Handled separately or at the end
    
    nodes.push({
      id: `node-${p.phase}`,
      data: { 
        labelKey: p.labelKey, 
        phase: p.phase, 
        agentName: p.agentName,
        progress: p.targetProgress
      },
      position: { x: 50, y: 50 + (idx * 110) },
      parentId: 'group-engine',
      extent: 'parent',
      type: 'pipeline',
    });
  });

  // Group: Storage
  nodes.push({
    id: 'group-storage',
    data: { label: 'Almacenamiento' },
    position: { x: 700, y: 0 },
    style: { width: 200, height: 1100, backgroundColor: 'rgba(30, 142, 62, 0.05)', border: '1px solid rgba(30, 142, 62, 0.2)', borderRadius: 24 },
    type: 'group',
  });

  nodes.push({
    id: 'storage-plan',
    data: { labelKey: 'visualizer.storage.plan_label' },
    position: { x: 25, y: 1000 },
    parentId: 'group-storage',
    extent: 'parent',
    type: 'storage',
  });

  return nodes;
}

export function getTopologyEdges(): Edge[] {
  const edges: Edge[] = [];

  // Main flow: User -> Engine
  edges.push({ id: 'e-user-engine', source: 'user-goal', target: 'node-interpret', animated: true });

  // Engine sequential flow
  for (let i = 0; i < PHASE_ORDER.length - 1; i++) {
    const source = PHASE_ORDER[i].phase;
    const target = PHASE_ORDER[i+1].phase;
    if (source === 'failed' || target === 'failed') continue;
    
    edges.push({ 
      id: `e-${source}-${target}`, 
      source: `node-${source}`, 
      target: `node-${target}`,
      type: 'smoothstep',
      animated: false 
    });
  }

  // Clarify <-> User Input
  edges.push({ id: 'e-clarify-user', source: 'node-clarify', target: 'user-input', style: { strokeDasharray: '5,5' } });
  edges.push({ id: 'e-user-clarify', source: 'user-input', target: 'node-clarify', style: { strokeDasharray: '5,5' } });

  // Revise -> Critique loop
  edges.push({ id: 'e-revise-critique', source: 'node-revise', target: 'node-critique', type: 'smoothstep', label: 'reintento' });

  // Done -> Result
  edges.push({ id: 'e-done-review', source: 'node-done', target: 'user-review', animated: true });
  edges.push({ id: 'e-done-storage', source: 'node-done', target: 'storage-plan' });

  return edges;
}
