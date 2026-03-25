import { describe, expect, it, vi } from 'vitest'
import { initializeSimTree, expandNodeChildren } from '../src/lib/flow/simulation-tree-builder'

function strategy(months = 6): any {
  return {
    title: 'Plan Test', summary: '', totalMonths: months,
    estimatedWeeklyHours: 10,
    phases: [{ id: 'ph-1', title: 'Fase 1', summary: '', startMonth: 1, endMonth: months,
      goalIds: ['g-1'], hoursPerWeek: 10, milestone: '', metrics: [] }],
    conflicts: [], milestones: []
  }
}
const reality = {
  status: 'ok' as const, availableHours: 10, neededHours: 10,
  summary: 'OK', recommendations: [], adjustmentsApplied: []
}
const profile = {
  participantes: [{
    datosPersonales: { nombre: 'T', narrativaPersonal: 'Dev', rangoEtario: '25-34', localidad: 'BA' },
    calendario: { horasLibresEstimadas: { diasLaborales: 2, diasDescanso: 4 }, bloqueosSemanales: [], eventosProximos: [], diasNoDisponibles: [] },
    patronesEnergia: { cronotipo: 'intermedio' as const, nivelEnergiaTipico: 'medio' as const, tendencias: [] },
    problemasActuales: [],
    motivacion: { nivelGeneral: 7, tendencias: [] }
  }]
}
const goals = [{
  id: 'g-1', text: 'Objetivo', category: 'carrera' as const, effort: 'medio' as const,
  horizonMonths: 6, hoursPerWeek: 10, priority: 1, isHabit: false, needsClarification: false
}]

describe('simulation-tree-builder', () => {
  it('initializeSimTree genera nodo raiz + años + meses', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const tree = initializeSimTree({ workflowId: 'wf-1', strategy: strategy(), realityCheck: reality, profile, goals })
      expect(tree.nodes[tree.rootNodeId]?.granularity).toBe('plan')
      const months = Object.values(tree.nodes).filter(n => n.granularity === 'month')
      expect(months.length).toBe(6)
      months.forEach(n => expect(n.status).toBe('pending'))
    } finally { vi.useRealTimers() }
  })

  it('genera globalFinding critico si un goal tiene <70% cobertura', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const s = strategy(6); s.phases[0]!.endMonth = 2
      const tree = initializeSimTree({ workflowId: 'wf-1', strategy: s, realityCheck: reality, profile, goals })
      expect(tree.globalFindings.some(f => f.severity === 'critical')).toBe(true)
    } finally { vi.useRealTimers() }
  })

  it('expandNodeChildren genera semanas en un nodo mes', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const tree = initializeSimTree({ workflowId: 'wf-1', strategy: strategy(3), realityCheck: reality, profile, goals: [] })
      const month = Object.values(tree.nodes).find(n => n.granularity === 'month')!
      const expanded = expandNodeChildren(tree, month.id, { strategy: strategy(3), profile, goals: [] })
      const weeks = Object.values(expanded.nodes).filter(n => n.granularity === 'week')
      expect(weeks.length).toBeGreaterThan(0)
      expect(weeks[0]?.parentId).toBe(month.id)
    } finally { vi.useRealTimers() }
  })

  it('expandNodeChildren no duplica hijos si ya estan expandidos', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const tree = initializeSimTree({ workflowId: 'wf-1', strategy: strategy(3), realityCheck: reality, profile, goals: [] })
      const month = Object.values(tree.nodes).find(n => n.granularity === 'month')!
      const e1 = expandNodeChildren(tree, month.id, { strategy: strategy(3), profile, goals: [] })
      const e2 = expandNodeChildren(e1, month.id, { strategy: strategy(3), profile, goals: [] })
      expect(Object.keys(e2.nodes).length).toBe(Object.keys(e1.nodes).length)
    } finally { vi.useRealTimers() }
  })
})
