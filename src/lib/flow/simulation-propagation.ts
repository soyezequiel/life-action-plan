import { DateTime } from 'luxon'
import type { StrategicPlanDraft } from '../../shared/schemas/flow'
import type {
  SimFinding,
  SimNode,
  SimStrategyPatch,
  SimTree
} from '../../shared/schemas/simulation-tree'

export type PropagationDirection = 'down' | 'up' | 'lateral'

export interface PropagationResult {
  affectedNodeIds: string[]
  staleNodeIds: string[]
  updatedTree: SimTree
  summary: string
}

function nowIso(): string {
  return DateTime.utc().toISO() ?? '2026-01-01T00:00:00.000Z'
}

function updateNode(tree: SimTree, nodeId: string, patch: Partial<SimNode>): SimTree {
  const node = tree.nodes[nodeId]
  if (!node) return tree
  return {
    ...tree,
    nodes: {
      ...tree.nodes,
      [nodeId]: { ...node, ...patch }
    }
  }
}

/**
 * propagateDown: When a parent node changes, mark simulated children as stale.
 * Locked children are never touched.
 */
export function propagateDown(tree: SimTree, nodeId: string): PropagationResult {
  const node = tree.nodes[nodeId]
  if (!node) return { affectedNodeIds: [], staleNodeIds: [], updatedTree: tree, summary: '' }

  const staleNodeIds: string[] = []
  let updatedTree = tree

  function markChildrenStale(nId: string) {
    const n = updatedTree.nodes[nId]
    if (!n) return

    for (const childId of n.childIds) {
      const child = updatedTree.nodes[childId]
      if (!child) continue

      if (child.status === 'locked') {
        // Don't touch locked nodes
        markChildrenStale(childId) // but recurse into their children
      } else if (child.status === 'simulated' || child.status === 'affected') {
        updatedTree = updateNode(updatedTree, childId, { status: 'stale' })
        staleNodeIds.push(childId)
        markChildrenStale(childId)
      } else if (child.status === 'pending') {
        // Update plannedHours from parent but keep pending
        markChildrenStale(childId)
      }
    }
  }

  markChildrenStale(nodeId)

  return {
    affectedNodeIds: [],
    staleNodeIds,
    updatedTree: { ...updatedTree, updatedAt: nowIso() },
    summary: `${staleNodeIds.length} nodos marcados como desactualizados.`
  }
}

/**
 * propagateUp: Recalculate parent numbers from children. NEVER re-calls LLM.
 * If delta > 10%, parent passes to 'affected'.
 */
export function propagateUp(tree: SimTree, nodeId: string): PropagationResult {
  const node = tree.nodes[nodeId]
  if (!node || !node.parentId) {
    return { affectedNodeIds: [], staleNodeIds: [], updatedTree: tree, summary: '' }
  }

  const parent = tree.nodes[node.parentId]
  if (!parent) return { affectedNodeIds: [], staleNodeIds: [], updatedTree: tree, summary: '' }

  const affectedNodeIds: string[] = []

  // Sum actualHours of all simulated children
  const simulatedChildren = parent.childIds
    .map((id) => tree.nodes[id])
    .filter((child): child is SimNode => !!child && child.actualHours !== null)

  if (simulatedChildren.length === 0) {
    return { affectedNodeIds: [], staleNodeIds: [], updatedTree: tree, summary: '' }
  }

  const totalActual = simulatedChildren.reduce((sum, c) => sum + (c.actualHours ?? 0), 0)
  const avgQuality = simulatedChildren.reduce((sum, c) => sum + (c.quality ?? 0), 0) / simulatedChildren.length

  const delta = parent.plannedHours > 0
    ? Math.abs(totalActual - parent.plannedHours) / parent.plannedHours
    : 0

  const newStatus = delta > 0.1
    ? (parent.status === 'simulated' || parent.status === 'pending' ? 'affected' : parent.status)
    : parent.status

  if (newStatus === 'affected') affectedNodeIds.push(parent.id)

  const updatedTree = updateNode(tree, parent.id, {
    actualHours: Math.round(totalActual * 10) / 10,
    quality: Math.round(avgQuality),
    status: newStatus
  })

  return {
    affectedNodeIds,
    staleNodeIds: [],
    updatedTree: { ...updatedTree, updatedAt: nowIso() },
    summary: `Padre actualizado: ${totalActual.toFixed(1)}h reales, calidad ${Math.round(avgQuality)}%.`
  }
}

