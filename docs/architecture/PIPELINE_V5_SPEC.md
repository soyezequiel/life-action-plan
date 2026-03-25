# LAP Pipeline v5 — Especificación Definitiva

> **Status**: Source of truth para la arquitectura del pipeline de planificación.
> **Supersede**: Todos los documentos v2/v3/v4.x de investigación en artifacts.
> **Fecha**: 2026-03-25

---

## 1. Qué es el Pipeline v5

El pipeline toma **objetivos de vida** de un usuario y produce un **plan adaptativo ejecutable**. No es un generador de calendarios: es un sistema que clasifica objetivos, genera estrategia, compila a ítems accionables, los valida, y se adapta durante la ejecución.

### Diferencia fundamental con v1 (actual)

| | v1 (actual) | v5 (target) |
|-|------------|-------------|
| Input | "Quiero tocar guitarra" | Cualquier objetivo de vida |
| Clasificación | No existe (todo = bloque de tiempo) | 7 tipos de objetivo → motor de plan diferente |
| Builder | LLM genera `PlanEvent[]` con día/hora | LLM genera estrategia; **solver** coloca eventos |
| Output | `PlanEvent[]` (calendario) | `PlanItem[]` polimórfico (5 kinds) |
| Validación | Simulador determinístico | CoVe (Chain-of-Verification) + hard/soft validators |
| Reparación | LLM regenera plan completo | Patch ops atómicos con commit/revert |
| Adaptación | Reactiva (completion < 60%) | Proactiva (predicción de riesgo + 3 modos) |
| Plan | 12 semanas monolíticas | 3 capas: esqueleto / detalle / operacional |

---

## 2. Modelo de Datos Core

### 2.1 Taxonomía de Objetivos

```typescript
export type GoalType =
  | 'RECURRENT_HABIT'              // "meditar 10min/día"
  | 'SKILL_ACQUISITION'            // "aprender guitarra"
  | 'FINITE_PROJECT'               // "armar portfolio"
  | 'QUANT_TARGET_TRACKING'        // "ahorrar $5000"
  | 'IDENTITY_EXPLORATION'         // "encontrar mi vocación"
  | 'RELATIONAL_EMOTIONAL'         // "mejorar relación con mi viejo"
  | 'HIGH_UNCERTAINTY_TRANSFORM'   // "mudarme a España"

export type GoalDomainRisk = 'LOW' | 'MEDIUM' | 'HIGH_HEALTH' | 'HIGH_FINANCE' | 'HIGH_LEGAL'

// Señales extraíbles automáticamente (regex + LLM corto ~200 tokens)
export interface GoalSignals {
  isRecurring: boolean
  hasDeliverable: boolean
  hasNumericTarget: boolean
  requiresSkillProgression: boolean
  dependsOnThirdParties: boolean
  isOpenEnded: boolean
  isRelational: boolean
}

export interface GoalClassification {
  goalType: GoalType
  confidence: number                // 0..1
  risk: GoalDomainRisk
  extractedSignals: GoalSignals
}
```

### 2.2 PlanItem — Output polimórfico del pipeline

**Principio**: El calendario es una **vista**, no la fuente de verdad. La fuente de verdad son los `PlanItem[]`.

