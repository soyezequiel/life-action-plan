# Plan de implementación: Simulación jerárquica dual-agent (v2)

Lee `CLAUDE.md` y `AGENTS.md` antes de empezar.
Lee `CODEX_FLOW_FIXES.md` y aplica los fixes del Grupo A-F **antes** de empezar este plan.

**Regla general**: no romper tests existentes. Después de cada grupo, correr `npm test`. Si un test falla porque el comportamiento cambió intencionalmente, actualizar el test.

**Regla de feedback**: toda operación que tarde más de 500ms debe emitir progress via SSE. El usuario NUNCA debe ver una pantalla sin feedback.

**Regla de inspector**: toda llamada LLM debe pasar por `createInstrumentedRuntime` con `traceId` y `spanId` para que el inspector LLM pueda mostrar tokens en tiempo real. Los tokens del inspector NO se mezclan con el SSE de progress — se consumen desde el endpoint `GET /api/debug/traces` por separado.

---

## Arquitectura general

### Antes (actual)
```
runStrategicSimulation() → 3 branches hardcodeados por diferencia de horas
generateSimulationReviewWithAgent() → LLM review cosmético sobre datos fake
```

### Después
```
SimulationOrchestrator (SSE stream)
  ├── Fase 1: Deterministic pre-check (reglas + coverage check, sin LLM)
  ├── Fase 2: Dual-agent simulation por granularidad
  │     ├── AGENTE MUNDO: genera eventos/disrupciones con escala calibrada
  │     └── AGENTE YO: decide cómo reaccionar comparando actual vs required
  ├── Fase 3: Propagación (UP: recálculo numérico sin LLM, DOWN: herencia, LATERAL: solo nodos simulados)
  └── Fase 4: Resumen, findings, y strategy patches si se necesitan
```

Cada fase emite progress SSE y registra spans en el trace collector.

---

## GRUPO 0 — PREREQUISITOS

### 0.1 Aplicar CODEX_FLOW_FIXES.md

Ejecutar todas las tareas A1-F1 de `CODEX_FLOW_FIXES.md` primero.

### 0.2 Fixes adicionales al engine (descubiertos en simulación de usuario)

**Archivo:** `src/lib/flow/engine.ts`

#### 0.2a — inferGoalEffort: agregar triggers de esfuerzo alto

En `inferGoalEffort`, agregar al primer regex de alto:

```ts
if (/(empresa|maraton|mudanza|cambio de carrera|emprendimiento|tesis|...|trabajo remoto|remote work|europa|estados unidos|usa|canada|uk|australia|visa de trabajo|emigrar)/.test(text)) return 'alto'
```

Buscar trabajo en otro continente o tramitar visa es esfuerzo alto.

**Test:** "Conseguir un trabajo remoto en Europa" → 'alto'.

#### 0.2b — isSupportTrackGoal: no tratar toda meta de salud como support

Reemplazar:

```ts
function isSupportTrackGoal(goal: GoalDraft): boolean {
  const text = normalizeComparableText(goal.text)

  return goal.isHabit
    || (goal.category === 'salud' && goal.hoursPerWeek <= 3)
    || /(veces por semana|por semana|rutina|habito|entren)/.test(text)
}
```

"Correr una media maratón" con 8h/week NO es support track. Solo metas de salud livianas (≤3h/week, como "meditar") son support.

**Test:** Goal salud con hoursPerWeek=8 → false. Goal salud con hoursPerWeek=2 → true.

#### 0.2c — buildStrategicPlanRefined: goals principales deben cubrir su horizonte

En el cálculo de `duration` para goals que NO son support track:

```ts
const duration = goal.isHabit
  ? totalMonths
  : supportTrack
    ? Math.max(2, Math.min(goal.horizonMonths, 3))
    : goal.horizonMonths  // ← CAMBIO: cubrir todo el horizonte, no clamp por effort
```

Un goal de carrera con horizonte 9 meses debe tener una fase de 9 meses, no de 3. Las sub-fases internas ya se generan con `buildSingleGoalPhases` cuando hay 1 solo goal; para múltiples goals principales, la fase debe cubrir el horizonte completo.

**Test:** Goal carrera con horizonMonths=9, effort='alto', priority=1 → fase de startMonth=1, endMonth=9 (no 4).

#### 0.2d — runStrategicSimulation: agregar check de cobertura temporal

Después de calcular `worstLoad` y `worstMonth`, agregar:

```ts
// Detectar goals sin cobertura temporal completa
for (const goal of strategy.phases.flatMap(p => p.goalIds).filter((id, i, arr) => arr.indexOf(id) === i)) {
  const coveredMonths = strategy.phases
    .filter(p => p.goalIds.includes(goal))
    .reduce((months, p) => {
      for (let m = p.startMonth; m <= p.endMonth; m++) months.add(m)
      return months
    }, new Set<number>())

  const goalData = goals.find(g => g.id === goal)
  if (goalData && coveredMonths.size < goalData.horizonMonths * 0.7) {
    findings.push(`El objetivo "${clipText(goalData.text, 40)}" tiene cobertura en ${coveredMonths.size} de ${goalData.horizonMonths} meses.`)
    if (finalStatus === 'PASS') finalStatus = 'WARN'
  }
}
```

Pasar `goals` como tercer parámetro a `runStrategicSimulation`:

```ts
export function runStrategicSimulation(
  strategy: StrategicPlanDraft,
  realityCheck: RealityCheckResult,
  goals: GoalDraft[] = []
): StrategicSimulationSnapshot
```

**Test:** Plan con goal de 9 meses pero fase de 3 meses → finding "cobertura en 3 de 9 meses", finalStatus WARN.

Correr `npm test` después de 0.2a-d.

---

## GRUPO 1 — SCHEMAS DE SIMULACIÓN JERÁRQUICA

### 1.1 Crear schema de SimNode

**Archivo nuevo:** `src/shared/schemas/simulation-tree.ts`

