import { DateTime } from 'luxon'
import type { Perfil } from '../../shared/schemas/perfil'
import type {
  GoalDraft,
  RealityCheckResult,
  StrategicPlanDraft
} from '../../shared/schemas/flow'
import type {
  SimFinding,
  SimGoalBreakdownEntry,
  SimNode,
  SimTree
} from '../../shared/schemas/simulation-tree'

function nowIso(): string {
  return DateTime.utc().toISO() ?? '2026-01-01T00:00:00.000Z'
}

function planStartDate(): DateTime {
  return DateTime.utc().startOf('month')
}

function nodeId(granularity: string, key: string): string {
  return `${granularity}-${key}`
}

function buildGoalBreakdown(
  params: {
    periodStart: DateTime
    periodEnd: DateTime
    strategy: StrategicPlanDraft
    goals: GoalDraft[]
    planStart: DateTime
  }
): SimNode['goalBreakdown'] {
  const { periodStart, periodEnd, strategy, goals, planStart } = params
  const breakdown: SimNode['goalBreakdown'] = {}

  for (const goal of goals) {
    const goalHorizonEnd = planStart.plus({ months: goal.horizonMonths })
    const periodOverlapsHorizon =
      periodStart < goalHorizonEnd && periodEnd > planStart

    const weeksInPeriod = periodEnd.diff(periodStart, 'weeks').weeks
    const requiredHours = periodOverlapsHorizon
      ? Math.max(0, goal.hoursPerWeek * Math.max(0, Math.min(weeksInPeriod, goalHorizonEnd.diff(periodStart, 'weeks').weeks)))
      : 0

    const plannedHours = strategy.phases.reduce((total, phase) => {
      const phaseStart = planStart.plus({ months: phase.startMonth - 1 })
      const phaseEnd = planStart.plus({ months: phase.endMonth })
      if (!phase.goalIds.includes(goal.id)) return total
      const overlapStart = DateTime.max(periodStart, phaseStart)
      const overlapEnd = DateTime.min(periodEnd, phaseEnd)
      if (overlapEnd <= overlapStart) return total
      const overlapWeeks = overlapEnd.diff(overlapStart, 'weeks').weeks
      return total + phase.hoursPerWeek * Math.max(0, overlapWeeks)
    }, 0)

    if (plannedHours > 0 || requiredHours > 0) {
      breakdown[goal.id] = {
        plannedHours: Math.round(plannedHours * 10) / 10,
        requiredHours: Math.round(requiredHours * 10) / 10,
        actualHours: null,
        status: 'on_track'
      } satisfies SimGoalBreakdownEntry
    }
  }

  return breakdown
}

function buildPlannedHours(
  periodStart: DateTime,
  periodEnd: DateTime,
  strategy: StrategicPlanDraft,
  planStart: DateTime
): number {
  const weeksInPeriod = periodEnd.diff(periodStart, 'weeks').weeks
  if (weeksInPeriod <= 0) return 0

  return strategy.phases.reduce((total, phase) => {
    const phaseStart = planStart.plus({ months: phase.startMonth - 1 })
    const phaseEnd = planStart.plus({ months: phase.endMonth })
    const overlapStart = DateTime.max(periodStart, phaseStart)
    const overlapEnd = DateTime.min(periodEnd, phaseEnd)
    if (overlapEnd <= overlapStart) return total
    const overlapWeeks = overlapEnd.diff(overlapStart, 'weeks').weeks
    return total + phase.hoursPerWeek * Math.max(0, overlapWeeks)
  }, 0)
}