```typescript
export type PlanItemKind = 'time_event' | 'flex_task' | 'milestone' | 'metric' | 'trigger_rule'
export type PlanItemStatus = 'draft' | 'active' | 'done' | 'canceled' | 'blocked' | 'waiting'

// ─── Base ─────────────────────────────────────────────────────────────────
interface PlanItemBase {
  id: string
  kind: PlanItemKind
  title: string                      // es-AR, abuela-proof
  notes?: string
  status: PlanItemStatus
  goalIds: string[]                  // a qué objetivo(s) pertenece
  projectId?: string
  priority?: 1 | 2 | 3 | 4
  createdAt: string                  // ISO datetime
  updatedAt: string
}

// ─── TimeEvent: compromiso fijo en el tiempo ──────────────────────────────
interface TimeEventItem extends PlanItemBase {
  kind: 'time_event'
  startAt: string                    // ISO datetime
  durationMin: number
  recurrence?: { freq: 'daily' | 'weekly' | 'monthly'; interval?: number; byWeekday?: string[]; until?: string }
  rigidity: 'hard' | 'soft'
}

// ─── FlexTask: trabajo sin horario fijo ───────────────────────────────────
interface FlexTaskItem extends PlanItemBase {
  kind: 'flex_task'
  estimateMin?: number
  dueDate?: string                   // ISO date
  deadlineAt?: string                // ISO datetime (hard cutoff)
  chunking?: { enabled: boolean; minChunkMin: number }
  timeboxed?: Array<{ startAt: string; durationMin: number }>  // proyección al calendario
}

// ─── Milestone: entregable con deadline ───────────────────────────────────
interface MilestoneItem extends PlanItemBase {
  kind: 'milestone'
  dueDate: string
  expectedEffortMin?: number
  dependencies?: Array<{ dependsOnId: string; type: 'finish_to_start' | 'start_to_start' }>
  childItemIds?: string[]
}

// ─── Metric: variable rastreada ───────────────────────────────────────────
interface MetricItem extends PlanItemBase {
  kind: 'metric'
  metricKey: string                  // "savings_usd", "weight_kg"
  unit?: string
  direction: 'increase' | 'decrease' | 'maintain'
  target: { targetValue: number; targetDate?: string }
  cadence?: { freq: 'daily' | 'weekly' | 'monthly'; aggregation: 'sum' | 'count' | 'avg' | 'last' }
  series?: Array<{ at: string; value: number }>
  checkinTemplate?: { title: string; estimateMin?: number }
}

// ─── TriggerRule: regla si-entonces ───────────────────────────────────────
interface TriggerRuleItem extends PlanItemBase {
  kind: 'trigger_rule'
  enabled: boolean
  conditions: Array<{
    left: { type: 'status' | 'metric' | 'date' | 'label'; ref?: string }
    op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'days_since'
    right: { value: string | number | boolean }
  }>
  actions: Array<{ type: 'create_task' | 'update_status' | 'create_time_event'; payload: Record<string, unknown> }>
  throttle?: { minHoursBetweenRuns: number }
}

export type PlanItem = TimeEventItem | FlexTaskItem | MilestoneItem | MetricItem | TriggerRuleItem
```

### 2.3 Domain Knowledge Card

Reemplaza tablas hardcodeadas. Generada dinámicamente via RAG + validación.

```typescript
export type EvidenceGrade = 'A_SYSTEMATIC_REVIEW' | 'B_PEER_REVIEWED' | 'C_INDUSTRY_STANDARD' | 'D_HEURISTIC' | 'E_UNKNOWN'

export interface DomainKnowledgeCard {
  domainLabel: string                // "running", "ahorro", "empleo"
  goalTypeCompatibility: GoalType[]
  tasks: Array<{ id: string; label: string; typicalDurationMin: number; tags: string[] }>
  metrics: Array<{ id: string; label: string; unit: string; direction: 'increase' | 'decrease' }>
  progression?: { levels: Array<{ levelId: string; description: string; exitCriteria: string[] }> }
  constraints: Array<{ id: string; description: string; severity: 'INFO' | 'WARNING' | 'BLOCKER' }>
  sources: Array<{ title: string; evidence: EvidenceGrade }>
  generationMeta: { method: 'RAG' | 'HYBRID' | 'LLM_ONLY'; confidence: number }
}
```

---

## 3. Las 12 Fases del Pipeline

