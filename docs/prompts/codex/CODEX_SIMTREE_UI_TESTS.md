# CODEX — Simulación Jerárquica: Migración, Tests y UI

> Para Antigravity. Leer completo antes de modificar nada.
> Stack: Next.js 15 App Router, PostgreSQL + Drizzle ORM, Zod `.strict()`, Luxon, Vitest, CSS Modules.
> Regla crítica: la UI NO expone jerga técnica (`LLM`, `API`, `JSON`, `Tokens`). Usar i18n para todos los strings visibles.

---

## Contexto

Se implementó un sistema de simulación jerárquica con árbol (SimTree) que reemplaza la simulación plana.
El árbol tiene nodos por granularidad: plan → año → mes → semana → día.
Los agentes duales **MUNDO** (genera disrupciones) y **YO** (responde) simulan cada nodo con LLM o con fallback determinístico.

**Archivos clave ya implementados** (NO modificar salvo donde se indique):
- `src/shared/schemas/simulation-tree.ts` — schemas Zod + tipos
- `src/lib/db/schema.ts` — tabla `planSimulationTrees` (pendiente migración)
- `src/lib/db/db-helpers.ts` — `getSimulationTree`, `upsertSimulationTree`
- `src/lib/flow/simulation-tree-builder.ts` — `initializeSimTree`, `expandNodeChildren`
- `src/lib/flow/simulation-propagation.ts` — `propagateUp`, `propagateDown`, `propagateLateral`, `applyCorrections`
- `src/lib/flow/agents/world-agent.ts` — agente MUNDO + fallback
- `src/lib/flow/agents/user-agent.ts` — agente YO + fallback
- `src/lib/flow/agents/llm-json-parser.ts` — `extractFirstJsonObject`
- `src/lib/flow/simulation-orchestrator.ts` — `runSimulationOrchestrator`
- `app/api/flow/session/[workflowId]/simulation-tree/route.ts` — API (acciones: initialize, expand-node, simulate-node, simulate-range, apply-corrections, lock-node)
- `src/lib/client/flow-client.ts` — métodos: `initializeSimTree`, `expandSimNode`, `simulateNode`, `simulateRange`, `applySimCorrections`, `lockSimNode`
- `src/i18n/locales/es-AR.json` — claves bajo `simulation.tree.*`

**Lo que falta** (estas 3 tareas, en orden de prioridad):
1. Migración de base de datos
2. Tests
3. UI en FlowPageContent

---

## Tarea 1 — Migración de base de datos

La tabla `plan_simulation_trees` fue agregada a `src/lib/db/schema.ts` pero no existe en la DB todavía.

**Pasos:**

```bash
# Desde el directorio raíz del proyecto
npx drizzle-kit generate
npx drizzle-kit push
```

**Verificación:** correr `npm test` — todos los tests deben pasar. Si hay error de conexión a DB en los tests, es normal (los tests no usan DB real). Solo verificar que compilen y pasen los tests existentes.

**No crear archivos nuevos para esta tarea.** Solo ejecutar los comandos.

---

## Tarea 2 — Tests

Crear los siguientes archivos en `tests/`. Todos usan Vitest (importar desde `'vitest'`).
Correr `npm test` después de cada archivo para verificar que pasa.

### 2.1 `tests/simulation-tree-schema.test.ts`

Verificar que los schemas Zod parsean correctamente y que `.strict()` rechaza campos extra.

```ts
import { describe, expect, it } from 'vitest'
import {
  simFindingSchema,
  simNodeSchema,
  simTreeSchema,
  simDisruptionSchema,
  simResponseSchema
} from '../src/shared/schemas/simulation-tree'

describe('simulation-tree schemas', () => {
  it('parsea un SimFinding valido', () => {
    const result = simFindingSchema.parse({
      id: 'f-1',
      severity: 'warning',
      message: 'Periodo sin cobertura.',
      nodeId: 'month-1',
      target: 'strategy',
      suggestedFix: null
    })
    expect(result.severity).toBe('warning')
    expect(result.target).toBe('strategy')
  })

  it('rechaza un SimFinding con campo extra (strict)', () => {
    expect(() => simFindingSchema.parse({
      id: 'f-1',
      severity: 'info',
      message: 'ok',
      nodeId: 'month-1',
      extraField: true
    })).toThrow()
  })

  it('parsea un SimNode con defaults aplicados', () => {
    const node = simNodeSchema.parse({
      id: 'month-1',
      parentId: 'year-1',
      granularity: 'month',
      label: 'Mes 1',
      period: { start: '2026-01-01', end: '2026-02-01' },
      status: 'pending',
      version: 1,
      plannedHours: 40,
      actualHours: null,
      quality: null,
      disruptions: [],
      responses: [],
      findings: [],
      goalBreakdown: {},
      childIds: [],
      incomingAdjustments: [],
      timeSlot: null,
      simulatedAt: null,
      simulatedWith: null
    })
    expect(node.granularity).toBe('month')
    expect(node.status).toBe('pending')
    expect(node.disruptions).toEqual([])
  })

  it('rechaza status invalido', () => {
    expect(() => simNodeSchema.parse({
      id: 'x', parentId: null, granularity: 'month', label: 'X',
      period: { start: '2026-01-01', end: '2026-02-01' },
      status: 'unknown', version: 1, plannedHours: 0, actualHours: null,
      quality: null, disruptions: [], responses: [], findings: [],
      goalBreakdown: {}, childIds: [], incomingAdjustments: [],
      timeSlot: null, simulatedAt: null, simulatedWith: null
    })).toThrow()
  })

  it('parsea un SimDisruption valido', () => {
    const d = simDisruptionSchema.parse({
      id: 'd-1', type: 'energy_drop',
      description: 'Bajo rendimiento esta semana.',
      impactHours: 3, affectedGoalIds: ['goal-1']
    })
    expect(d.type).toBe('energy_drop')
    expect(d.impactHours).toBe(3)
  })

  it('parsea un SimResponse valido', () => {
    const r = simResponseSchema.parse({
      id: 'r-1', action: 'absorb',
      description: 'Absorber la disrupcion.',
      hoursRecovered: 0, tradeoff: null
    })
    expect(r.action).toBe('absorb')
  })
})
```

