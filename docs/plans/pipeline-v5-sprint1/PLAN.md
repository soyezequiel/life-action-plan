# Pipeline v5 — Sprint 1: Fundamentos

> **Status**: `pending`
> **Spec**: `docs/architecture/PIPELINE_V5_SPEC.md`
> **Scope**: Clasificador de objetivos + Domain Knowledge Cards + PlanItem types
> **NO incluye**: Scheduler MILP, CoVe, adaptación, UI changes

---

## Objetivo

Agregar las capas de datos fundamentales del pipeline v5 SIN romper el pipeline v1.
Todo lo nuevo vive en directorios nuevos (`src/lib/pipeline/v5/`, `src/lib/domain/`).
El pipeline v1 sigue funcionando exactamente igual.

---

## Tareas

### 1. GoalType + GoalSignals + GoalClassification
**Archivo**: `src/lib/domain/goal-taxonomy.ts`

Crear los tipos de la taxonomía de objetivos:
- `GoalType` (7 tipos)
- `GoalSignals` (7 señales booleanas)
- `GoalClassification` (tipo + confianza + riesgo)
- Schemas Zod `.strict()` para cada uno

### 2. Clasificador simple
**Archivo**: `src/lib/pipeline/v5/classify.ts`

Función `classifyGoal(rawText: string): GoalClassification`:
- Paso 1: regex patterns para señales obvias
  - "todos los días" / "diario" / "X veces por semana" → `isRecurring: true`
  - "$", "ahorrar", "kg", "libros" → `hasNumericTarget: true`
  - "aprender", "mejorar en" → `requiresSkillProgression: true`
  - "relación", "pareja", "hijo" → `isRelational: true`
  - Etc.
- Paso 2: mapear señales a GoalType con reglas
  - `isRecurring && !requiresSkillProgression` → `RECURRENT_HABIT`
  - `requiresSkillProgression` → `SKILL_ACQUISITION`
  - `hasDeliverable` → `FINITE_PROJECT`
  - `hasNumericTarget` → `QUANT_TARGET_TRACKING`
  - Etc.
- Paso 3 (opcional): si confianza < 0.7, usar LLM corto (~200 tokens) para desambiguar
- Risk detection: keywords de salud/finanzas/legales

### 3. PlanItem types
**Archivo**: `src/lib/domain/plan-item.ts`

Definir el union type `PlanItem` con los 5 kinds:
- `TimeEventItem`
- `FlexTaskItem`
- `MilestoneItem`
- `MetricItem`
- `TriggerRuleItem`
- Schemas Zod `.strict()` para cada kind
- Helper `isTimeEvent(item)`, `isFlexTask(item)`, etc.

### 4. PlanPatternRecommendation
**Archivo**: `src/lib/domain/plan-patterns.ts`

Mapeo GoalType → patrón(es) de plan recomendados:
```typescript
const GOAL_TYPE_PATTERNS: Record<GoalType, PlanPattern[]> = {
  RECURRENT_HABIT: ['TIME_BLOCK_SCHEDULER', 'IF_THEN_TRIGGER_PLAN'],
  SKILL_ACQUISITION: ['PROGRESSION_LEVELS', 'TIME_BLOCK_SCHEDULER'],
  FINITE_PROJECT: ['MILESTONE_WBS'],
  QUANT_TARGET_TRACKING: ['METRIC_TRACKER_WITH_RATE'],
  IDENTITY_EXPLORATION: ['EXPERIMENT_LOOP'],
  RELATIONAL_EMOTIONAL: ['CADENCE_TOUCHPOINTS'],
  HIGH_UNCERTAINTY_TRANSFORM: ['SCENARIO_GATES', 'MILESTONE_WBS'],
}
```

### 5. Domain Knowledge Cards (3 estáticas)
**Directorio**: `src/lib/domain/domain-knowledge/cards/`

Migrar el conocimiento hardcodeado actual a formato `DomainKnowledgeCard`:
- `running.ts` — niveles, regla del 10%, sesiones tipo
- `guitarra.ts` — niveles, práctica distribuida, sesiones tipo
- `idiomas.ts` — CEFR, spaced repetition

Cada card tiene `sources` con `EvidenceGrade` y `constraints` con severidad.

### 6. DomainKnowledgeBank
**Archivo**: `src/lib/domain/domain-knowledge/bank.ts`

```typescript
export function findCard(domainLabel: string): DomainKnowledgeCard | null
export function listCards(): DomainKnowledgeCard[]
```

Lookup simple por `domainLabel`. Si no encuentra → `null` (Sprint futuro: generación dinámica via LLM).

### 7. Tests
**Archivo**: `tests/pipeline-v5/classify.test.ts`

- Clasificar 20+ objetivos de ejemplo correctamente
- Verificar que regex patterns detectan señales
- Verificar mapping señales → GoalType
- Verificar que PlanItem schemas Zod validan/rechazan correctamente
- Verificar que Domain Knowledge Cards son válidas

---

## Gates de calidad

- [ ] `npm run typecheck` pasa
- [ ] `npm run test` pasa (incluye tests nuevos)
- [ ] Pipeline v1 sigue funcionando (`npm run lap:run:example` sin cambios)
- [ ] 0 imports de archivos nuevos en archivos v1

---

## Lo que NO se toca

- `src/lib/skills/plan-builder.ts` (v1, sigue igual)
- `src/lib/skills/plan-simulator.ts` (v1, sigue igual)
- `src/lib/pipeline/runner.ts` (v1, sigue igual)
- `app/api/*` (ninguna ruta cambia)
- `components/*` (ningún componente cambia)