```
Fase 1:  CLASSIFY       → GoalClassification + GoalConstraints        [regex+LLM ~200 tokens]
Fase 2:  REQUIREMENTS    → Preguntas adaptadas al tipo de objetivo     [LLM ~300 tokens]
Fase 3:  PROFILE         → UserProfile con anclas numéricas            [LLM ~500 tokens]
Fase 4:  STRATEGY        → Roadmap por tipo (fases, hitos, rates)      [LLM ~800 tokens]
Fase 5:  TEMPLATE        → WeekTemplateRules polimórficas              [determinístico]
Fase 6:  SCHEDULE        → PlanItem[] via MILP solver                  [determinístico]
Fase 7:  HARD_VALIDATE   → Violaciones duras (overlap, capacidad)      [determinístico]
Fase 8:  SOFT_VALIDATE   → Adherencia, burnout, context switches       [determinístico]
Fase 9:  COVE_VERIFY     → Chain-of-Verification con preguntas         [LLM ~800 tokens]
Fase 10: REPAIR          → Patch ops + commit/revert + escalamiento    [LLM ~500/iter]
Fase 11: PACKAGE         → 3 capas de plan + implementation intentions [determinístico]
Fase 12: ADAPT           → Beta-Bernoulli + risk forecast + adapt      [asíncrono]
```

### Fases que usan LLM (4 de 12)

| Fase | LLM para qué | Tokens est. |
|------|-------------|-------------|
| 1-3 | Clasificar, preguntar, enriquecer perfil | ~1,000 |
| 4 | Generar estrategia creativa (fases, hitos, narrativa) | ~800 |
| 9 | CoVe: preguntas de verificación + respuestas | ~800 |
| 10 | Repair: patch ops cuando el validator falla | ~500/iter |
| **Total** | | **~3,100 + 500/repair** |

### Fases determinísticas (8 de 12)

Estas fases **no usan LLM**. Son código TypeScript puro:
- Template Builder, Scheduler MILP, Hard Validator, Soft Validator, Packager, Adaptive Loop

---

## 4. Scheduler MILP

### Por qué no greedy

El greedy falla con 5+ objetivos y ventanas estrechas. Un solver MILP resuelve en <3s y maneja "no entra todo" como optimización (no como error).

### Implementación

- **Motor**: `highs-js` (HiGHS compilado a WebAssembly) — corre en Node.js/Vercel
- **Discretización**: 30 minutos = 1 slot → 336 slots/semana
- **Time limit**: 3 segundos, devolver mejor solución hallada

### 3 tiers de constraints

```typescript
type ConstraintTier = 'hard' | 'soft_strong' | 'soft_weak'

// hard:        Nunca se viola (no overlap, no durante sueño)
// soft_strong: Se viola solo si no hay alternativa (gym 4×/sem)
// soft_weak:   Se rompe primero (cocinar preferido finde)
```

### Output del scheduler

```typescript
interface SchedulerOutput {
  events: TimeEventItem[]              // colocados en calendario
  unscheduled: Array<{                 // lo que NO entró
    activityId: string
    reason: string
    suggestion_esAR: string            // "¿Podrías hacer gym al mediodía?"
  }>
  tradeoffs?: Array<{                  // opciones Plan A / Plan B
    planA: { description_esAR: string }
    planB: { description_esAR: string }
    question_esAR: string
  }>
  metrics: { fillRate: number; solverTimeMs: number; solverStatus: string }
}
```

---

## 5. Sistema Adaptativo (Rolling Wave)

### 3 capas de plan

| Capa | Horizonte | Granularidad | Se regenera... |
|------|----------|-------------|----------------|
| Esqueleto | 12 semanas | Metas, frecuencias, fases | Rara vez |
| Detalle | 2-4 semanas | Días, actividades, slots | Cada 1-2 semanas |
| Operacional | 7 días | Time-blocks con buffers | Cada semana o ante disrupción |

### HabitState (sobrevive replans)

```typescript
interface HabitState {
  progressionKey: string
  weeksActive: number
  level: number                        // monotónico, nunca se resetea
  currentDose: {
    sessionsPerWeek: number
    minimumViable: { minutes: number; description: string }  // "5min de guitarra"
  }
  protectedFromReset: boolean          // true después de 2+ semanas
}
```