### 2.2 `tests/simulation-tree-builder.test.ts`

Verificar `initializeSimTree` y `expandNodeChildren`.

```ts
import { describe, expect, it, vi } from 'vitest'
import { DateTime } from 'luxon'
import { initializeSimTree, expandNodeChildren } from '../src/lib/flow/simulation-tree-builder'
import type { StrategicPlanDraft, RealityCheckResult } from '../src/shared/schemas/flow'
import type { Perfil } from '../src/shared/schemas/perfil'

function makeStrategy(totalMonths = 6): StrategicPlanDraft {
  return {
    title: 'Plan Test',
    summary: 'Plan de prueba',
    totalMonths,
    estimatedWeeklyHours: 10,
    peakWeeklyHours: 10,
    phases: [
      {
        id: 'ph-1',
        title: 'Fase 1',
        summary: 'Primera fase',
        startMonth: 1,
        endMonth: totalMonths,
        goalIds: ['goal-1'],
        hoursPerWeek: 10,
        milestone: 'Completar fase 1',
        metrics: [],
        isSupportTrack: false
      }
    ],
    conflicts: []
  }
}

function makeRealityCheck(): RealityCheckResult {
  return {
    status: 'ok',
    availableHours: 10,
    neededHours: 10,
    summary: 'OK',
    recommendations: [],
    adjustmentsApplied: []
  }
}

function makeProfile(): Perfil {
  return {
    participantes: [{
      datosPersonales: {
        nombre: 'Test',
        narrativaPersonal: 'Desarrollador',
        rangoEtario: '25-34',
        localidad: 'Buenos Aires'
      },
      calendario: {
        horasLibresEstimadas: { diasLaborales: 2, diasDescanso: 4 },
        bloqueosSemanales: [],
        eventosProximos: [],
        diasNoDisponibles: []
      },
      patronesEnergia: {
        cronotipo: 'intermedio',
        nivelEnergiaTipico: 'medio',
        tendencias: []
      },
      problemasActuales: [],
      motivacion: { nivelGeneral: 7, tendencias: [] }
    }]
  }
}

describe('simulation-tree-builder', () => {
  it('initializeSimTree crea nodo raiz + años + meses', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    try {
      const tree = initializeSimTree({
        workflowId: 'wf-test',
        strategy: makeStrategy(6),
        realityCheck: makeRealityCheck(),
        profile: makeProfile(),
        goals: [{ id: 'goal-1', text: 'Objetivo de prueba', category: 'carrera', effort: 'medio', horizonMonths: 6, hoursPerWeek: 10, priority: 1, isHabit: false, needsClarification: false }]
      })

      // Debe tener nodo raiz
      expect(tree.rootNodeId).toMatch(/^plan-/)
      expect(tree.nodes[tree.rootNodeId]).toBeDefined()
      expect(tree.nodes[tree.rootNodeId]?.granularity).toBe('plan')

      // Debe tener nodos mes (6 meses)
      const monthNodes = Object.values(tree.nodes).filter(n => n.granularity === 'month')
      expect(monthNodes.length).toBe(6)

      // Todos los meses empiezan como 'pending'
      monthNodes.forEach(n => expect(n.status).toBe('pending'))
    } finally {
      vi.useRealTimers()
    }
  })

  it('initializeSimTree agrega globalFinding si un goal tiene <70% cobertura temporal', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    try {
      const strategy = makeStrategy(6)
      // Fase cubre solo mes 1-2 de un goal que necesita 6 meses
      strategy.phases[0]!.endMonth = 2

      const tree = initializeSimTree({
        workflowId: 'wf-test',
        strategy,
        realityCheck: makeRealityCheck(),
        profile: makeProfile(),
        goals: [{ id: 'goal-1', text: 'Objetivo largo', category: 'carrera', effort: 'alto', horizonMonths: 6, hoursPerWeek: 10, priority: 1, isHabit: false, needsClarification: false }]
      })

      const criticalFindings = tree.globalFindings.filter(f => f.severity === 'critical')
      expect(criticalFindings.length).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('expandNodeChildren genera semanas al expandir un mes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    try {
      const tree = initializeSimTree({
        workflowId: 'wf-test',
        strategy: makeStrategy(3),
        realityCheck: makeRealityCheck(),
        profile: makeProfile(),
        goals: []
      })

      const monthNode = Object.values(tree.nodes).find(n => n.granularity === 'month')
      expect(monthNode).toBeDefined()

      const expanded = expandNodeChildren(tree, monthNode!.id, {
        strategy: makeStrategy(3),
        profile: makeProfile(),
        goals: []
      })

      const weekNodes = Object.values(expanded.nodes).filter(n => n.granularity === 'week')
      expect(weekNodes.length).toBeGreaterThan(0)
      expect(weekNodes[0]?.parentId).toBe(monthNode!.id)
    } finally {
      vi.useRealTimers()
    }
  })

  it('expandNodeChildren no re-expande si ya tiene hijos', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    try {
      const tree = initializeSimTree({
        workflowId: 'wf-test',
        strategy: makeStrategy(3),
        realityCheck: makeRealityCheck(),
        profile: makeProfile(),
        goals: []
      })
      const monthNode = Object.values(tree.nodes).find(n => n.granularity === 'month')!
      const expanded1 = expandNodeChildren(tree, monthNode.id, { strategy: makeStrategy(3), profile: makeProfile(), goals: [] })
      const nodeCountAfter1 = Object.keys(expanded1.nodes).length
      const expanded2 = expandNodeChildren(expanded1, monthNode.id, { strategy: makeStrategy(3), profile: makeProfile(), goals: [] })
      expect(Object.keys(expanded2.nodes).length).toBe(nodeCountAfter1)
    } finally {
      vi.useRealTimers()
    }
  })
})
```