export function initializeSimTree(params: {
  workflowId: string
  strategy: StrategicPlanDraft
  realityCheck: RealityCheckResult
  profile: Perfil
  goals: GoalDraft[]
}): SimTree {
  const { workflowId, strategy, goals } = params
  const now = nowIso()
  const planStart = planStartDate()
  const planEnd = planStart.plus({ months: strategy.totalMonths })
  const totalYears = Math.ceil(strategy.totalMonths / 12)

  const nodes: Record<string, SimNode> = {}
  const globalFindings: SimFinding[] = []

  // Root plan node
  const rootId = nodeId('plan', workflowId)
  const totalPlannedHours = buildPlannedHours(planStart, planEnd, strategy, planStart)
  nodes[rootId] = {
    id: rootId,
    parentId: null,
    granularity: 'plan',
    label: strategy.title,
    period: { start: planStart.toISODate() ?? now, end: planEnd.toISODate() ?? now },
    status: 'pending',
    version: 1,
    plannedHours: Math.round(totalPlannedHours * 10) / 10,
    actualHours: null,
    quality: null,
    disruptions: [],
    responses: [],
    findings: [],
    goalBreakdown: buildGoalBreakdown({ periodStart: planStart, periodEnd: planEnd, strategy, goals, planStart }),
    childIds: [],
    incomingAdjustments: [],
    timeSlot: null,
    simulatedAt: null,
    simulatedWith: null,
    actionLog: []
  }

  // Year nodes
  const yearIds: string[] = []
  for (let y = 0; y < totalYears; y++) {
    const yearStart = planStart.plus({ years: y })
    const yearEnd = DateTime.min(planStart.plus({ years: y + 1 }), planEnd)
    const yId = nodeId('year', `${y + 1}`)
    const yearHours = buildPlannedHours(yearStart, yearEnd, strategy, planStart)
    nodes[yId] = {
      id: yId,
      parentId: rootId,
      granularity: 'year',
      label: `Año ${y + 1}`,
      period: { start: yearStart.toISODate() ?? now, end: yearEnd.toISODate() ?? now },
      status: 'pending',
      version: 1,
      plannedHours: Math.round(yearHours * 10) / 10,
      actualHours: null,
      quality: null,
      disruptions: [],
      responses: [],
      findings: [],
      goalBreakdown: buildGoalBreakdown({ periodStart: yearStart, periodEnd: yearEnd, strategy, goals, planStart }),
      childIds: [],
      incomingAdjustments: [],
      timeSlot: null,
      simulatedAt: null,
      simulatedWith: null,
      actionLog: []
    }
    yearIds.push(yId)
  }
  nodes[rootId] = { ...nodes[rootId]!, childIds: yearIds }

  // Month nodes (only active months 1..totalMonths)
  for (let m = 0; m < strategy.totalMonths; m++) {
    const monthStart = planStart.plus({ months: m })
    const monthEnd = planStart.plus({ months: m + 1 })
    const yearIndex = Math.floor(m / 12)
    const parentYearId = yearIds[yearIndex]
    if (!parentYearId) continue

    const mId = nodeId('month', `${m + 1}`)
    const monthHours = buildPlannedHours(monthStart, monthEnd, strategy, planStart)
    nodes[mId] = {
      id: mId,
      parentId: parentYearId,
      granularity: 'month',
      label: monthStart.setLocale('es').toFormat('MMMM yyyy'),
      period: { start: monthStart.toISODate() ?? now, end: monthEnd.toISODate() ?? now },
      status: 'pending',
      version: 1,
      plannedHours: Math.round(monthHours * 10) / 10,
      actualHours: null,
      quality: null,
      disruptions: [],
      responses: [],
      findings: [],
      goalBreakdown: buildGoalBreakdown({ periodStart: monthStart, periodEnd: monthEnd, strategy, goals, planStart }),
      childIds: [],
      incomingAdjustments: [],
      timeSlot: null,
      simulatedAt: null,
      simulatedWith: null,
      actionLog: []
    }

    const parentYear = nodes[parentYearId]!
    nodes[parentYearId] = { ...parentYear, childIds: [...parentYear.childIds, mId] }
  }

  // Coverage check: each goal should have ≥70% of its horizon covered by phases
  const allGoalIds = [...new Set(strategy.phases.flatMap((p) => p.goalIds))]
  for (const goalId of allGoalIds) {
    const goalData = goals.find((g) => g.id === goalId)
    if (!goalData) continue

    const coveredMonths = new Set<number>()
    for (const phase of strategy.phases) {
      if (phase.goalIds.includes(goalId)) {
        for (let m = phase.startMonth; m <= phase.endMonth; m++) coveredMonths.add(m)
      }
    }

    if (coveredMonths.size < goalData.horizonMonths * 0.7) {
      globalFindings.push({
        id: `coverage-${goalId}`,
        severity: 'critical',
        message: `El objetivo "${goalData.text.slice(0, 40)}" solo tiene cobertura en ${coveredMonths.size} de ${goalData.horizonMonths} meses.`,
        nodeId: rootId,
        target: 'strategy',
        suggestedFix: 'Extender las fases del objetivo para cubrir todo su horizonte.'
      })
    }
  }

  const treeId = `tree-${workflowId}`
  return {
    id: treeId,
    workflowId,
    rootNodeId: rootId,
    nodes,
    globalFindings,
    totalSimulations: 0,
    estimatedLlmCostSats: 0,
    version: 1,
    createdAt: now,
    updatedAt: now,
    persona: null
  }
}