### 3 modos de adaptación

| Modo | Cuándo | Churn |
|------|--------|-------|
| **ABSORB** | Hay slack, risk OK | 0-2 moves |
| **PARTIAL_REPAIR** | Risk alto pero acotado a 1-2 semanas | 3-6 moves |
| **REBASE** | Cambio de objetivo, nuevo trabajo | Alto (controlado) |

### SlackPolicy

```typescript
interface SlackPolicy {
  weeklyTimeBufferMin: number          // 120 (2h sin asignar)
  maxChurnMovesPerWeek: number         // 3
  frozenHorizonDays: number            // 2 (no tocar mañana/pasado)
}
```

---

## 6. Migración desde v1

### Lo que se preserva

- ✅ App Router, API routes, PostgreSQL + Drizzle
- ✅ SSE streaming para operaciones largas
- ✅ Flow Viewer / Inspector LLM
- ✅ Settings, credentials, wallet
- ✅ Tests con Vitest

### Lo que cambia

| Archivo actual | Qué pasa |
|---------------|----------|
| `src/lib/skills/plan-builder.ts` | Se reemplaza por Strategic Roadmap Agent + Template Builder + Scheduler |
| `src/lib/skills/plan-simulator.ts` | Se reemplaza por Hard Validator + Soft Validator + CoVe Verifier |
| `src/lib/pipeline/phase-io.ts` | Se extiende con las 12 nuevas fases |
| `src/lib/pipeline/contracts.ts` | Se extiende con `GoalClassification`, `PlanItem`, etc. |
| `src/lib/pipeline/runner.ts` | Se refactoriza para 12 fases + repair loop |
| `src/shared/types/lap-api.ts` | `PlanEvent` coexiste con `PlanItem` (migración gradual) |

### Nuevos archivos y directorios

```
src/lib/pipeline/
  v5/
    classify.ts                    # Fase 1: clasificador de objetivos
    requirements.ts                # Fase 2: preguntas adaptadas
    profile.ts                     # Fase 3: enriquecimiento
    strategy.ts                    # Fase 4: roadmap LLM
    template-builder.ts            # Fase 5: reglas polimórficas
    scheduler.ts                   # Fase 6: MILP solver (HiGHS)
    hard-validator.ts              # Fase 7
    soft-validator.ts              # Fase 8
    cove-verifier.ts               # Fase 9: CoVe
    repair-manager.ts              # Fase 10: patch ops
    packager.ts                    # Fase 11: 3 capas
    adaptive.ts                    # Fase 12: feedback loop

src/lib/domain/
  goal-taxonomy.ts                 # GoalType, GoalSignals, clasificador
  plan-item.ts                     # PlanItem types
  domain-knowledge/
    bank.ts                        # DomainKnowledgeCard manager
    cards/                         # Cards estáticas (running, guitarra, idiomas)
    generator.ts                   # Generador dinámico via LLM

src/lib/scheduler/
  milp-model.ts                    # Modelo MILP
  constraint-builder.ts            # 3 tiers
  solver.ts                        # Wrapper de highs-js
  explainer.ts                     # Por qué no entra
```

---

## 7. Plan de Sprints

### Sprint 1: Fundamentos (no rompe v1)
**Scope**: Clasificador + Domain Knowledge + PlanItem types
- Implementar `GoalType`, `GoalSignals`, `GoalClassification`
- Crear clasificador simple (regex + LLM ~200 tokens)
- Definir `PlanItem` union type con los 5 kinds
- Migrar Domain Knowledge hardcodeado a `DomainKnowledgeCard` format
- Tests: clasificar 20 objetivos de ejemplo correctamente
- **Gate**: `npm run typecheck` + `npm run test`