/**
 * propagateLateral: When a node changes, notify siblings.
 * Simulated/stale siblings → 'affected'.
 * Pending siblings → incomingAdjustments.
 * Locked siblings → untouched.
 */
export function propagateLateral(tree: SimTree, nodeId: string): PropagationResult {
  const node = tree.nodes[nodeId]
  if (!node || !node.parentId) {
    return { affectedNodeIds: [], staleNodeIds: [], updatedTree: tree, summary: '' }
  }

  const parent = tree.nodes[node.parentId]
  if (!parent) return { affectedNodeIds: [], staleNodeIds: [], updatedTree: tree, summary: '' }

  const affectedNodeIds: string[] = []
  let updatedTree = tree

  const deltaHours = node.actualHours !== null
    ? node.actualHours - node.plannedHours
    : 0

  for (const siblingId of parent.childIds) {
    if (siblingId === nodeId) continue
    const sibling = tree.nodes[siblingId]
    if (!sibling) continue

    if (sibling.status === 'locked') continue

    if (sibling.status === 'simulated' || sibling.status === 'stale') {
      updatedTree = updateNode(updatedTree, siblingId, { status: 'affected' })
      affectedNodeIds.push(siblingId)
    } else if (sibling.status === 'pending' && deltaHours !== 0) {
      const adjustment = {
        fromNodeId: nodeId,
        deltaHours,
        reason: `Ajuste desde ${node.label}: ${deltaHours > 0 ? '+' : ''}${deltaHours.toFixed(1)}h`
      }
      updatedTree = updateNode(updatedTree, siblingId, {
        incomingAdjustments: [...sibling.incomingAdjustments, adjustment]
      })
    }
  }

  return {
    affectedNodeIds,
    staleNodeIds: [],
    updatedTree: { ...updatedTree, updatedAt: nowIso() },
    summary: `${affectedNodeIds.length} hermanos marcados como afectados.`
  }
}

export interface ApplyCorrectionsResult {
  tree: SimTree
  propagation: PropagationResult
  strategyPatches: SimStrategyPatch[]
}

/**
 * applyCorrections: Apply findings corrections.
 * target:'tree' → modify tree directly.
 * target:'strategy' → return SimStrategyPatch, do NOT touch tree.
 */
export function applyCorrections(
  tree: SimTree,
  corrections: Array<{ findingId: string; action: 'apply' | 'dismiss' }>,
  _strategy: StrategicPlanDraft
): ApplyCorrectionsResult {
  const strategyPatches: SimStrategyPatch[] = []
  let updatedTree = tree

  // Collect all findings from all nodes
  const allFindings: Array<SimFinding & { nodeId: string }> = [
    ...tree.globalFindings.map((f) => ({ ...f, nodeId: f.nodeId })),
    ...Object.values(tree.nodes).flatMap((node) =>
      node.findings.map((f) => ({ ...f, nodeId: node.id }))
    )
  ]

  for (const correction of corrections) {
    if (correction.action === 'dismiss') continue

    const finding = allFindings.find((f) => f.id === correction.findingId)
    if (!finding) continue

    if (finding.target === 'strategy') {
      // Generate a strategy patch based on finding type
      const patch: SimStrategyPatch = {
        type: 'adjust_hours',
        phaseId: null,
        goalId: null,
        params: {
          findingId: finding.id,
          message: finding.message,
          suggestedFix: finding.suggestedFix
        }
      }
      strategyPatches.push(patch)
    } else {
      // target === 'tree': mark affected node as needing re-simulation
      const nodeInTree = updatedTree.nodes[finding.nodeId]
      if (nodeInTree && nodeInTree.status === 'simulated') {
        updatedTree = updateNode(updatedTree, finding.nodeId, { status: 'stale' })
      }
    }
  }

  const affectedNodeIds = corrections
    .filter((c) => c.action === 'apply')
    .map((c) => {
      const f = allFindings.find((f) => f.id === c.findingId)
      return f?.nodeId ?? null
    })
    .filter((id): id is string => id !== null)

  const propagation: PropagationResult = {
    affectedNodeIds,
    staleNodeIds: [],
    updatedTree: { ...updatedTree, updatedAt: nowIso() },
    summary: `${corrections.filter((c) => c.action === 'apply').length} correcciones aplicadas.`
  }

  return {
    tree: propagation.updatedTree,
    propagation,
    strategyPatches
  }
}
