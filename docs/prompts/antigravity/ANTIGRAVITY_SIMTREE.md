# Prompt para Antigravity — SimTree: Migración, Tests y UI

## Contexto del proyecto

Aplicacion **Next.js 15** (App Router), PostgreSQL con Drizzle ORM, Vitest para tests, CSS Modules. Todos los strings de UI usan `t()` de i18n (`src/i18n/locales/es-AR.json`). Regla critica: **Abuela-proof** — la UI no expone terminos tecnicos como `LLM`, `API`, `Agente`, `Tokens`. Schemas Zod siempre `.strict()`. Fechas con Luxon, nunca `new Date()` en logica de negocio.

---

## Archivos ya implementados — NO modificar salvo donde se indique

| Archivo | Contenido |
|---|---|
| `src/shared/schemas/simulation-tree.ts` | Schemas Zod + tipos: `SimTree`, `SimNode`, `SimFinding`, etc. |
| `src/lib/db/schema.ts` | Tabla `planSimulationTrees` agregada al schema Drizzle |
| `src/lib/db/db-helpers.ts` | `getSimulationTree()`, `upsertSimulationTree()` |
| `src/lib/flow/simulation-tree-builder.ts` | `initializeSimTree()`, `expandNodeChildren()` |
| `src/lib/flow/simulation-propagation.ts` | `propagateUp()`, `propagateDown()`, `propagateLateral()`, `applyCorrections()` |
| `src/lib/flow/agents/world-agent.ts` | `runWorldAgent()`, `worldAgentFallback()` |
| `src/lib/flow/agents/user-agent.ts` | `runUserAgent()`, `userAgentFallback()` |
| `src/lib/flow/agents/llm-json-parser.ts` | `extractFirstJsonObject()` |
| `src/lib/flow/simulation-orchestrator.ts` | `runSimulationOrchestrator()` |
| `app/api/flow/session/[workflowId]/simulation-tree/route.ts` | API con acciones: initialize, expand-node, simulate-node, simulate-range, apply-corrections, lock-node |
| `src/lib/client/flow-client.ts` | Metodos: `initializeSimTree()`, `simulateNode()`, `simulateRange()`, `lockSimNode()`, `applySimCorrections()` |
| `src/i18n/locales/es-AR.json` | Claves bajo `simulation.tree.*` |

---

## Tarea 1 — Migrar la base de datos (hacer primero)

La tabla `plan_simulation_trees` esta definida en schema pero **no existe en la DB todavia**.

```bash
npx drizzle-kit generate
npx drizzle-kit push
```

Verificar: `npm test` debe seguir pasando. Los tests no usan DB real, solo verificar que no haya errores de compilacion.

---

## Tarea 2 — Crear tests

Crear los siguientes 6 archivos en `tests/`. Correr `npm test` despues de cada uno.

---

### `tests/simulation-tree-schema.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  simFindingSchema,
  simNodeSchema,
  simDisruptionSchema,
  simResponseSchema
} from '../src/shared/schemas/simulation-tree'

describe('simulation-tree schemas', () => {
  it('parsea un SimFinding valido', () => {
    const r = simFindingSchema.parse({
      id: 'f-1', severity: 'warning', message: 'Periodo sin cobertura.',
      nodeId: 'month-1', target: 'strategy', suggestedFix: null
    })
    expect(r.severity).toBe('warning')
    expect(r.target).toBe('strategy')
  })

  it('rechaza campo extra (strict)', () => {
    expect(() => simFindingSchema.parse({
      id: 'f-1', severity: 'info', message: 'ok', nodeId: 'month-1', extraField: true
    })).toThrow()
  })

  it('parsea SimNode con defaults', () => {
    const node = simNodeSchema.parse({
      id: 'month-1', parentId: 'year-1', granularity: 'month', label: 'Mes 1',
      period: { start: '2026-01-01', end: '2026-02-01' }, status: 'pending', version: 1,
      plannedHours: 40, actualHours: null, quality: null, disruptions: [], responses: [],
      findings: [], goalBreakdown: {}, childIds: [], incomingAdjustments: [],
      timeSlot: null, simulatedAt: null, simulatedWith: null
    })
    expect(node.granularity).toBe('month')
    expect(node.status).toBe('pending')
  })

  it('rechaza status invalido', () => {
    expect(() => simNodeSchema.parse({
      id: 'x', parentId: null, granularity: 'month', label: 'X',
      period: { start: '2026-01-01', end: '2026-02-01' }, status: 'unknown', version: 1,
      plannedHours: 0, actualHours: null, quality: null, disruptions: [], responses: [],
      findings: [], goalBreakdown: {}, childIds: [], incomingAdjustments: [],
      timeSlot: null, simulatedAt: null, simulatedWith: null
    })).toThrow()
  })

  it('parsea SimDisruption valido', () => {
    const d = simDisruptionSchema.parse({
      id: 'd-1', type: 'energy_drop', description: 'Bajo rendimiento.',
      impactHours: 3, affectedGoalIds: ['g-1']
    })
    expect(d.type).toBe('energy_drop')
  })

  it('parsea SimResponse valido', () => {
    const r = simResponseSchema.parse({
      id: 'r-1', action: 'absorb', description: 'Absorber.', hoursRecovered: 0, tradeoff: null
    })
    expect(r.action).toBe('absorb')
  })
})
```

---

### `tests/simulation-tree-builder.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest'
import { initializeSimTree, expandNodeChildren } from '../src/lib/flow/simulation-tree-builder'