### Sprint 2: Scheduler MILP
**Scope**: Reemplazar builder LLM para colocación de eventos
- Integrar `highs-js` como dependency
- Implementar modelo MILP (slots, constraints, soft penalties)
- Implementar 3 tiers de constraints
- Tests: 2 obj (greedy funciona), 5 obj (greedy falla, MILP resuelve), 7 obj
- **Gate**: `npm run test` + evidencia visible de plan sin overlaps

### Sprint 3: Pipeline 12 fases
**Scope**: Conectar las fases nuevas con el runner
- Refactorizar `runner.ts` para 12 fases
- Implementar Strategic Roadmap Agent (LLM)
- Implementar Template Builder (determinístico)
- Implementar Hard + Soft Validator
- Implementar CoVe Verifier (LLM)
- Implementar Repair Manager con patch ops
- **Gate**: `npm run build` + flow visible en Flow Viewer

### Sprint 4: Robustez
**Scope**: Rolling Wave + HabitState
- Implementar 3 capas de plan
- Implementar SlackPolicy con buffers
- Implementar HabitState persistido
- Implementar Equivalence Classes para swaps
- **Gate**: test de replan parcial preservando habit state

### Sprint 5: Adaptación
**Scope**: Modelo de adherencia + proactividad
- Implementar AdherenceModel (Beta-Bernoulli)
- Implementar Risk Forecast
- Implementar 3 modos de adaptación (ABSORB/REPAIR/REBASE)
- **Gate**: test de predicción de riesgo + adaptación automática

### Sprint 6: UX
**Scope**: Dashboard multi-vista + trade-offs
- Dashboard con vistas: calendario, checklist, tracker, semáforo
- Trade-offs UX abuela-proof (Plan A vs Plan B)
- Explicaciones de conflicto sin jerga
- Psicología del fracaso (lapse ≠ relapse, MVH)
- **Gate**: evidencia visible de todas las vistas + flow completo

---

## 8. Restricciones Técnicas (heredadas de AGENTS.md)

1. **i18n**: no hardcodear strings de UI (es-AR)
2. **Abuela-proof**: no mostrar jerga técnica en la interfaz
3. **PostgreSQL**: no volver a SQLite
4. **Luxon**: no usar `new Date()` para lógica de negocio
5. **Zod `.strict()`**: obligatorio en schemas nuevos
6. **API keys**: solo server-side o encriptadas en DB
7. **No Electron**: cero dependencias desktop
8. **Build gate**: si toca `app/api/`, `src/lib/db/` o contratos → `npm run build`
9. **Costo**: < $0.10 USD por ejecución completa del pipeline
10. **MILP solver**: `highs-js` (WASM) como dependencia — NO microservicio Python

---

## 9. Números Target

| Métrica | v1 actual | v5 target |
|---------|----------|-----------|
| Tipos de objetivo | 1 (hábito) | 7 |
| Fases | 7 | 12 |
| Fases con LLM | 2 | 4 |
| Tokens por ejecución | ~8k | ~3.5k |
| Costo por ejecución | ~$0.01 | ~$0.01-0.02 |
| Garantía de constraints | Débil (LLM) | Fuerte (MILP solver) |
| "No entra todo" | Falla | Trade-offs UX |
| Adaptación | Reactiva | Proactiva (Beta-Bernoulli) |

---

## 10. Documentos de Investigación (referencia, no spec)

Estos documentos contienen la justificación científica de las decisiones. NO son spec — son evidencia de soporte.

| Documento | Tema |
|-----------|------|
| `pipeline_v4_definitive.md` (artifacts) | Scheduler determinístico, CoVe, patch ops |
| `pipeline_v4_1_taxonomy.md` (artifacts) | 7 tipos de objetivo + DomainKnowledgeCard |
| `pipeline_v4_2_planitem.md` (artifacts) | PlanItem polimórfico, lecciones de Motion/Sunsama |
| `pipeline_v4_3_scheduler.md` (artifacts) | MILP solver, explicaciones, heurísticas |
| `pipeline_v4_4_adaptive.md` (artifacts) | Rolling Wave, HabitState, psicología del fracaso |
