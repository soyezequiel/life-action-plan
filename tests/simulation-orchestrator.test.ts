import { describe, expect, it, vi } from 'vitest'
import { runSimulationOrchestrator } from '../src/lib/flow/simulation-orchestrator'
import { initializeSimTree } from '../src/lib/flow/simulation-tree-builder'

const s: any = {
  title: 'T', summary: '', totalMonths: 3, estimatedWeeklyHours: 10,
  phases: [{ id: 'p1', title: 'F', summary: '', startMonth: 1, endMonth: 3, goalIds: ['g1'], hoursPerWeek: 10, milestone: '', metrics: [] }],
  conflicts: [], milestones: []
}
const rc = { status: 'ok' as const, availableHours: 10, neededHours: 10, summary: 'OK', recommendations: [], adjustmentsApplied: [] }
const p = {
  participantes: [{
    datosPersonales: { nombre: 'T', narrativaPersonal: 'D', rangoEtario: '25-34', localidad: 'BA' },
    calendario: { horasLibresEstimadas: { diasLaborales: 2, diasDescanso: 4 }, bloqueosSemanales: [], eventosProximos: [], diasNoDisponibles: [] },
    patronesEnergia: { cronotipo: 'intermedio' as const, nivelEnergiaTipico: 'medio' as const, tendencias: [] },
    problemasActuales: [],
    motivacion: { nivelGeneral: 7, tendencias: [] },
    dependientes: [],
    condicionesSalud: [],
    patronesConocidos: { tendencias: [], diaTipicoBueno: '', diaTipicoMalo: '' }
  }]
} as any
const goals = [{
  id: 'g1', text: 'G', category: 'carrera' as const, effort: 'medio' as const,
  horizonMonths: 3, hoursPerWeek: 10, priority: 1, isHabit: false, needsClarification: false
}]

describe('simulation-orchestrator', () => {
  it('sin LLM usa fallbacks y todos los nodos quedan simulated', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const tree = initializeSimTree({ workflowId: 'w', strategy: s, realityCheck: rc, profile: p, goals })
      const ids = Object.values(tree.nodes).filter(n => n.granularity === 'month').map(n => n.id)
      const result = await runSimulationOrchestrator({ runtime: null, traceId: null, tree, targetNodeIds: ids, strategy: s, realityCheck: rc, profile: p, goals, workflowId: 'w', onProgress: () => {} })
      result.simulatedNodes.forEach(n => expect(n.status).toBe('simulated'))
      result.simulatedNodes.forEach(n => expect(n.simulatedWith).toBe('rules'))
    } finally { vi.useRealTimers() }
  })

  it('totalLlmCalls = 0 cuando runtime es null', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const tree = initializeSimTree({ workflowId: 'w', strategy: s, realityCheck: rc, profile: p, goals })
      const ids = Object.values(tree.nodes).filter(n => n.granularity === 'month').map(n => n.id)
      const r = await runSimulationOrchestrator({ runtime: null, traceId: null, tree, targetNodeIds: ids, strategy: s, realityCheck: rc, profile: p, goals, workflowId: 'w', onProgress: () => {} })
      expect(r.totalLlmCalls).toBe(0)
    } finally { vi.useRealTimers() }
  })

  it('emite progress events y el ultimo tiene stage=complete', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const tree = initializeSimTree({ workflowId: 'w', strategy: s, realityCheck: rc, profile: p, goals })
      const ids = Object.values(tree.nodes).filter(n => n.granularity === 'month').map(n => n.id)
      const events: unknown[] = []
      await runSimulationOrchestrator({ runtime: null, traceId: null, tree, targetNodeIds: ids, strategy: s, realityCheck: rc, profile: p, goals, workflowId: 'w', onProgress: e => events.push(e) })
      expect(events.length).toBeGreaterThan(0)
      expect((events[events.length - 1] as any)?.stage).toBe('complete')
    } finally { vi.useRealTimers() }
  })

  it('tree.version se incrementa despues de simular', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const tree = initializeSimTree({ workflowId: 'w', strategy: s, realityCheck: rc, profile: p, goals })
      const [firstId] = Object.values(tree.nodes).filter(n => n.granularity === 'month').map(n => n.id)
      const r = await runSimulationOrchestrator({ runtime: null, traceId: null, tree, targetNodeIds: [firstId!], strategy: s, realityCheck: rc, profile: p, goals, workflowId: 'w', onProgress: () => {} })
      expect(r.tree.version).toBeGreaterThan(tree.version)
    } finally { vi.useRealTimers() }
  })
})