### 2.3 `tests/simulation-propagation.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest'
import { DateTime } from 'luxon'
import { propagateUp, propagateDown, propagateLateral, applyCorrections } from '../src/lib/flow/simulation-propagation'
import type { SimTree, SimNode } from '../src/shared/schemas/simulation-tree'

function makeNode(id: string, overrides: Partial<SimNode> = {}): SimNode {
  return {
    id,
    parentId: null,
    granularity: 'month',
    label: `Nodo ${id}`,
    period: { start: '2026-01-01', end: '2026-02-01' },
    status: 'pending',
    version: 1,
    plannedHours: 40,
    actualHours: null,
    quality: null,
    disruptions: [],
    responses: [],
    findings: [],
    goalBreakdown: {},
    childIds: [],
    incomingAdjustments: [],
    timeSlot: null,
    simulatedAt: null,
    simulatedWith: null,
    ...overrides
  }
}

function makeTree(nodes: SimNode[], rootId: string): SimTree {
  const nodesMap: Record<string, SimNode> = {}
  for (const n of nodes) nodesMap[n.id] = n
  return {
    id: 'tree-test',
    workflowId: 'wf-test',
    rootNodeId: rootId,
    nodes: nodesMap,
    globalFindings: [],
    totalSimulations: 0,
    estimatedLlmCostSats: 0,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

describe('simulation-propagation', () => {
  it('propagateUp marca al padre como affected si el hijo cambia >10%', () => {
    const parent = makeNode('parent', {
      granularity: 'year',
      childIds: ['child'],
      plannedHours: 100,
      actualHours: 100,
      status: 'simulated'
    })
    const child = makeNode('child', {
      parentId: 'parent',
      status: 'simulated',
      plannedHours: 40,
      actualHours: 20  // 50% menos — delta > 10%
    })
    const tree = makeTree([parent, child], 'parent')
    const result = propagateUp(tree, 'child')
    expect(result.updatedTree.nodes['parent']?.status).toBe('affected')
  })

  it('propagateDown marca hijos simulated como stale', () => {
    const parent = makeNode('parent', {
      granularity: 'year',
      childIds: ['child1', 'child2'],
      status: 'simulated'
    })
    const child1 = makeNode('child1', { parentId: 'parent', status: 'simulated' })
    const child2 = makeNode('child2', { parentId: 'parent', status: 'pending' })
    const tree = makeTree([parent, child1, child2], 'parent')
    const result = propagateDown(tree, 'parent')
    expect(result.updatedTree.nodes['child1']?.status).toBe('stale')
    expect(result.updatedTree.nodes['child2']?.status).toBe('pending') // pending no cambia
  })

  it('propagateLateral no toca nodos locked', () => {
    const parent = makeNode('parent', { granularity: 'year', childIds: ['sib1', 'sib2', 'sib3'] })
    const sib1 = makeNode('sib1', { parentId: 'parent', status: 'simulated' })
    const sib2 = makeNode('sib2', { parentId: 'parent', status: 'locked' })
    const sib3 = makeNode('sib3', { parentId: 'parent', status: 'pending' })
    const tree = makeTree([parent, sib1, sib2, sib3], 'parent')
    const result = propagateLateral(tree, 'sib1')
    expect(result.updatedTree.nodes['sib2']?.status).toBe('locked') // locked intacto
    expect(result.updatedTree.nodes['sib3']?.status).not.toBe('locked')
  })

  it('applyCorrections con target:strategy genera SimStrategyPatch sin tocar arbol', () => {
    const node = makeNode('month-1', {
      status: 'simulated',
      findings: [{
        id: 'f-1',
        severity: 'warning',
        message: 'Cobertura insuficiente.',
        nodeId: 'month-1',
        target: 'strategy',
        suggestedFix: 'Extender la fase.'
      }]
    })
    const tree = makeTree([node], 'month-1')
    const strategy = { title: 'Test', summary: '', totalMonths: 6, estimatedWeeklyHours: 10, peakWeeklyHours: 10, phases: [], conflicts: [] }
    const result = applyCorrections(tree, [{ findingId: 'f-1', action: 'apply' }], strategy)
    expect(result.strategyPatches.length).toBe(1)
    expect(result.tree.nodes['month-1']?.status).toBe('simulated') // no cambió
  })

  it('applyCorrections con target:tree marca el nodo como stale', () => {
    const node = makeNode('month-1', {
      status: 'simulated',
      findings: [{
        id: 'f-2',
        severity: 'warning',
        message: 'Pocas horas.',
        nodeId: 'month-1',
        target: 'tree',
        suggestedFix: null
      }]
    })
    const tree = makeTree([node], 'month-1')
    const strategy = { title: 'Test', summary: '', totalMonths: 6, estimatedWeeklyHours: 10, peakWeeklyHours: 10, phases: [], conflicts: [] }
    const result = applyCorrections(tree, [{ findingId: 'f-2', action: 'apply' }], strategy)
    expect(result.tree.nodes['month-1']?.status).toBe('stale')
  })

  it('applyCorrections con action:dismiss no toca nada', () => {
    const node = makeNode('month-1', { status: 'simulated' })
    const tree = makeTree([node], 'month-1')
    const strategy = { title: 'Test', summary: '', totalMonths: 6, estimatedWeeklyHours: 10, peakWeeklyHours: 10, phases: [], conflicts: [] }
    const result = applyCorrections(tree, [{ findingId: 'f-x', action: 'dismiss' }], strategy)
    expect(result.strategyPatches.length).toBe(0)
    expect(result.tree.nodes['month-1']?.status).toBe('simulated')
  })
})
```

### 2.4 `tests/world-agent.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { worldAgentFallback } from '../src/lib/flow/agents/world-agent'
import type { SimNode } from '../src/shared/schemas/simulation-tree'

function makeSimNode(id: string, plannedHours = 40): SimNode {
  return {
    id, parentId: 'year-1', granularity: 'month', label: `Mes ${id}`,
    period: { start: '2026-01-01', end: '2026-02-01' },
    status: 'pending', version: 1, plannedHours, actualHours: null, quality: null,
    disruptions: [], responses: [], findings: [], goalBreakdown: {},
    childIds: [], incomingAdjustments: [], timeSlot: null,
    simulatedAt: null, simulatedWith: null
  }
}

const minimalStrategy = {
  title: 'Test', summary: '', totalMonths: 6, estimatedWeeklyHours: 10, peakWeeklyHours: 10,
  phases: [{ id: 'p1', title: 'Fase 1', summary: '', startMonth: 1, endMonth: 6, goalIds: ['g-1'], hoursPerWeek: 10, milestone: '', metrics: [], isSupportTrack: false }],
  conflicts: []
}

describe('world-agent fallback', () => {
  it('devuelve output determinista para el mismo nodeId', () => {
    const a = worldAgentFallback(makeSimNode('month-1'), minimalStrategy)
    const b = worldAgentFallback(makeSimNode('month-1'), minimalStrategy)
    expect(a.disruptions.length).toBe(b.disruptions.length)
    expect(a.difficultyScore).toBe(b.difficultyScore)
  })

  it('impactHours nunca supera plannedHours', () => {
    for (const id of ['month-1', 'month-2', 'month-3', 'month-4']) {
      const out = worldAgentFallback(makeSimNode(id, 40), minimalStrategy)
      const totalImpact = out.disruptions.reduce((s, d) => s + d.impactHours, 0)
      expect(totalImpact).toBeLessThanOrEqual(40)
    }
  })

  it('disruptions tiene entre 0 y 4 elementos', () => {
    for (const id of ['month-1', 'month-3', 'month-5', 'month-10', 'month-99']) {
      const out = worldAgentFallback(makeSimNode(id), minimalStrategy)
      expect(out.disruptions.length).toBeGreaterThanOrEqual(0)
      expect(out.disruptions.length).toBeLessThanOrEqual(4)
    }
  })

  it('environmentSummary es un string no vacio', () => {
    const out = worldAgentFallback(makeSimNode('month-2'), minimalStrategy)
    expect(out.environmentSummary.length).toBeGreaterThan(0)
  })
})
```

### 2.5 `tests/user-agent.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { userAgentFallback } from '../src/lib/flow/agents/user-agent'
import type { SimNode, SimDisruption } from '../src/shared/schemas/simulation-tree'

function makeSimNode(plannedHours = 40): SimNode {
  return {
    id: 'month-1', parentId: 'year-1', granularity: 'month', label: 'Mes 1',
    period: { start: '2026-01-01', end: '2026-02-01' },
    status: 'pending', version: 1, plannedHours, actualHours: null, quality: null,
    disruptions: [], responses: [], findings: [],
    goalBreakdown: {
      'goal-1': { plannedHours: 20, requiredHours: 30, actualHours: null, status: 'on_track' }
    },
    childIds: [], incomingAdjustments: [], timeSlot: null,
    simulatedAt: null, simulatedWith: null
  }
}

function makeDisruption(impactHours: number): SimDisruption {
  return {
    id: 'd-1', type: 'energy_drop',
    description: 'Disrupcion de prueba.',
    impactHours, affectedGoalIds: []
  }
}

describe('user-agent fallback', () => {
  it('actualHours nunca supera plannedHours', () => {
    const node = makeSimNode(40)
    // Disrupcion pequeña
    const out = userAgentFallback(node, [makeDisruption(5)])
    expect(out.actualHours).toBeLessThanOrEqual(40)
    expect(out.actualHours).toBeGreaterThanOrEqual(0)
  })

  it('con disrupcion que supera plannedHours, actualHours queda en 0', () => {
    const node = makeSimNode(40)
    const out = userAgentFallback(node, [makeDisruption(100)])
    expect(out.actualHours).toBe(0)
  })

  it('sin disrupciones, actualHours = plannedHours', () => {
    const node = makeSimNode(40)
    const out = userAgentFallback(node, [])
    expect(out.actualHours).toBe(40)
    expect(out.qualityScore).toBe(100)
  })

  it('goalBreakdown refleja actualHours proporcional', () => {
    const node = makeSimNode(40)
    const out = userAgentFallback(node, [makeDisruption(20)])
    // 20h de impacto sobre 40h planificadas → 50% de ejecucion
    expect(out.goalBreakdown['goal-1']).toBeDefined()
    expect(out.goalBreakdown['goal-1']!.actualHours).toBeCloseTo(10, 0)
  })

  it('status behind si actualHours < requiredHours (no plannedHours)', () => {
    const node = makeSimNode(40)
    // goal-1 tiene requiredHours=30, plannedHours=20
    // Con 50% de impacto: goalActual=10, que es < requiredHours=30 → behind
    const out = userAgentFallback(node, [makeDisruption(20)])
    expect(out.goalBreakdown['goal-1']?.status).toBe('behind')
  })
})
```

### 2.6 `tests/simulation-orchestrator.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest'
import { runSimulationOrchestrator } from '../src/lib/flow/simulation-orchestrator'
import { initializeSimTree } from '../src/lib/flow/simulation-tree-builder'
import type { FlowTaskProgress } from '../src/shared/types/flow-api'

const minimalStrategy = {
  title: 'Test', summary: '', totalMonths: 3, estimatedWeeklyHours: 10, peakWeeklyHours: 10,
  phases: [{ id: 'p1', title: 'Fase 1', summary: '', startMonth: 1, endMonth: 3, goalIds: ['g-1'], hoursPerWeek: 10, milestone: '', metrics: [], isSupportTrack: false }],
  conflicts: []
}

const minimalRealityCheck = {
  status: 'ok' as const, availableHours: 10, neededHours: 10,
  summary: 'OK', recommendations: [], adjustmentsApplied: []
}

const minimalProfile = {
  participantes: [{
    datosPersonales: { nombre: 'Test', narrativaPersonal: 'Dev', rangoEtario: '25-34', localidad: 'BA' },
    calendario: { horasLibresEstimadas: { diasLaborales: 2, diasDescanso: 4 }, bloqueosSemanales: [], eventosProximos: [], diasNoDisponibles: [] },
    patronesEnergia: { cronotipo: 'intermedio' as const, nivelEnergiaTipico: 'medio' as const, tendencias: [] },
    problemasActuales: [],
    motivacion: { nivelGeneral: 7, tendencias: [] }
  }]
}

const minimalGoals = [{
  id: 'g-1', text: 'Objetivo test', category: 'carrera' as const, effort: 'medio' as const,
  horizonMonths: 3, hoursPerWeek: 10, priority: 1, isHabit: false, needsClarification: false
}]

describe('simulation-orchestrator', () => {
  it('corre con runtime=null usando fallbacks y emite progress events', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    try {
      const tree = initializeSimTree({
        workflowId: 'wf-test',
        strategy: minimalStrategy,
        realityCheck: minimalRealityCheck,
        profile: minimalProfile,
        goals: minimalGoals
      })

      const monthNodes = Object.values(tree.nodes).filter(n => n.granularity === 'month')
      const targetNodeIds = monthNodes.map(n => n.id)

      const progressEvents: FlowTaskProgress[] = []

      const result = await runSimulationOrchestrator({
        runtime: null,
        traceId: null,
        tree,
        targetNodeIds,
        strategy: minimalStrategy,
        realityCheck: minimalRealityCheck,
        profile: minimalProfile,
        goals: minimalGoals,
        workflowId: 'wf-test',
        onProgress: (p) => progressEvents.push(p)
      })

      // Debe retornar nodos simulados
      expect(result.simulatedNodes.length).toBe(targetNodeIds.length)

      // Todos los nodos simulados tienen status 'simulated'
      result.simulatedNodes.forEach(n => expect(n.status).toBe('simulated'))

      // simulatedWith = 'rules' cuando runtime es null
      result.simulatedNodes.forEach(n => expect(n.simulatedWith).toBe('rules'))

      // Debe haber emitido al menos un progress event
      expect(progressEvents.length).toBeGreaterThan(0)

      // El ultimo progress event debe ser 'complete'
      const lastProgress = progressEvents[progressEvents.length - 1]
      expect(lastProgress?.stage).toBe('complete')
    } finally {
      vi.useRealTimers()
    }
  })

  it('totalLlmCalls es 0 cuando runtime es null', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    try {
      const tree = initializeSimTree({
        workflowId: 'wf-test',
        strategy: minimalStrategy,
        realityCheck: minimalRealityCheck,
        profile: minimalProfile,
        goals: minimalGoals
      })

      const monthNodes = Object.values(tree.nodes).filter(n => n.granularity === 'month')

      const result = await runSimulationOrchestrator({
        runtime: null,
        traceId: null,
        tree,
        targetNodeIds: monthNodes.map(n => n.id),
        strategy: minimalStrategy,
        realityCheck: minimalRealityCheck,
        profile: minimalProfile,
        goals: minimalGoals,
        workflowId: 'wf-test',
        onProgress: () => {}
      })

      expect(result.totalLlmCalls).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('tree version se incrementa despues de la simulacion', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    try {
      const tree = initializeSimTree({
        workflowId: 'wf-test',
        strategy: minimalStrategy,
        realityCheck: minimalRealityCheck,
        profile: minimalProfile,
        goals: minimalGoals
      })

      const monthNodes = Object.values(tree.nodes).filter(n => n.granularity === 'month')

      const result = await runSimulationOrchestrator({
        runtime: null,
        traceId: null,
        tree,
        targetNodeIds: monthNodes.slice(0, 1).map(n => n.id),
        strategy: minimalStrategy,
        realityCheck: minimalRealityCheck,
        profile: minimalProfile,
        goals: minimalGoals,
        workflowId: 'wf-test',
        onProgress: () => {}
      })

      expect(result.tree.version).toBeGreaterThan(tree.version)
    } finally {
      vi.useRealTimers()
    }
  })
})
```

### 2.7 Tests G1-G4 en `tests/flow-engine.test.ts`

Agregar al final del `describe('flow engine', ...)` existente:

```ts
  it('G1: emigrar y conseguir trabajo remoto se clasifican como esfuerzo alto', () => {
    const goals = analyzeObjectives([
      'Emigrar a Europa',
      'Conseguir trabajo remoto en Canada',
      'Obtener visa de trabajo en Australia'
    ])
    expect(goals[0]?.effort).toBe('alto')
    expect(goals[1]?.effort).toBe('alto')
    expect(goals[2]?.effort).toBe('alto')
  })

  it('G2: meta de salud con muchas horas NO es support track', () => {
    const goals = analyzeObjectives(['Correr una maraton'])
    // correr una maraton: salud, alto esfuerzo → hoursPerWeek > 3 → NO support track
    const profile = buildProfileFromFlow(goals, {
      horasLibresLaborales: '2',
      horasLibresFinde: '4',
      bloqueosSemanales: '',
      eventosProximos: '',
      diasNoDisponibles: '',
      energiaMañana: 'media',
      energiaTarde: 'alta',
      energiaNoche: 'baja',
      nivelEnergiaTipico: 'medio',
      estadoAnimo: 'motivado'
    })
    const strategy = buildStrategicPlanRefined(goals, profile)
    // Si es support track, seria una fase muy corta
    // Si NO es support track, tendra duration = horizonMonths
    const mainPhase = strategy.phases.find(p => p.goalIds.includes(goals[0]!.id) && !p.isSupportTrack)
    expect(mainPhase).toBeDefined()
  })

  it('G3: goal principal tiene duration = horizonMonths en la fase', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const goals = analyzeObjectives(['Sacar el titulo universitario en 18 meses'])
      expect(goals[0]?.horizonMonths).toBe(18)
      const profile = buildProfileFromFlow(goals, {
        horasLibresLaborales: '3',
        horasLibresFinde: '6',
        bloqueosSemanales: '',
        eventosProximos: '',
        diasNoDisponibles: '',
        energiaMañana: 'alta',
        energiaTarde: 'media',
        energiaNoche: 'baja',
        nivelEnergiaTipico: 'medio',
        estadoAnimo: 'motivado'
      })
      const strategy = buildStrategicPlanRefined(goals, profile)
      // La duracion total del plan debe ser al menos el horizonMonths del goal
      expect(strategy.totalMonths).toBeGreaterThanOrEqual(18)
    } finally {
      vi.useRealTimers()
    }
  })

  it('G4: runStrategicSimulation detecta goals con <70% cobertura temporal', () => {
    const goals = analyzeObjectives(['Aprender programacion'])
    const profile = buildProfileFromFlow(goals, {
      horasLibresLaborales: '2',
      horasLibresFinde: '4',
      bloqueosSemanales: '',
      eventosProximos: '',
      diasNoDisponibles: '',
      energiaMañana: 'media',
      energiaTarde: 'media',
      energiaNoche: 'baja',
      nivelEnergiaTipico: 'medio',
      estadoAnimo: 'motivado'
    })
    const strategy = buildStrategicPlanRefined(goals, profile)
    const realityCheck = resolveRealityCheck(strategy, profile)
    // Crear un goal con cobertura parcial artificialmente
    const goalsWithPoor = [{ ...goals[0]!, horizonMonths: 12 }]
    const result = runStrategicSimulation(strategy, realityCheck, goalsWithPoor)
    // No debe tirar. El resultado debe ser valido.
    expect(result.finalStatus).toBeDefined()
    expect(['PASS', 'WARN', 'FAIL', 'MISSING'].includes(result.finalStatus)).toBe(true)
  })