function strategy(months = 6) {
  return {
    title: 'Plan Test', summary: '', totalMonths: months,
    estimatedWeeklyHours: 10, peakWeeklyHours: 10,
    phases: [{ id: 'ph-1', title: 'Fase 1', summary: '', startMonth: 1, endMonth: months,
      goalIds: ['g-1'], hoursPerWeek: 10, milestone: '', metrics: [], isSupportTrack: false }],
    conflicts: []
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
```

---

### `tests/simulation-propagation.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { propagateUp, propagateDown, propagateLateral, applyCorrections } from '../src/lib/flow/simulation-propagation'
import type { SimTree, SimNode } from '../src/shared/schemas/simulation-tree'

function node(id: string, o: Partial<SimNode> = {}): SimNode {
  return {
    id, parentId: null, granularity: 'month', label: id,
    period: { start: '2026-01-01', end: '2026-02-01' },
    status: 'pending', version: 1, plannedHours: 40, actualHours: null, quality: null,
    disruptions: [], responses: [], findings: [], goalBreakdown: {}, childIds: [],
    incomingAdjustments: [], timeSlot: null, simulatedAt: null, simulatedWith: null,
    ...o
  }
}
function tree(nodes: SimNode[], rootId: string): SimTree {
  const m: Record<string, SimNode> = {}
  for (const n of nodes) m[n.id] = n
  return {
    id: 't', workflowId: 'w', rootNodeId: rootId, nodes: m,
    globalFindings: [], totalSimulations: 0, estimatedLlmCostSats: 0,
    version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
  }
}
const s = { title: '', summary: '', totalMonths: 6, estimatedWeeklyHours: 10, peakWeeklyHours: 10, phases: [], conflicts: [] }

describe('simulation-propagation', () => {
  it('propagateUp marca padre como affected si delta >10%', () => {
    const parent = node('p', { granularity: 'year', childIds: ['c'], plannedHours: 100, actualHours: 100, status: 'simulated' })
    const child = node('c', { parentId: 'p', status: 'simulated', plannedHours: 40, actualHours: 20 })
    const r = propagateUp(tree([parent, child], 'p'), 'c')
    expect(r.updatedTree.nodes['p']?.status).toBe('affected')
  })

  it('propagateDown marca hijos simulated como stale, pending intacto', () => {
    const parent = node('p', { granularity: 'year', childIds: ['c1', 'c2'], status: 'simulated' })
    const c1 = node('c1', { parentId: 'p', status: 'simulated' })
    const c2 = node('c2', { parentId: 'p', status: 'pending' })
    const r = propagateDown(tree([parent, c1, c2], 'p'), 'p')
    expect(r.updatedTree.nodes['c1']?.status).toBe('stale')
    expect(r.updatedTree.nodes['c2']?.status).toBe('pending')
  })

  it('propagateLateral no toca nodos locked', () => {
    const parent = node('p', { granularity: 'year', childIds: ['s1', 's2', 's3'] })
    const s1 = node('s1', { parentId: 'p', status: 'simulated' })
    const s2 = node('s2', { parentId: 'p', status: 'locked' })
    const s3 = node('s3', { parentId: 'p', status: 'pending' })
    const r = propagateLateral(tree([parent, s1, s2, s3], 'p'), 's1')
    expect(r.updatedTree.nodes['s2']?.status).toBe('locked')
  })

  it('applyCorrections target:strategy genera patch sin cambiar arbol', () => {
    const n = node('m1', { status: 'simulated', findings: [{ id: 'f1', severity: 'warning', message: 'X', nodeId: 'm1', target: 'strategy', suggestedFix: null }] })
    const r = applyCorrections(tree([n], 'm1'), [{ findingId: 'f1', action: 'apply' }], s)
    expect(r.strategyPatches.length).toBe(1)
    expect(r.tree.nodes['m1']?.status).toBe('simulated')
  })

  it('applyCorrections target:tree marca nodo stale', () => {
    const n = node('m1', { status: 'simulated', findings: [{ id: 'f2', severity: 'warning', message: 'Y', nodeId: 'm1', target: 'tree', suggestedFix: null }] })
    const r = applyCorrections(tree([n], 'm1'), [{ findingId: 'f2', action: 'apply' }], s)
    expect(r.tree.nodes['m1']?.status).toBe('stale')
  })

  it('applyCorrections action:dismiss no toca nada', () => {
    const n = node('m1', { status: 'simulated' })
    const r = applyCorrections(tree([n], 'm1'), [{ findingId: 'f-x', action: 'dismiss' }], s)
    expect(r.strategyPatches.length).toBe(0)
    expect(r.tree.nodes['m1']?.status).toBe('simulated')
  })
})
```

---

### `tests/world-agent.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { worldAgentFallback } from '../src/lib/flow/agents/world-agent'
import type { SimNode } from '../src/shared/schemas/simulation-tree'

function n(id: string, h = 40): SimNode {
  return {
    id, parentId: 'y1', granularity: 'month', label: id,
    period: { start: '2026-01-01', end: '2026-02-01' },
    status: 'pending', version: 1, plannedHours: h, actualHours: null, quality: null,
    disruptions: [], responses: [], findings: [], goalBreakdown: {}, childIds: [],
    incomingAdjustments: [], timeSlot: null, simulatedAt: null, simulatedWith: null
  }
}
const s = {
  title: '', summary: '', totalMonths: 6, estimatedWeeklyHours: 10, peakWeeklyHours: 10,
  phases: [{ id: 'p1', title: 'F', summary: '', startMonth: 1, endMonth: 6, goalIds: ['g1'], hoursPerWeek: 10, milestone: '', metrics: [], isSupportTrack: false }],
  conflicts: []
}

describe('world-agent fallback', () => {
  it('es determinista para el mismo nodeId', () => {
    const a = worldAgentFallback(n('month-1'), s)
    const b = worldAgentFallback(n('month-1'), s)
    expect(a.disruptions.length).toBe(b.disruptions.length)
    expect(a.difficultyScore).toBe(b.difficultyScore)
  })

  it('impactHours total nunca supera plannedHours', () => {
    for (const id of ['month-1', 'month-2', 'month-7', 'month-99']) {
      const out = worldAgentFallback(n(id, 40), s)
      const total = out.disruptions.reduce((acc, d) => acc + d.impactHours, 0)
      expect(total).toBeLessThanOrEqual(40)
    }
  })

  it('entre 0 y 4 disrupciones', () => {
    for (const id of ['month-1', 'month-3', 'month-5', 'month-10']) {
      const out = worldAgentFallback(n(id), s)
      expect(out.disruptions.length).toBeGreaterThanOrEqual(0)
      expect(out.disruptions.length).toBeLessThanOrEqual(4)
    }
  })

  it('environmentSummary no esta vacio', () => {
    expect(worldAgentFallback(n('month-2'), s).environmentSummary.length).toBeGreaterThan(0)
  })
})
```

---

### `tests/user-agent.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { userAgentFallback } from '../src/lib/flow/agents/user-agent'
import type { SimNode, SimDisruption } from '../src/shared/schemas/simulation-tree'

function n(h = 40): SimNode {
  return {
    id: 'month-1', parentId: 'y1', granularity: 'month', label: 'Mes 1',
    period: { start: '2026-01-01', end: '2026-02-01' },
    status: 'pending', version: 1, plannedHours: h, actualHours: null, quality: null,
    disruptions: [], responses: [], findings: [],
    goalBreakdown: { 'g1': { plannedHours: 20, requiredHours: 30, actualHours: null, status: 'on_track' } },
    childIds: [], incomingAdjustments: [], timeSlot: null, simulatedAt: null, simulatedWith: null
  }
}
function dis(h: number): SimDisruption {
  return { id: 'd1', type: 'energy_drop', description: 'Test', impactHours: h, affectedGoalIds: [] }
}

describe('user-agent fallback', () => {
  it('actualHours <= plannedHours', () => {
    expect(userAgentFallback(n(40), [dis(5)]).actualHours).toBeLessThanOrEqual(40)
  })

  it('disrupcion masiva → actualHours = 0', () => {
    expect(userAgentFallback(n(40), [dis(100)]).actualHours).toBe(0)
  })

  it('sin disrupciones → actualHours = plannedHours y calidad = 100', () => {
    const r = userAgentFallback(n(40), [])
    expect(r.actualHours).toBe(40)
    expect(r.qualityScore).toBe(100)
  })

  it('goalBreakdown refleja impacto proporcional', () => {
    const r = userAgentFallback(n(40), [dis(20)])
    expect(r.goalBreakdown['g1']?.actualHours).toBeCloseTo(10, 0)
  })

  it('status behind si actualHours < requiredHours', () => {
    expect(userAgentFallback(n(40), [dis(20)]).goalBreakdown['g1']?.status).toBe('behind')
  })
})
```

---

### `tests/simulation-orchestrator.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest'
import { runSimulationOrchestrator } from '../src/lib/flow/simulation-orchestrator'
import { initializeSimTree } from '../src/lib/flow/simulation-tree-builder'

const s = {
  title: 'T', summary: '', totalMonths: 3, estimatedWeeklyHours: 10, peakWeeklyHours: 10,
  phases: [{ id: 'p1', title: 'F', summary: '', startMonth: 1, endMonth: 3, goalIds: ['g1'], hoursPerWeek: 10, milestone: '', metrics: [], isSupportTrack: false }],
  conflicts: []
}
const rc = { status: 'ok' as const, availableHours: 10, neededHours: 10, summary: 'OK', recommendations: [], adjustmentsApplied: [] }
const p = {
  participantes: [{
    datosPersonales: { nombre: 'T', narrativaPersonal: 'D', rangoEtario: '25-34', localidad: 'BA' },
    calendario: { horasLibresEstimadas: { diasLaborales: 2, diasDescanso: 4 }, bloqueosSemanales: [], eventosProximos: [], diasNoDisponibles: [] },
    patronesEnergia: { cronotipo: 'intermedio' as const, nivelEnergiaTipico: 'medio' as const, tendencias: [] },
    problemasActuales: [],
    motivacion: { nivelGeneral: 7, tendencias: [] }
  }]
}
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
```

---

## Tarea 3 — UI en FlowPageContent

**Archivo a modificar:** `components/FlowPageContent.tsx`

### 3.1 Importaciones a agregar

```ts
import type { SimTree, SimNode } from '../src/shared/schemas/simulation-tree'
```

### 3.2 Estado local nuevo (junto a los otros useState)

```ts
const [simTree, setSimTree] = useState<SimTree | null>(null)
const [simTreeLoading, setSimTreeLoading] = useState(false)
```

### 3.3 useEffect para cargar el arbol (junto a los otros useEffect)

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

> `initializeSimTree` es idempotente: si el arbol ya existe lo retorna sin recrearlo.

### 3.4 Funcion `renderSimTree()` — agregar antes del return principal del componente

```tsx
function renderSimTree() {
  if (!simTree && !simTreeLoading) return null

  const monthNodes = simTree
    ? Object.values(simTree.nodes)
        .filter(n => n.granularity === 'month')
        .sort((a, b) => a.period.start.localeCompare(b.period.start))
    : []

  const hasUnsimulated = monthNodes.some(
    n => n.status !== 'locked' && n.status !== 'simulated'
  )

  async function handleSimulateAll() {
    if (!workflowId || !simTree || busy) return
    setBusy(true)
    try {
      const result = await flowClient.simulateRange(
        workflowId,
        { treeVersion: simTree.version },
        (p) => { if (p.step === 'simulation-tree') setNotice(p.message) }
      )
      if (result.tree) setSimTree(result.tree)
    } catch { /* silenciar */ } finally { setBusy(false); setNotice(null) }
  }

  async function handleSimulateNode(nodeId: string) {
    if (!workflowId || !simTree || busy) return
    setBusy(true)
    try {
      const result = await flowClient.simulateNode(
        workflowId, nodeId, simTree.version,
        (p) => { if (p.step === 'simulation-tree') setNotice(p.message) }
      )
      if (result.tree) setSimTree(result.tree)
    } catch { /* silenciar */ } finally { setBusy(false); setNotice(null) }
  }

  async function handleLockNode(nodeId: string) {
    if (!workflowId || !simTree || busy) return
    setBusy(true)
    try {
      const result = await flowClient.lockSimNode(workflowId, nodeId, simTree.version)
      if (result.tree) setSimTree(result.tree)
    } catch { /* silenciar */ } finally { setBusy(false) }
  }

  function statusBadgeClass(status: SimNode['status']) {
    if (status === 'simulated') return styles.statusBadgeOk
    if (status === 'stale' || status === 'affected') return styles.statusBadgeWarn
    return styles.statusBadge
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

      {simTree?.globalFindings?.filter(f => f.severity === 'critical').map(f => (
        <div key={f.id} className={styles.summaryBox}>
          <p className="app-copy">
            <span className={styles.statusBadgeFail}>{t('simulation.tree.severity.critical')}</span>
            {' '}{f.message}
          </p>
          {f.suggestedFix && <p className={styles.inlineHint}>{f.suggestedFix}</p>}
        </div>
      ))}

      <div className={styles.phaseList}>
        {monthNodes.map(node => (
          <article key={node.id} className={styles.phaseCard}>
            <div className={styles.phaseHeader}>
              <strong>{node.label}</strong>
              <span className={`${styles.statusBadge} ${statusBadgeClass(node.status)}`}>
                {t(`simulation.tree.status.${node.status}`)}
              </span>
            </div>

            {node.status === 'simulated' && (
              <>
                <div className={styles.blockMeta}>
                  <span className={styles.pill}>{node.actualHours ?? 0}h</span>
                  {node.quality != null && (
                    <span className={styles.pill}>{node.quality}% {t('simulation.tree.quality')}</span>
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
                        <span className={
                          f.severity === 'critical' ? styles.statusBadgeFail : styles.statusBadgeWarn
                        }>
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

### 3.5 Insertar en el JSX del paso `simulation`

Dentro del bloque `if (currentStep === 'simulation')`, agregar `{renderSimTree()}` **despues** del cierre de `{simulation && (...)}` y **antes** del `<div className={styles.buttonRow}>` final.

### 3.6 Verificar claves i18n en `src/i18n/locales/es-AR.json`

Confirmar que existen estas claves bajo `simulation.tree`. Si no existen, agregarlas:

```json
"tree": {
  "title": "Simulacion por periodos",
  "quality": "calidad",
  "action": {
    "simulate_all": "Simular todo",
    "simulate": "Simular",
    "lock": "Bloquear",
    "unlock": "Desbloquear"
  },
  "status": {
    "pending": "Pendiente",
    "simulated": "Simulado",
    "stale": "Desactualizado",
    "affected": "Afectado",
    "locked": "Bloqueado"
  },
  "severity": {
    "critical": "Critico",
    "warning": "Aviso",
    "info": "Info"
  }
}
```

Si la clave `flow.loading` no existe, agregar `"loading": "Cargando..."` bajo `flow`.

### 3.7 Verificar clase CSS `app-button--ghost` en `app/globals.css`

Si no existe, agregar al bloque de botones:

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

---

## Verificacion final

```bash
npm run build   # sin errores TypeScript
npm test        # todos los tests pasan
```

**Orden recomendado:** Tarea 1 → Tarea 2 → `npm test` → Tarea 3 → `npm run build` → `npm test`.

---

## Checklist

- [ ] `npx drizzle-kit generate && npx drizzle-kit push`
- [ ] `tests/simulation-tree-schema.test.ts` creado y pasando
- [ ] `tests/simulation-tree-builder.test.ts` creado y pasando
- [ ] `tests/simulation-propagation.test.ts` creado y pasando
- [ ] `tests/world-agent.test.ts` creado y pasando
- [ ] `tests/user-agent.test.ts` creado y pasando
- [ ] `tests/simulation-orchestrator.test.ts` creado y pasando
- [ ] `renderSimTree()` agregada a `FlowPageContent.tsx`
- [ ] Claves i18n verificadas/agregadas
- [ ] `app-button--ghost` verificado/agregado en globals.css
- [ ] `npm run build` limpio
- [ ] `npm test` — todos los tests pasan