export function expandNodeChildren(
  tree: SimTree,
  nodeId: string,
  params: {
    strategy: StrategicPlanDraft
    profile: Perfil
    goals: GoalDraft[]
  }
): SimTree {
  const { strategy, profile, goals } = params
  const node = tree.nodes[nodeId]
  if (!node) return tree

  const planStart = DateTime.fromISO(tree.nodes[tree.rootNodeId]?.period.start ?? DateTime.utc().toISO()!)
  const now = DateTime.utc().toISO() ?? '2026-01-01T00:00:00.000Z'

  // Don't re-expand if already has children
  if (node.childIds.length > 0) return tree

  const participant = profile.participantes[0]
  const weekdayFreeHours = participant?.calendario?.horasLibresEstimadas?.diasLaborales ?? 2
  const weekendFreeHours = participant?.calendario?.horasLibresEstimadas?.diasDescanso ?? 4
  const availabilityGrid = participant?.calendario

  const nodes = { ...tree.nodes }
  const childIds: string[] = []

  if (node.granularity === 'month') {
    // Expand month → ISO weeks
    const monthStart = DateTime.fromISO(node.period.start)
    const monthEnd = DateTime.fromISO(node.period.end)
    let weekStart = monthStart.startOf('week')

    while (weekStart < monthEnd) {
      const weekEnd = weekStart.plus({ weeks: 1 })
      const clampedStart = DateTime.max(weekStart, monthStart)
      const clampedEnd = DateTime.min(weekEnd, monthEnd)
      // Prorate hours by actual days
      const weekHours = buildPlannedHours(clampedStart, clampedEnd, strategy, planStart)
      const wId = `week-${weekStart.toISODate()}`

      nodes[wId] = {
        id: wId,
        parentId: nodeId,
        granularity: 'week',
        label: `Semana del ${clampedStart.setLocale('es').toFormat('d MMM')}`,
        period: { start: clampedStart.toISODate() ?? now, end: clampedEnd.toISODate() ?? now },
        status: 'pending',
        version: 1,
        plannedHours: Math.round(weekHours * 10) / 10,
        actualHours: null,
        quality: null,
        disruptions: [],
        responses: [],
        findings: [],
        goalBreakdown: buildGoalBreakdown({ periodStart: clampedStart, periodEnd: clampedEnd, strategy, goals, planStart }),
        childIds: [],
        incomingAdjustments: [],
        timeSlot: null,
        simulatedAt: null,
        simulatedWith: null,
        actionLog: []
      }
      childIds.push(wId)
      weekStart = weekEnd
    }
  } else if (node.granularity === 'week') {
    // Expand week → 7 days
    const weekStart = DateTime.fromISO(node.period.start)
    const weekEnd = DateTime.fromISO(node.period.end)

    for (let d = 0; d < 7; d++) {
      const dayStart = weekStart.plus({ days: d })
      if (dayStart >= weekEnd) break
      const dayEnd = dayStart.plus({ days: 1 })

      const isWeekend = dayStart.weekday >= 6
      const availableHours = isWeekend ? weekendFreeHours : weekdayFreeHours
      const dayPlanned = Math.min(
        buildPlannedHours(dayStart, dayEnd, strategy, planStart),
        availableHours
      )

      const dayOfWeek = dayStart.weekday // 1=Mon, 7=Sun
      const dayKey = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][dayOfWeek - 1]

      // Determine primary time slot from availability grid
      let primarySlot: 'morning' | 'afternoon' | 'evening' | null = null
      if (availabilityGrid && dayKey) {
        const daySlots = (availabilityGrid as unknown as Record<string, Record<string, boolean> | undefined>)[dayKey]
        if (daySlots?.evening) primarySlot = 'evening'
        else if (daySlots?.afternoon) primarySlot = 'afternoon'
        else if (daySlots?.morning) primarySlot = 'morning'
      }

      const dId = `day-${dayStart.toISODate()}`
      nodes[dId] = {
        id: dId,
        parentId: nodeId,
        granularity: 'day',
        label: dayStart.setLocale('es').toFormat('EEEE d MMM'),
        period: { start: dayStart.toISODate() ?? now, end: dayEnd.toISODate() ?? now },
        status: 'pending',
        version: 1,
        plannedHours: Math.round(dayPlanned * 10) / 10,
        actualHours: null,
        quality: null,
        disruptions: [],
        responses: [],
        findings: [],
        goalBreakdown: buildGoalBreakdown({ periodStart: dayStart, periodEnd: dayEnd, strategy, goals, planStart }),
        childIds: [],
        incomingAdjustments: [],
        timeSlot: primarySlot,
        simulatedAt: null,
        simulatedWith: null,
        actionLog: []
      }
      childIds.push(dId)
    }
  }

  if (childIds.length === 0) return tree

  nodes[nodeId] = { ...node, childIds }
  return { ...tree, nodes, updatedAt: now }
}

export function calculateNodePlannedHours(
  node: SimNode,
  strategy: StrategicPlanDraft,
  goals: GoalDraft[],
  profile: Perfil,
  planStart?: DateTime
): { plannedHours: number; goalBreakdown: SimNode['goalBreakdown'] } {
  const start = planStart ?? DateTime.utc().startOf('month')
  const periodStart = DateTime.fromISO(node.period.start)
  const periodEnd = DateTime.fromISO(node.period.end)

  const plannedHours = buildPlannedHours(periodStart, periodEnd, strategy, start)
  const breakdown = buildGoalBreakdown({ periodStart, periodEnd, strategy, goals, planStart: start })

  return { plannedHours: Math.round(plannedHours * 10) / 10, goalBreakdown: breakdown }
}