```

**Verificación tarea 2:** `npm test` → todos los tests deben pasar (aprox. 300+).

---

## Tarea 3 — UI en FlowPageContent

El paso `simulation` en `components/FlowPageContent.tsx` ya muestra la simulación plana.
Hay que **agregar debajo** del bloque existente un panel de árbol de simulación.

### 3.1 Qué construir

Un panel colapsable "Simulación detallada" que aparece cuando `session.state.simulationTreeId` no es null.

**Flujo de usuario:**
1. Usuario ya corrió la simulación plana (botón existente).
2. Si `simulationTreeId` no es null, aparece el panel árbol debajo.
3. El panel muestra los nodos mes del árbol con su estado.
4. Botón "Simular todo" llama a `flowClient.simulateRange()` con SSE progress.
5. Cada nodo mes tiene botón "Simular" (individual) y "Bloquear/Desbloquear".
6. Nodos simulados muestran: horas reales, quality score, disrupciones, findings.
7. Progress durante simulación muestra el agentRole en lenguaje no técnico.

### 3.2 Estado local nuevo

En `FlowPageContent.tsx`, agregar junto a los otros `useState`:

```ts
const [simTree, setSimTree] = useState<SimTree | null>(null)
const [simTreeLoading, setSimTreeLoading] = useState(false)
```

Importar tipos:
```ts
import type { SimTree, SimNode } from '../src/shared/schemas/simulation-tree'
```

Cargar el árbol cuando `simulationTreeId` cambia:

```ts
useEffect(() => {
  const treeId = session?.state.simulationTreeId
  if (!treeId || !workflowId) return
  setSimTreeLoading(true)
  flowClient.initializeSimTree(workflowId)
    .then(result => { if (result.tree) setSimTree(result.tree) })
    .catch(() => {})
    .finally(() => setSimTreeLoading(false))
}, [session?.state.simulationTreeId, workflowId])
```

> Nota: `initializeSimTree` es idempotente — si el árbol ya existe en DB, lo retorna sin recrear.

### 3.3 Función `renderSimTree()`

Agregar esta función dentro del componente `FlowPageContent`, antes del `return`:

```ts
function renderSimTree() {
  if (!simTree && !simTreeLoading) return null

  const monthNodes = simTree
    ? Object.values(simTree.nodes).filter(n => n.granularity === 'month').sort((a, b) => a.period.start.localeCompare(b.period.start))
    : []

  const pendingOrStale = monthNodes.filter(n => n.status !== 'locked' && n.status !== 'simulated')
  const hasUnsimulated = pendingOrStale.length > 0

  async function handleSimulateAll() {
    if (!workflowId || !simTree || busy) return
    setBusy(true)
    try {
      const result = await flowClient.simulateRange(workflowId, { treeVersion: simTree.version }, (progress) => {
        if (progress.step === 'simulation-tree') setNotice(progress.message)
      })
      if (result.tree) setSimTree(result.tree)
    } catch { /* silenciar */ } finally {
      setBusy(false)
      setNotice(null)
    }
  }

  async function handleSimulateNode(nodeId: string) {
    if (!workflowId || !simTree || busy) return
    setBusy(true)
    try {
      const result = await flowClient.simulateNode(workflowId, nodeId, simTree.version, (progress) => {
        if (progress.step === 'simulation-tree') setNotice(progress.message)
      })
      if (result.tree) setSimTree(result.tree)
    } catch { /* silenciar */ } finally {
      setBusy(false)
      setNotice(null)
    }
  }

  async function handleLockNode(nodeId: string) {
    if (!workflowId || !simTree || busy) return
    setBusy(true)
    try {
      const result = await flowClient.lockSimNode(workflowId, nodeId, simTree.version)
      if (result.tree) setSimTree(result.tree)
    } catch { /* silenciar */ } finally {
      setBusy(false)
    }
  }

  function statusLabel(status: SimNode['status']): string {
    return t(`simulation.tree.status.${status}`)
  }

  function statusClass(status: SimNode['status']): string {
    if (status === 'simulated') return styles.statusBadgeOk
    if (status === 'locked') return styles.statusBadge   // neutro
    if (status === 'stale' || status === 'affected') return styles.statusBadgeWarn
    return styles.statusBadge  // pending
  }

  return (
    <div className={styles.summaryBox}>
      <div className={styles.phaseHeader}>
        <strong>{t('simulation.tree.title')}</strong>
        {hasUnsimulated && (
          <button
            className="app-button app-button--primary"
            type="button"
            disabled={busy || simTreeLoading}
            onClick={() => void handleSimulateAll()}
          >
            {t('simulation.tree.action.simulate_all')}
          </button>
        )}
      </div>

      {simTreeLoading && <p className="app-copy">{t('flow.loading')}</p>}

      {simTree?.globalFindings?.map(f => (
        <div key={f.id} className={styles.summaryBox}>
          <span className={styles.statusBadgeFail}>{t(`simulation.tree.severity.${f.severity}`)}</span>
          <span className="app-copy"> {f.message}</span>
          {f.suggestedFix && <p className={styles.inlineHint}>{f.suggestedFix}</p>}
        </div>
      ))}

      <div className={styles.phaseList}>
        {monthNodes.map(node => (
          <article key={node.id} className={styles.phaseCard}>
            <div className={styles.phaseHeader}>
              <strong>{node.label}</strong>
              <span className={`${styles.statusBadge} ${statusClass(node.status)}`}>
                {statusLabel(node.status)}
              </span>
            </div>

            {node.status === 'simulated' && (
              <>
                <div className={styles.blockMeta}>
                  <span className={styles.pill}>{node.actualHours ?? 0}h reales</span>
                  {node.quality != null && (
                    <span className={styles.pill}>{node.quality}% calidad</span>
                  )}
                </div>
                {node.disruptions.length > 0 && (
                  <ul className={styles.helperList}>
                    {node.disruptions.map(d => (
                      <li key={d.id}>{d.description} (−{d.impactHours}h)</li>
                    ))}
                  </ul>
                )}
                {node.findings.length > 0 && (
                  <ul className={styles.flatList}>
                    {node.findings.map(f => (
                      <li key={f.id}>
                        <span className={f.severity === 'critical' ? styles.statusBadgeFail : styles.statusBadgeWarn}>
                          {t(`simulation.tree.severity.${f.severity}`)}
                        </span>
                        {' '}{f.message}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            <div className={styles.buttonRow}>
              {node.status !== 'locked' && node.status !== 'simulated' && (
                <button
                  className="app-button app-button--secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSimulateNode(node.id)}
                >
                  {t('simulation.tree.action.simulate')}
                </button>
              )}
              <button
                className="app-button app-button--ghost"
                type="button"
                disabled={busy}
                onClick={() => void handleLockNode(node.id)}
              >
                {node.status === 'locked'
                  ? t('simulation.tree.action.unlock')
                  : t('simulation.tree.action.lock')}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
```

### 3.4 Insertar en el bloque `simulation`

Dentro del bloque `if (currentStep === 'simulation')`, después del cierre del bloque `{simulation && (...)}` y **antes** del `<div className={styles.buttonRow}>`:

```tsx
{renderSimTree()}
```

### 3.5 i18n — claves que usa la UI

Las claves `simulation.tree.*` ya están en `src/i18n/locales/es-AR.json`. Solo verificar que `flow.loading` exista. Si no existe, agregar:

```json
"loading": "Cargando..."
```

bajo la clave `flow` en `es-AR.json`.

### 3.6 CSS — clase `app-button--ghost`

Verificar si existe en `app/globals.css`. Si no, agregar al bloque de botones:

```css
.app-button--ghost {
  background: transparent;
  color: rgba(19, 31, 51, 0.6);
  border: 1px solid rgba(19, 31, 51, 0.15);
}
.app-button--ghost:hover:not(:disabled) {
  background: rgba(19, 31, 51, 0.05);
  color: rgba(19, 31, 51, 0.85);
}
```

### 3.7 Verificación tarea 3

1. `npm run build` — sin errores TypeScript.
2. `npm test` — todos los tests pasan.
3. Dev server: navegar al paso `simulation` del flow.
4. Después de correr la simulación plana, debe aparecer el panel árbol debajo.
5. El botón "Simular todo" corre los meses y muestra progress en la barra de notice existente.
6. Nodos simulados muestran horas reales, score de calidad y disrupciones.

---

## Checklist final

- [ ] `npx drizzle-kit generate && npx drizzle-kit push` ejecutado
- [ ] `tests/simulation-tree-schema.test.ts` creado y pasando
- [ ] `tests/simulation-tree-builder.test.ts` creado y pasando
- [ ] `tests/simulation-propagation.test.ts` creado y pasando
- [ ] `tests/world-agent.test.ts` creado y pasando
- [ ] `tests/user-agent.test.ts` creado y pasando
- [ ] `tests/simulation-orchestrator.test.ts` creado y pasando
- [ ] Tests G1-G4 agregados a `tests/flow-engine.test.ts` y pasando
- [ ] UI en `FlowPageContent.tsx` — panel árbol en paso `simulation`
- [ ] `npm run build` limpio
- [ ] `npm test` — todos los tests pasan

---

## Notas de implementación

- **No usar `Math.random()`** en código de simulación — usar `seededRandom(node.id)` de `world-agent.ts`.
- **No hardcodear strings de UI** — todos via `t()` de i18n.
- **Zod `.strict()`** en cualquier schema nuevo.
- **Luxon** para fechas, nunca `new Date()` en lógica de negocio.
- El `flowClient` ya tiene todos los métodos necesarios (`simulateRange`, `simulateNode`, `lockSimNode`, `initializeSimTree`).
- El backend ya emite SSE progress con `agentRole: 'mundo' | 'yo' | 'orchestrator'` — la UI puede mostrarlo con `t('simulation.tree.progress.world_agent')` etc. si se quiere granularidad, pero con mostrar `progress.message` alcanza.
- `app-button--ghost` puede no existir en globals.css — verificar antes de asumir.
- La función `renderSimTree()` usa el `setBusy` y `setNotice` ya existentes en el componente — no crear nuevos.