```ts
import { z } from 'zod'

// [FIX #24] 'plan' como root virtual para todos los planes
export const simGranularitySchema = z.enum(['plan', 'year', 'month', 'week', 'day', 'hour'])

export const simNodeStatusSchema = z.enum([
  'pending',     // nunca simulado
  'simulated',   // simulado y válido
  'stale',       // padre o hermano cambió, necesita re-sim
  'affected',    // propagación detectó impacto (solo nodos ya simulados)
  'locked'       // usuario confirmó, no tocar por propagación (expandir hijos SÍ se puede)
])

export const simNodeIdSchema = z.string().trim().min(1).max(80)

export const simFindingSchema = z.object({
  id: z.string().trim().min(1),
  severity: z.enum(['critical', 'warning', 'info']),
  message: z.string().trim().min(1).max(300),
  nodeId: simNodeIdSchema,
  // [FIX #17] target indica si la corrección toca solo el árbol o requiere cambio de strategy
  target: z.enum(['tree', 'strategy']).default('tree'),
  suggestedFix: z.string().trim().max(300).nullable().default(null)
}).strict()

export const simDisruptionSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(['schedule_conflict', 'energy_drop', 'external_event', 'dependency_delay', 'motivation_loss', 'health_issue']),
  description: z.string().trim().min(1).max(200),
  impactHours: z.number().min(0).max(168),
  affectedGoalIds: z.array(z.string().trim().min(1)).default([])
}).strict()

export const simResponseSchema = z.object({
  id: z.string().trim().min(1),
  action: z.enum(['reschedule', 'skip', 'reduce', 'swap', 'push_back', 'absorb']),
  description: z.string().trim().min(1).max(200),
  hoursRecovered: z.number().min(0).max(168),
  tradeoff: z.string().trim().max(200).nullable().default(null)
}).strict()

// [FIX #16] Ajustes pendientes de propagación lateral para nodos no simulados
export const simIncomingAdjustmentSchema = z.object({
  fromNodeId: simNodeIdSchema,
  deltaHours: z.number(),
  reason: z.string().trim().max(200)
}).strict()

export const simGoalBreakdownEntrySchema = z.object({
  plannedHours: z.number().min(0),
  // [FIX #8] requiredHours = lo que el goal necesita según horizonte, independiente de fases
  requiredHours: z.number().min(0).default(0),
  actualHours: z.number().min(0).nullable().default(null),
  status: z.enum(['on_track', 'behind', 'ahead', 'blocked', 'skipped']).default('on_track')
}).strict()

export const simNodeSchema = z.object({
  id: simNodeIdSchema,
  parentId: simNodeIdSchema.nullable(),
  granularity: simGranularitySchema,
  label: z.string().trim().min(1).max(100),
  period: z.object({
    start: z.string().trim().min(1),
    end: z.string().trim().min(1)
  }).strict(),
  status: simNodeStatusSchema,
  version: z.number().int().min(1).default(1),
  plannedHours: z.number().min(0).max(10000),
  actualHours: z.number().min(0).max(10000).nullable().default(null),
  quality: z.number().min(0).max(100).nullable().default(null),
  disruptions: z.array(simDisruptionSchema).default([]),
  responses: z.array(simResponseSchema).default([]),
  findings: z.array(simFindingSchema).default([]),
  goalBreakdown: z.record(z.string(), simGoalBreakdownEntrySchema).default({}),
  childIds: z.array(simNodeIdSchema).default([]),
  // [FIX #16] Ajustes pendientes de propagación lateral
  incomingAdjustments: z.array(simIncomingAdjustmentSchema).default([]),
  // [FIX #27] Slot temporal para nodos día/hora
  timeSlot: z.enum(['morning', 'afternoon', 'evening']).nullable().default(null),
  simulatedAt: z.string().trim().min(1).nullable().default(null),
  simulatedWith: z.enum(['rules', 'dual-agent', 'hybrid']).nullable().default(null)
}).strict()

export const simTreeSchema = z.object({
  id: z.string().trim().min(1),
  workflowId: z.string().trim().min(1),
  rootNodeId: simNodeIdSchema,
  nodes: z.record(simNodeIdSchema, simNodeSchema),
  globalFindings: z.array(simFindingSchema).default([]),
  totalSimulations: z.number().int().min(0).default(0),
  estimatedLlmCostSats: z.number().int().min(0).default(0),
  // [FIX #30] Optimistic locking
  version: z.number().int().min(1).default(1),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1)
}).strict()

// [FIX #17] Strategy patch para correcciones que requieren cambio de plan
export const simStrategyPatchSchema = z.object({
  type: z.enum(['extend_phase', 'add_phase', 'reorder_phases', 'adjust_hours']),
  phaseId: z.string().trim().min(1).nullable().default(null),
  goalId: z.string().trim().min(1).nullable().default(null),
  params: z.record(z.string(), z.unknown()).default({})
}).strict()

export type SimGranularity = z.infer<typeof simGranularitySchema>
export type SimNodeStatus = z.infer<typeof simNodeStatusSchema>
export type SimFinding = z.infer<typeof simFindingSchema>
export type SimDisruption = z.infer<typeof simDisruptionSchema>
export type SimResponse = z.infer<typeof simResponseSchema>
export type SimIncomingAdjustment = z.infer<typeof simIncomingAdjustmentSchema>
export type SimGoalBreakdownEntry = z.infer<typeof simGoalBreakdownEntrySchema>
export type SimNode = z.infer<typeof simNodeSchema>
export type SimTree = z.infer<typeof simTreeSchema>
export type SimStrategyPatch = z.infer<typeof simStrategyPatchSchema>
```

**Test:** `tests/simulation-tree-schema.test.ts`
- SimTree parsea correctamente con nodos anidados
- `.strict()` rechaza campos extra
- `simFindingSchema` con target='strategy' parsea
- `simGoalBreakdownEntrySchema` con requiredHours parsea
- `incomingAdjustments` array parsea
- SimNode con timeSlot='morning' parsea
- SimTree con version=1 parsea

---

### 1.2 Tabla separada para SimTree (NO dentro del FlowState)

**Archivo:** `src/lib/db/schema.ts`

[FIX #26] El SimTree NO va dentro del JSONB del workflow state. Va en su propia tabla:

```ts
export const planSimulationTrees = pgTable('plan_simulation_trees', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workflowId: text('workflow_id').notNull().references(() => planWorkflows.id),
  data: jsonb('data').notNull(),  // SimTree JSON
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})
```

**Archivo:** `src/lib/db/db-helpers.ts` — Agregar:

```ts
export async function getSimulationTree(workflowId: string): Promise<SimTree | null>
export async function upsertSimulationTree(workflowId: string, tree: SimTree, expectedVersion: number): Promise<SimTree>
// upsertSimulationTree verifica que version === expectedVersion antes de guardar (optimistic locking)
// Si no coincide, lanza error 'SIM_TREE_VERSION_CONFLICT'
```

**Archivo:** `src/shared/schemas/flow.ts`

Agregar solo el ID de referencia al flowState:

```ts
// Dentro de flowStateSchema, agregar:
simulationTreeId: z.string().trim().min(1).nullable().default(null),
```

NO importar el simTreeSchema completo dentro del flowState.

**Test:** Verificar que `flowStateSchema.parse({})` funciona (simulationTreeId defaults a null).

Correr migration SQL: `npx drizzle-kit generate` y `npx drizzle-kit push`.

---

### 1.3 Tipos de API para simulación jerárquica

**Archivo:** `src/shared/types/flow-api.ts`

Agregar:

```ts
import type { SimGranularity, SimTree, SimNode, SimFinding, SimStrategyPatch } from '../schemas/simulation-tree'

export interface FlowSimulationTreeRequest {
  action: 'initialize' | 'simulate-node' | 'simulate-range' | 'apply-corrections' | 'lock-node' | 'expand-node'
  nodeId?: string
  granularity?: SimGranularity
  rangeStart?: string
  rangeEnd?: string
  corrections?: Array<{ findingId: string; action: 'apply' | 'dismiss' }>
  // [FIX #30] Client envía la versión que tiene para optimistic locking
  treeVersion?: number
}

export interface FlowSimulationTreeResult {
  success: boolean
  session?: FlowSession
  tree?: SimTree
  simulatedNodes?: SimNode[]
  findings?: SimFinding[]
  // [FIX #17] Strategy patches sugeridos por correcciones que tocan el plan
  strategyPatches?: SimStrategyPatch[]
  error?: string
}

export interface FlowSimulationTreeProgress {
  workflowId: string
  step: 'simulation-tree'
  stage: string
  current: number
  total: number
  message: string
  activeNodeId?: string
  agentRole?: 'mundo' | 'yo' | 'orchestrator'
  llmTokensSoFar?: number
  // [FIX #20] Estimación de tiempo restante
  estimatedRemainingMs?: number
}
```

---

## GRUPO 2 — MOTOR DE ÁRBOL DE SIMULACIÓN

### 2.1 Crear el tree builder

**Archivo nuevo:** `src/lib/flow/simulation-tree-builder.ts`

Funciones puras (sin LLM, sin side effects):

```ts
export function initializeSimTree(params: {
  workflowId: string
  strategy: StrategicPlanDraft
  realityCheck: RealityCheckResult
  profile: Perfil
  goals: GoalDraft[]
}): SimTree
```

[FIX #25] Genera solo los nodos esenciales al inicializar:
- 1 nodo raíz con `granularity: 'plan'` [FIX #24]
- N nodos año (1 por cada año del plan, basado en `strategy.totalMonths`)
- M nodos mes (solo los meses activos: de mes 1 a totalMonths)
- **NO crear semanas ni días** al inicializar. Se crean bajo demanda con `expandNodeChildren`.

[FIX #6] Al inicializar, verificar cobertura temporal de cada goal:
```ts
// Para cada goal, verificar que tiene fases cubriendo ≥70% de su horizonte
// Si no, emitir globalFinding con severity 'critical' y target 'strategy'
```

[FIX #8] Cada nodo calcula tanto `plannedHours` (de fases activas) como `requiredHours` (de horizonte del goal):
```ts
// goalBreakdown[goalId].plannedHours = horas de fases activas en este período
// goalBreakdown[goalId].requiredHours = (goal.hoursPerWeek * semanas_en_período)
//   solo si el período cae dentro del horizonte del goal
```

```ts
export function expandNodeChildren(tree: SimTree, nodeId: string, params: {
  strategy: StrategicPlanDraft
  profile: Perfil
  goals: GoalDraft[]
}): SimTree
```

[FIX #12] Usa Luxon para calcular períodos reales:
- Mes → semanas ISO reales dentro del mes (no siempre 4)
- Semana → 7 días reales (lunes a domingo ISO)
- Día → slots basados en AvailabilityGrid del profile [FIX #14]

[FIX #13] Horas de hijos se prorratean por días hábiles reales:
```ts
// Semana que empieza un jueves en un mes = 4 días
// Sus horas = (4/7) * horas_semanales
```

[FIX #27] Para nodos día, asignar `timeSlot` basado en qué slots del AvailabilityGrid están activos ese día.

```ts
export function calculateNodePlannedHours(
  node: SimNode,
  strategy: StrategicPlanDraft,
  goals: GoalDraft[],
  profile: Perfil  // [FIX #14] necesario para distinguir laboral vs fin de semana
): { plannedHours: number; goalBreakdown: SimNode['goalBreakdown'] }
```

[FIX #14] Para granularidad `day`, consultar `horasLibresEstimadas`:
- Lunes-viernes: `diasLaborales` horas
- Sábado-domingo: `diasDescanso` horas

**Test:** `tests/simulation-tree-builder.test.ts`
- Plan de 6 meses → tree con 1 raíz (plan) + 1 año + 6 meses. Sin semanas ni días.
- `expandNodeChildren` de un mes → semanas ISO reales (4 o 5 según el mes)
- `expandNodeChildren` de una semana → 7 días con timeSlot correcto
- Horas de hijos suman las horas del padre (±1h por redondeo)
- Goal con horizonte 9 meses pero fase de 3 meses → globalFinding critical
- Nodo día laboral tiene más horas que fin de semana cuando profile lo indica
- goalBreakdown tiene requiredHours independiente de plannedHours

---

### 2.2 Crear el propagation engine

**Archivo nuevo:** `src/lib/flow/simulation-propagation.ts`

```ts
export type PropagationDirection = 'down' | 'up' | 'lateral'

export interface PropagationResult {
  affectedNodeIds: string[]
  staleNodeIds: string[]
  updatedTree: SimTree
  summary: string
}
```

#### propagateDown

```ts
export function propagateDown(tree: SimTree, nodeId: string): PropagationResult
```

Cuando un nodo padre se simula y sus horas cambian, los hijos heredan la distribución actualizada:
- Hijos en status `simulated` → `stale`
- Hijos en status `locked` → **NO cambian** [FIX #18]
- Hijos en status `pending` → se actualizan sus plannedHours pero siguen `pending`

#### propagateUp — SIN re-simulación LLM

```ts
export function propagateUp(tree: SimTree, nodeId: string): PropagationResult
```

[FIX #11] **NUNCA re-llama a los agentes LLM.** Solo recalcula los números del padre:

```ts
// Sumar actualHours de todos los hijos simulados
// Recalcular quality como promedio ponderado de hijos
// Si el total difiere >10% del planned → padre pasa a 'affected' (NO 'stale')
// El usuario puede elegir re-simular el padre manualmente si quiere
```

El estado `affected` indica "los números cambiaron pero el nodo no necesita re-simulación obligatoria".

#### propagateLateral — solo nodos ya simulados

```ts
export function propagateLateral(tree: SimTree, nodeId: string): PropagationResult
```

[FIX #16] Cuando un nodo se corrige (ej: "mover horas del miércoles al viernes"):
- Hermanos en status `simulated` o `stale` → pasan a `affected`
- Hermanos en status `pending` → **NO cambian de status**, pero reciben un `incomingAdjustment`:
  ```ts
  { fromNodeId: 'miercoles-1', deltaHours: +1, reason: 'Horas movidas desde miércoles' }
  ```
  El agente MUNDO los tendrá en cuenta cuando se simulen.
- Hermanos en status `locked` → **NO cambian**

#### applyCorrections — dos modos

```ts
export function applyCorrections(
  tree: SimTree,
  corrections: Array<{ findingId: string; action: 'apply' | 'dismiss' }>,
  strategy: StrategicPlanDraft
): {
  tree: SimTree
  propagation: PropagationResult
  // [FIX #17] Patches de strategy para correcciones que tocan el plan
  strategyPatches: SimStrategyPatch[]
}
```

[FIX #17] Si un finding tiene `target: 'tree'`, se aplica directamente (redistribuir horas, mover bloques).

Si un finding tiene `target: 'strategy'`, NO se modifica el árbol. Se genera un `SimStrategyPatch` que el frontend puede mostrar como "Este cambio requiere modificar el plan. ¿Querés aplicarlo?". Ejemplos:
- `{ type: 'extend_phase', phaseId: 'phase-goal-1', goalId: 'goal-1', params: { newEndMonth: 9 } }`
- `{ type: 'adjust_hours', goalId: 'goal-2', params: { newHoursPerWeek: 6 } }`

[FIX #28] Antes de aplicar correcciones, guardar snapshot del árbol actual como checkpoint:
```ts
await createPlanWorkflowCheckpoint(workflowId, 'simulation-tree', 'pre-correction-snapshot', {
  treeVersion: tree.version,
  correctionCount: corrections.length
})
```

**Test:** `tests/simulation-propagation.test.ts`
- propagateDown: padre cambia → hijos `simulated` pasan a `stale`, hijos `locked` no cambian
- propagateUp: hijo reporta -2h → padre recalcula totales SIN llamar LLM, padre pasa a `affected`
- propagateLateral: nodo miércoles pierde 2h → nodo viernes (simulated) pasa a `affected`, nodo sábado (pending) recibe incomingAdjustment
- applyCorrections con target='tree' → aplica y propaga
- applyCorrections con target='strategy' → genera patch, NO modifica árbol
- Snapshot se guarda antes de corrección

---

## GRUPO 3 — AGENTES DUALES (MUNDO + YO)

### 3.0 Util compartido de parsing JSON

**Archivo nuevo:** `src/lib/flow/agents/llm-json-parser.ts`

[FIX #29] Extraer funciones de parsing de `src/lib/flow/simulation-agent.ts`:

```ts
export function stripFormatting(content: string): string
export function extractFirstJsonObject(content: string): string
```

Reutilizar en TODOS los agentes: simulation-agent.ts, intake-agent.ts, world-agent.ts, user-agent.ts.

Actualizar los imports en los archivos existentes.

**Test:** Verificar que parsea: JSON puro, JSON con markdown fences, JSON con `<think>` tags, JSON con texto libre antes.

---

### 3.1 Agente MUNDO

**Archivo nuevo:** `src/lib/flow/agents/world-agent.ts`

```ts
export interface WorldAgentInput {
  runtime: AgentRuntime
  node: SimNode
  strategy: StrategicPlanDraft
  profile: Perfil
  realityCheck: RealityCheckResult
  goals: GoalDraft[]
  parentContext?: string
}

export interface WorldAgentOutput {
  disruptions: SimDisruption[]
  environmentSummary: string
  difficultyScore: number  // 1-10
}

export async function runWorldAgent(input: WorldAgentInput): Promise<WorldAgentOutput>
export function worldAgentFallback(node: SimNode, strategy: StrategicPlanDraft): WorldAgentOutput
```

**System prompt del agente MUNDO (actualizado con fixes):**

```
Sos el simulador de entorno de LAP.
Tu trabajo es generar disrupciones REALISTAS para el periodo: {node.label} ({node.period.start} a {node.period.end}).

Contexto del usuario:
- Perfil: {compactProfile}
- Horas planificadas en este periodo: {node.plannedHours}h
- Horas disponibles según reality check: {availableHours}h

[FIX #7] OBJETIVOS ACTIVOS en este periodo (con fases planificadas):
{activeGoalsWithPhases}

OBJETIVOS SIN COBERTURA en este periodo (tienen deadline pero no tienen fase activa):
{uncoveredGoals}
Si hay objetivos sin cobertura, eso PUEDE ser fuente de disrupción: el usuario tiene un deadline pero no está trabajando activamente en eso.

[FIX #9] ESCALA DE REFERENCIA para impactHours:
- Este periodo tiene {node.plannedHours}h planificadas.
- Disrupción ALTA: impacta {15-25%} de esas horas ({highImpactRange}h)
- Disrupción MEDIA: impacta {5-15%} ({medImpactRange}h)
- Disrupción BAJA: impacta {1-5%} ({lowImpactRange}h)
Respetá esta escala. No generes impactos desproporcionados.

REGLAS:
1. Genera entre 0 y 4 disrupciones por periodo.
2. Las disrupciones deben ser PROPORCIONALES a la granularidad:
   - plan: no aplica
   - Año: eventos de vida (cambio de trabajo, mudanza, enfermedad larga)
   - Mes: eventos medianos (vacaciones, deadline laboral, visita familiar)
   - Semana: eventos cotidianos (reunión extra, gripe, día lluvioso, cansancio acumulado)
   - Día: micro-eventos (se cayó internet, reunión se extendió, dolor de cabeza)
   - Hora: interrupciones puntuales (llamada, notificación, pérdida de foco)
3. No inventes catástrofes improbables. Sé realista con el perfil del usuario.
4. Responde SOLO JSON válido.

JSON esperado:
{
  "disruptions": [
    { "id": "d-1", "type": "schedule_conflict|energy_drop|external_event|dependency_delay|motivation_loss|health_issue", "description": "...", "impactHours": N, "affectedGoalIds": ["..."] }
  ],
  "environmentSummary": "resumen de 1 línea del entorno simulado",
  "difficultyScore": N
}
```

**Timeout:** 8 segundos. Si falla o timeout, usar `worldAgentFallback`.

**Fallback determinístico:**

```ts
export function worldAgentFallback(node: SimNode, strategy: StrategicPlanDraft): WorldAgentOutput
```

Usa `seededRandom(node.id)` para reproducibilidad (NO `Math.random()`):

```ts
function seededRandom(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  return Math.abs(hash % 1000) / 1000
}
```

Genera 1-2 disrupciones genéricas proporcionadas a la carga vs disponibilidad.

**Instrumentación:** DEBE usar `createInstrumentedRuntime` con `traceId` y `parentSpanId`. El span se llama `'sim-world-agent'`.

**Test:** `tests/world-agent.test.ts`
- Mock del runtime con JSON válido → verifica parsing correcto
- Timeout → usa fallback determinístico
- JSON inválido del LLM → usa fallback
- Prompt incluye goals activos Y goals sin cobertura
- Prompt incluye escala de referencia correcta
- Fallback con mismo node.id siempre produce mismo resultado (seeded)

---

### 3.2 Agente YO

**Archivo nuevo:** `src/lib/flow/agents/user-agent.ts`

```ts
export interface UserAgentInput {
  runtime: AgentRuntime
  node: SimNode
  disruptions: SimDisruption[]
  strategy: StrategicPlanDraft
  profile: Perfil
  goalPriorities: Array<{ id: string; priority: number }>
}

export interface UserAgentOutput {
  responses: SimResponse[]
  actualHours: number
  qualityScore: number
  goalBreakdown: SimNode['goalBreakdown']
  personalFindings: SimFinding[]
}

export async function runUserAgent(input: UserAgentInput): Promise<UserAgentOutput>
export function userAgentFallback(node: SimNode, disruptions: SimDisruption[]): UserAgentOutput
```

**System prompt del agente YO (actualizado con fixes):**

```
Sos el simulador de decisiones del usuario en LAP.
Representás a una persona real con estas características:
- Perfil: {compactProfile}
- Prioridades: {goalPriorities}

Se presentaron estas disrupciones en el periodo {node.label}:
{disruptionsJson}

Horas planificadas: {node.plannedHours}h

[FIX #8] Desglose por objetivo (planned = horas con fase activa, required = horas que el goal necesita):
{goalBreakdownJsonWithRequired}

Si un objetivo tiene requiredHours > plannedHours, significa que el plan NO le asigna suficiente tiempo.
Eso es un problema del plan, no del usuario. Mencionalo como finding si es significativo.

REGLAS:
1. Decidí cómo responde el usuario a cada disrupción.
2. Las respuestas deben ser COHERENTES con el perfil (ej: si trabaja de 9 a 18, no puede "trabajar de mañana").
3. Calculá las horas reales que el usuario logra cumplir después de las disrupciones.
4. actualHours NUNCA puede ser mayor que plannedHours (no se puede crear tiempo).
5. El quality score refleja qué tan bien salió el período (100 = perfecto, 0 = nada se cumplió).
6. Identificá findings concretos y accionables.
7. Responde SOLO JSON válido.

JSON esperado:
{
  "responses": [...],
  "actualHours": N,
  "qualityScore": N,
  "goalBreakdown": { "goal-id": { "plannedHours": N, "requiredHours": N, "actualHours": N, "status": "on_track|behind|ahead|blocked|skipped" } },
  "personalFindings": [
    { "id": "f-1", "severity": "critical|warning|info", "message": "...", "nodeId": "{node.id}", "target": "tree|strategy", "suggestedFix": "..." }
  ]
}
```

**Timeout:** 8 segundos. Si falla, usar `userAgentFallback`.

**Fallback determinístico:** Distribuye impacto proporcionalmente entre goals, reduce horas linealmente. Compara actual vs required (no vs planned) para determinar status.

**Instrumentación:** `createInstrumentedRuntime` con span `'sim-user-agent'`.

**Test:** `tests/user-agent.test.ts`
- Mock del runtime → respuestas con estructura correcta
- Timeout → fallback determinístico
- actualHours <= plannedHours siempre
- goalBreakdown incluye requiredHours
- Finding con target='strategy' cuando required >> planned

---

### 3.3 Orchestrator de simulación

**Archivo nuevo:** `src/lib/flow/simulation-orchestrator.ts`

```ts
export interface SimulationOrchestratorInput {
  runtime: AgentRuntime | null  // [FIX #23] null = sin LLM, usar fallbacks
  traceId: string | null
  tree: SimTree
  targetNodeIds: string[]
  strategy: StrategicPlanDraft
  realityCheck: RealityCheckResult
  profile: Perfil
  goals: GoalDraft[]
  onProgress: (progress: FlowSimulationTreeProgress) => void
}

export interface SimulationOrchestratorOutput {
  tree: SimTree
  simulatedNodes: SimNode[]
  findings: SimFinding[]
  strategyPatches: SimStrategyPatch[]
  totalLlmCalls: number
  totalTokens: number
}

export async function runSimulationOrchestrator(
  input: SimulationOrchestratorInput
): Promise<SimulationOrchestratorOutput>
```

[FIX #23] Si `runtime` es null (LLM no disponible), usar fallbacks determinísticos directamente. Emitir progress con `message: t('simulation.tree.no_llm_fallback')`.

[FIX #19] Para `simulate-range` con múltiples nodos, paralelizar en batches de 3:

```ts
const BATCH_SIZE = 3
for (let i = 0; i < targetNodeIds.length; i += BATCH_SIZE) {
  const batch = targetNodeIds.slice(i, i + BATCH_SIZE)
  const results = await Promise.allSettled(
    batch.map(nodeId => simulateOneNode(nodeId, ...))
  )
  // Propagar resultados del batch antes de empezar el siguiente
  for (const result of results) {
    if (result.status === 'fulfilled') {
      tree = propagateUp(tree, result.value.nodeId).updatedTree
    }
  }
}
```

[FIX #20] Calcular `estimatedRemainingMs` a partir del segundo nodo:

```ts
const durations: number[] = []
// después de cada nodo:
durations.push(Date.now() - nodeStartTime)
const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length
const remaining = avgMs * (total - current)
onProgress({ ..., estimatedRemainingMs: Math.round(remaining) })
```

Para cada nodo target:
1. Emitir progress: `stage: 'preflight'`, `agentRole: 'orchestrator'`
2. Pre-check determinístico (reglas)
3. Emitir progress: `stage: 'world-agent'`, `agentRole: 'mundo'`
4. Llamar agente MUNDO (o fallback si runtime es null)
5. Emitir progress: `stage: 'user-agent'`, `agentRole: 'yo'`
6. Llamar agente YO (o fallback si runtime es null)
7. Emitir progress: `stage: 'propagation'`, `agentRole: 'orchestrator'`
8. Propagar: `propagateUp` (recálculo numérico, sin LLM)
9. Emitir progress: `stage: 'complete'`, incluir findings count y estimatedRemainingMs

**Inspector LLM:** Cada agente crea un span hijo del trace principal. Los tokens se emiten vía `traceCollector.emitToken()` automáticamente por el instrumented runtime. El frontend del inspector los consume desde `GET /api/debug/traces` — NO se reenvían como progress SSE [FIX #22].

```
Trace: flow-simulation-tree
├── Span: sim-world-agent (nodo: Mes 3) — tokens en vivo via trace endpoint
├── Span: sim-user-agent (nodo: Mes 3)
├── Span: sim-world-agent (nodo: Mes 4)
├── Span: sim-user-agent (nodo: Mes 4)
```

**Test:** `tests/simulation-orchestrator.test.ts`
- Mock de ambos agentes → progress emitido en orden correcto
- runtime=null → usa fallbacks, progress incluye "no_llm_fallback"
- 6 nodos con BATCH_SIZE=3 → 2 batches, propagación entre batches
- estimatedRemainingMs presente a partir del 2do nodo
- Findings de ambos agentes se acumulan
- Strategy patches se recolectan
- 1 span por agente por nodo en el trace

---

## GRUPO 4 — RUTA API + SSE

### 4.1 Crear ruta de simulación jerárquica

**Archivo nuevo:** `app/api/flow/session/[workflowId]/simulation-tree/route.ts`

#### `action: 'initialize'`
- Requiere: strategy, realityCheck en el session state
- Carga profile con `loadWorkflowProfile(session)`
- Llama `initializeSimTree()` con goals del state
- Guarda en tabla `plan_simulation_trees` con `upsertSimulationTree`
- Guarda `simulationTreeId` en el workflow state
- NO usa LLM, responde JSON normal

#### `action: 'expand-node'` (NUEVO)
- Requiere: `nodeId`
- Carga tree de `plan_simulation_trees`
- Llama `expandNodeChildren()` con strategy + profile + goals
- Guarda tree actualizado
- NO usa LLM, responde JSON normal

#### `action: 'simulate-node'`
- Requiere: `nodeId`, `treeVersion`
- [FIX #30] Verifica `treeVersion === tree.version` antes de empezar. Si no, devuelve `SIM_TREE_VERSION_CONFLICT`.
- USA SSE
- [FIX #23] Si no hay LLM disponible, pasa `runtime: null` al orchestrator
- Crea trace: `traceCollector.startTrace('flow-simulation-tree', modelId, { workflowId, nodeId })`
- Llama `runSimulationOrchestrator` con `[nodeId]`
- Incrementa `tree.version` al guardar
- Persiste tree en `plan_simulation_trees`

#### `action: 'simulate-range'`
- Requiere: `granularity`, `rangeStart`, `rangeEnd`, `treeVersion`
- [FIX #30] Verifica versión
- USA SSE
- Selecciona nodos de esa granularidad en el rango
- Simula con orchestrator (batches de 3) [FIX #19]
- Progress incluye `current/total` y `estimatedRemainingMs` [FIX #20]

#### `action: 'apply-corrections'`
- Requiere: `corrections` array, `treeVersion`
- [FIX #28] Guarda checkpoint antes de corregir
- USA SSE
- Llama `applyCorrections()`
- Si hay `strategyPatches`, los devuelve en la respuesta para que el frontend pregunte
- Incrementa `tree.version`

#### `action: 'lock-node'`
- Requiere: `nodeId`
- NO usa LLM, responde JSON normal
- Cambia status a `locked`
- [FIX #18] No impide futuros `expand-node` sobre ese nodo

**Test:** `tests/simulation-tree-route.test.ts`
- POST 'initialize' → tree en DB, simulationTreeId en state
- POST 'expand-node' → hijos creados correctamente
- POST 'simulate-node' → SSE con progress events
- POST 'simulate-node' con treeVersion incorrecto → error SIM_TREE_VERSION_CONFLICT
- POST 'lock-node' → status locked
- POST sin session → 404
- POST sin strategy → FLOW_STRATEGY_REQUIRED

---

### 4.2 Agregar al flow-client

**Archivo:** `src/lib/client/flow-client.ts`

Agregar todos los métodos del client para simulation-tree:

```ts
initializeSimTree(workflowId: string)
expandSimNode(workflowId: string, nodeId: string)
simulateNode(workflowId: string, nodeId: string, treeVersion: number, onProgress?)
simulateRange(workflowId: string, granularity: string, rangeStart: string, rangeEnd: string, treeVersion: number, onProgress?)
applySimCorrections(workflowId: string, corrections: [...], treeVersion: number, onProgress?)
lockSimNode(workflowId: string, nodeId: string)
```

Todos los métodos que usan SSE pasan `treeVersion` en el body [FIX #30].

---

### 4.3 SSE helper — sin cambios funcionales

**Archivo:** `app/api/flow/_sse.ts`

El helper actual ya funciona. `FlowSimulationTreeProgress` tiene los mismos campos base que `FlowTaskProgress` plus campos opcionales extra que se serializan automáticamente. No hace falta cambiar la firma de `sendProgress`.

[FIX #22] NO reenviar tokens del LLM como progress events. Los tokens se consumen desde `GET /api/debug/traces` por separado.

---

## GRUPO 5 — INSPECTOR LLM DURANTE SIMULACIÓN

### 5.1 Verificar endpoint de debug traces

**Verificar** que el endpoint `GET /api/debug/traces` ya existe. Si no, crearlo:

```ts
import { traceCollector } from '../../../../src/debug/trace-collector'

export async function GET(): Promise<Response> {
  return Response.json({
    traces: traceCollector.getSnapshot()
  })
}
```

El `createInstrumentedRuntime` ya maneja todo el tracing automáticamente. Lo que hay que asegurar es que el orchestrator pase los IDs correctos al crear los runtimes de los agentes:

```ts
const worldRuntime = createInstrumentedRuntime(
  runtime.newContext(),
  traceId,
  'sim-world-agent',
  modelId,
  null  // parentSpanId — los spans son hijos directos del trace
)
```

**Test:** `tests/simulation-tracing.test.ts`
- Simular 1 nodo → trace tiene ≥2 spans (mundo + yo)
- `traceCollector.getSnapshot()` devuelve el trace con spans
- Spans tienen skillName correcto ('sim-world-agent', 'sim-user-agent')

---

## GRUPO 6 — INTEGRACIÓN CON FLOW EXISTENTE

### 6.1 Inicializar árbol desde simulación vieja

**Archivo:** `app/api/flow/session/[workflowId]/simulation/route.ts`

Después de guardar la snapshot plana existente, inicializar el árbol:

```ts
const profile = await loadWorkflowProfile(session)
if (profile && nextState.strategy && nextState.realityCheck) {
  const { initializeSimTree } = await import('../../../../../../src/lib/flow/simulation-tree-builder')
  const tree = initializeSimTree({
    workflowId,
    strategy: nextState.strategy,
    realityCheck: nextState.realityCheck,
    profile,
    goals: session.state.goals
  })
  const { upsertSimulationTree } = await import('../../../../../../src/lib/db/db-helpers')
  const saved = await upsertSimulationTree(workflowId, tree, 0) // version 0 = crear nuevo
  nextState = {
    ...nextState,
    simulationTreeId: saved.id
  }
}
```

**No cambiar el flujo existente.** La simulación vieja sigue funcionando. El árbol es un upgrade opcional.

### 6.2 Limpiar árbol en reset/resume

**Archivo:** `app/api/flow/_helpers.ts` → `buildPlanningResetState()`:
- Agregar `simulationTreeId: null`

**Archivo:** `app/api/flow/session/[workflowId]/resume/route.ts`:
- Cuando se invalida strategy, también: `simulationTreeId: null`
- Opcionalmente borrar el tree de la tabla `plan_simulation_trees` (soft delete o dejar huérfano — limpiar con cron).

---

## GRUPO 7 — FALLBACKS DETERMINÍSTICOS

Ya definidos en los archivos de agentes (3.1, 3.2). Verificar que:

1. `worldAgentFallback` usa `seededRandom(node.id)` para reproducibilidad
2. `userAgentFallback` compara actual vs required (no vs planned) para status [FIX #8]
3. Ambos fallbacks producen resultados que pasan validación de schema Zod

**Test:** Ya cubierto en tests de world-agent y user-agent.

---

## GRUPO 8 — i18n

### 8.1 Agregar claves de i18n para simulación

**Archivo:** `src/i18n/locales/es-AR.json`

Agregar bajo la key `"simulation"`:

```json
{
  "simulation": {
    "tree": {
      "initializing": "Armando el árbol de simulación con {nodeCount} períodos.",
      "preflight": "Revisando la base del período {label}.",
      "world_agent": "El entorno está generando situaciones para {label}.",
      "user_agent": "Simulando tus decisiones frente a {disruptionCount} eventos en {label}.",
      "propagation": "Propagando cambios al resto del plan.",
      "saving": "Guardando la simulación de {label}.",
      "node_simulated": "{label} simulado: {quality}% de cumplimiento.",
      "node_locked": "{label} confirmado. No se modificará en futuras corridas.",
      "corrections_applied": "Se aplicaron {count} correcciones. {affected} períodos necesitan re-simulación.",
      "corrections_need_strategy": "Hay {count} correcciones que necesitan cambiar el plan. Revisalas antes de continuar.",
      "finding_critical": "Problema en {label}: {message}",
      "finding_warning": "Atención en {label}: {message}",
      "finding_info": "Nota sobre {label}: {message}",
      "range_start": "Simulando {count} períodos de {granularity} ({start} a {end}).",
      "range_progress": "Período {current} de {total}: {label}.",
      "range_estimated_remaining": "Faltan aproximadamente {seconds} segundos.",
      "cost_estimate": "Costo estimado: {sats} sats (~USD {usd})",
      "no_llm_fallback": "Sin asistente disponible. Usando estimación heurística.",
      "error_timeout": "El agente tardó demasiado. Se usó estimación heurística.",
      "version_conflict": "Alguien más modificó la simulación. Recargá para ver los cambios.",
      "coverage_gap": "El objetivo \"{goal}\" no tiene actividad planificada en {count} meses de su horizonte.",
      "granularity_plan": "Plan completo",
      "granularity_year": "Año",
      "granularity_month": "Mes",
      "granularity_week": "Semana",
      "granularity_day": "Día",
      "granularity_hour": "Hora"
    }
  }
}
```

---

## GRUPO 9 — TESTS DE INTEGRACIÓN

### 9.1 Test end-to-end de simulación

**Archivo:** `tests/simulation-e2e.test.ts`

```ts
describe('Simulation tree end-to-end', () => {
  it('initializes tree from strategy with coverage findings', () => { /* ... */ })
  it('expands month into real ISO weeks', () => { /* ... */ })
  it('expands week into days with correct timeSlots', () => { /* ... */ })
  it('simulates month node with mocked agents', () => { /* ... */ })
  it('propagateUp recalculates parent numbers without LLM', () => { /* ... */ })
  it('propagateDown marks simulated children as stale, locked children unchanged', () => { /* ... */ })
  it('propagateLateral adds incomingAdjustments to pending nodes', () => { /* ... */ })
  it('locked nodes are not affected by propagation', () => { /* ... */ })
  it('applyCorrections with target=strategy generates patches', () => { /* ... */ })
  it('falls back to deterministic when runtime is null', () => { /* ... */ })
  it('emits correct progress events during simulation', () => { /* ... */ })
  it('creates trace spans for each agent call', () => { /* ... */ })
  it('batches of 3 for simulate-range', () => { /* ... */ })
  it('estimatedRemainingMs present from 2nd node', () => { /* ... */ })
  it('version conflict detected on stale tree', () => { /* ... */ })
  it('day node uses profile availability for planned hours', () => { /* ... */ })
  it('goalBreakdown has requiredHours independent of plannedHours', () => { /* ... */ })
  it('checkpoint saved before applying corrections', () => { /* ... */ })
})
```

---

## Orden de ejecución

1. **Grupo 0**: Aplicar CODEX_FLOW_FIXES.md (A1-F1) + fixes 0.2a-d. Correr `npm test`.
2. **Grupo 1**: Schemas + tabla DB (1.1, 1.2, 1.3). Correr migration + `npm test`.
3. **Grupo 2**: Tree builder + propagation (2.1, 2.2). Correr `npm test`.
4. **Grupo 3**: JSON parser util + agentes + orchestrator (3.0, 3.1, 3.2, 3.3). Correr `npm test`.
5. **Grupo 4**: Ruta API + flow-client (4.1, 4.2, 4.3). Correr `npm test`.
6. **Grupo 5**: Inspector LLM (5.1). Correr `npm test`.
7. **Grupo 6**: Integración con flow existente (6.1, 6.2). Correr `npm test`.
8. **Grupo 7**: Verificar fallbacks (ya en grupo 3). Correr `npm test`.
9. **Grupo 8**: i18n. Correr `npm test`.
10. **Grupo 9**: Tests E2E. Correr `npm test`.
11. **Final**: `npm run build` para verificar que todo compila.

---

## Estimación de costo LLM por simulación

Cada nodo con dual-agent = 2 llamadas LLM (~500 tokens input + ~350 tokens output cada una).

| Granularidad | Nodos típicos | Llamadas LLM | Tokens estimados | Costo (gpt-4o-mini) |
|---|---|---|---|---|
| Años (plan 3 años) | 3 | 6 | ~5.1k | ~$0.001 |
| Meses (1 año) | 12 | 24 | ~20.4k | ~$0.005 |
| Semanas (1 mes) | 4-5 | 8-10 | ~7.6k | ~$0.002 |
| Días (1 semana) | 7 | 14 | ~11.9k | ~$0.003 |
| Full year detailed | ~60 | ~120 | ~102k | ~$0.025 |

Con batches de 3 en paralelo, un año completo (60 nodos) tarda ~20 batches * 8s = ~160s worst case, ~80s typical.

---

## Resumen de fixes incorporados

| Fix | Defecto | Dónde se resuelve en el plan |
|---|---|---|
| #1 | Horizonte arbitrario sin fecha | 0.2a (mejora de heurística, no bloquea) |
| #2 | "trabajo remoto Europa" no es effort alto | 0.2a |
| #3 | Goal 9 meses solo recibe fase 3 meses | 0.2c |
| #4 | Toda meta salud es support track | 0.2b |
| #5 | Simulación PASS con gaps temporales | 0.2d |
| #6 | Árbol hereda gaps sin detectar | 2.1 (initializeSimTree) |
| #7 | Agente no sabe goals activos/inactivos | 3.1 (prompt MUNDO) |
| #8 | goalBreakdown sin requiredHours | 1.1 (schema) + 3.2 (prompt YO) |
| #9 | impactHours sin escala de referencia | 3.1 (prompt MUNDO) |
| #11 | propagateUp re-llama LLM | 2.2 (propagateUp sin LLM) |
| #12 | Meses no tienen exactamente 4 semanas | 2.1 (expandNodeChildren con Luxon) |
| #13 | Horas de semanas parciales mal distribuidas | 2.1 (prorrateo por días) |
| #14 | Nodo día no distingue laboral/fin de semana | 2.1 (calculateNodePlannedHours con profile) |
| #16 | Nodos pending no pueden estar affected | 2.2 (incomingAdjustments) + 1.1 (schema) |
| #17 | Correcciones que necesitan cambio de strategy | 2.2 (applyCorrections) + 1.1 (SimStrategyPatch) |
| #18 | Locked + expandir hijos | 4.1 (expand-node no bloqueado por lock) |
| #19 | LLM calls secuenciales lentas | 3.3 (batches de 3) |
| #20 | Sin estimación de tiempo restante | 3.3 + 1.3 (estimatedRemainingMs) |
| #21 | Traces se pierden en hot reload | Inspector UX (no backend) |
| #22 | Tokens mezclados con progress SSE | 3.3 + 4.3 (canales separados) |
| #23 | No hay path para LLM no disponible | 3.3 (runtime: null → fallbacks) |
| #24 | Root sin granularidad para planes cortos | 1.1 (granularity 'plan') |
| #25 | 306 nodos al inicializar | 2.1 (solo root+años+meses) |
| #26 | SimTree enorme en JSONB del state | 1.2 (tabla separada) |
| #27 | Nodo hora sin slot temporal | 1.1 (timeSlot en schema) |
| #28 | No hay undo de correcciones | 2.2 (checkpoint antes de corregir) |
| #29 | extractFirstJsonObject duplicado | 3.0 (util compartido) |
| #30 | Race condition con dos tabs | 1.1 (version en tree) + 4.1 (verificación) |

---

## Prompt para Codex

```
Implementa el plan descrito en CODEX_SIMULATION_PLAN.md (v2).

ANTES de empezar, lee y aplica CODEX_FLOW_FIXES.md (Grupo 0.1) y los fixes 0.2a-d.

Después, sigue el orden de ejecución del plan (Grupos 1-9).

Reglas:
- Lee CLAUDE.md y AGENTS.md primero
- Corre npm test después de cada grupo
- Usa Zod .strict() en todos los schemas nuevos
- Usa luxon para fechas, no new Date()
- Toda string visible al usuario debe usar t() de i18n
- Los prompts internos de los agentes NO necesitan i18n
- Toda llamada LLM debe pasar por createInstrumentedRuntime
- Toda operación >500ms debe emitir SSE progress
- Los tokens del LLM NO se mezclan con el SSE de progress — van por el trace endpoint
- SimTree se guarda en tabla separada plan_simulation_trees, NO dentro del JSONB del workflow state
- propagateUp NUNCA re-llama a agentes LLM — solo recalcula números
- propagateLateral solo cambia status de nodos ya simulados; nodos pending reciben incomingAdjustments
- Correcciones que necesitan cambio de strategy generan SimStrategyPatch, no modifican el árbol
- Antes de aplicar correcciones, guardar checkpoint
- simulate-range paraleliza en batches de 3
- Si no hay LLM disponible (canExecute=false), usar fallbacks determinísticos directamente
- No crear archivos innecesarios
- No modificar tests existentes a menos que el comportamiento cambie intencionalmente
```
