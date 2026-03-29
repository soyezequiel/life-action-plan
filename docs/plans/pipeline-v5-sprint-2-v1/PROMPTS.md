# Prompts de Implementación — Sprint 2: Scheduler MILP

> **Prerequisito**: Sprint 1 completado (tipos en `src/lib/domain/`).
> **Uso**: Copiar y pegar cada prompt en un CHAT NUEVO.

---

## 🛠 CHAT 1: Instalación + Tipos del Scheduler
**Cuándo**: AHORA (inicio del sprint).
**Modelo recomendado**: Gemini 3.1 Pro (Low) — *Es definición de tipos + instalación de dependencia.*
**Acción**: Abrí un chat nuevo y pegá esto:

```text
Estamos en el Sprint 2 del pipeline v5: implementar un scheduler MILP.

1. Leé la spec: `docs/architecture/PIPELINE_V5_SPEC.md` (sección 4: Scheduler MILP)
2. Leé el plan del sprint: `docs/plans/pipeline-v5-sprint-2-v1/PLAN.md`
3. Leé los tipos existentes del Sprint 1: `src/lib/domain/plan-item.ts` (necesitás el `TimeEventItem`)

Tus objetivos:
1. Instalar `highs` como dependencia del proyecto (`npm install highs`)
2. Crear `src/lib/scheduler/types.ts` con todos los tipos del scheduler:
   - `SchedulerInput` (activities, availability, blocked slots, preferences, weekStartDate)
   - `ActivityRequest` (id, label, durationMin, frequencyPerWeek, goalId, constraintTier, preferredSlots, avoidDays, minRestDaysBetween)
   - `AvailabilityWindow` (day, startTime, endTime)
   - `BlockedSlot` (day, startTime, endTime, reason)
   - `SchedulingPreference` (tipo de preferencia + peso)
   - `SchedulerOutput` (events como TimeEventItem[], unscheduled, tradeoffs, metrics)
   - `UnscheduledItem` (activityId, reason, suggestion_esAR)
   - `Tradeoff` (planA, planB, question_esAR)
   - `SchedulerMetrics` (fillRate, solverTimeMs, solverStatus)

Recordá:
- Usá Zod `.strict()` para los schemas.
- Importá `TimeEventItem` desde `src/lib/domain/plan-item.ts`.
- Las sugerencias para `unscheduled` y `tradeoffs` deben ser strings en español argentino.
- El scheduler discretiza en slots de 30 minutos (336 slots por semana).
```

### ✅ Checklist — Qué verificar después del CHAT 1

| # | Qué chequear | Cómo |
|---|-------------|------|
| 1 | `highs` instalado | `npm ls highs` muestra la versión |
| 2 | Existe `src/lib/scheduler/types.ts` | Verificar que el archivo existe |
| 3 | Compila sin errores | `npm run typecheck` ✅ |
| 4 | `SchedulerInput` tiene 5 campos | `activities`, `availability`, `blocked`, `preferences`, `weekStartDate` |
| 5 | `ActivityRequest` tiene `constraintTier` | Buscar `constraintTier: z.enum(['hard', 'soft_strong', 'soft_weak'])` |
| 6 | `SchedulerOutput` importa `TimeEventItem` | Verificar el import desde `plan-item.ts` |
| 7 | Discretización definida | Buscar una constante `SLOT_DURATION_MIN = 30` o `SLOTS_PER_DAY = 48` |
| 8 | Pipeline v1 sigue OK | `npm run build` ✅ |

---

## 🛠 CHAT 2: Modelo MILP + Constraint Builder
**Cuándo**: Luego de que el CHAT 1 pase la checklist.
**Modelo recomendado**: Claude Opus 4.6 (Thinking) — *Esta es la parte más compleja del sprint: traducir scheduling a programación lineal entera.*
**Acción**: Abrí un **CHAT NUEVO** y pegá esto:

```text
Estamos implementando el scheduler MILP del Sprint 2 del pipeline v5.

1. Leé la spec: `docs/architecture/PIPELINE_V5_SPEC.md` (sección 4)
2. Leé el plan: `docs/plans/pipeline-v5-sprint-2-v1/PLAN.md`
3. Leé los tipos del scheduler: `src/lib/scheduler/types.ts`
4. Leé los tipos de PlanItem: `src/lib/domain/plan-item.ts`

Tus objetivos:
1. Crear `src/lib/scheduler/milp-model.ts`: construir el modelo MILP
   - Variables binarias x[a][s]: actividad `a` empieza en slot `s`
   - Constraints hard: no overlap, blocked slots, duración contigua
   - Soft constraints como penalización en función objetivo (soft_strong = peso alto, soft_weak = peso bajo)
   - Función objetivo: minimizar suma de penalidades

2. Crear `src/lib/scheduler/constraint-builder.ts`: traducir SchedulerInput a formato MILP
   - Convertir AvailabilityWindow a bitmap de slots habilitados
   - Convertir BlockedSlot a constraints hard (x[a][s] = 0)
   - Convertir ActivityRequest.frequencyPerWeek a constraints de frecuencia
   - Convertir minRestDaysBetween a constraints de separación
   - Convertir preferredSlots/avoidDays a penalidades soft

Conceptos de discretización:
- 1 slot = 30 minutos, 48 slots por día, 336 slots por semana
- Slot 0 = lunes 00:00, Slot 47 = lunes 23:30, Slot 48 = martes 00:00, etc.
- Una actividad de 60min ocupa 2 slots consecutivos

El modelo MILP debe usar el formato que highs-js acepta (consultar docs de `highs`).
El time limit del solver debe ser 3 segundos.
```

### ✅ Checklist — Qué verificar después del CHAT 2

| # | Qué chequear | Cómo |
|---|-------------|------|
| 1 | Existe `src/lib/scheduler/milp-model.ts` | Verificar archivo |
| 2 | Existe `src/lib/scheduler/constraint-builder.ts` | Verificar archivo |
| 3 | Compila sin errores | `npm run typecheck` ✅ |
| 4 | Variables binarias definidas | Buscar `x[a][s]` o equivalente como variables 0/1 |
| 5 | No-overlap constraint existe | Buscar lógica que sume actividades por slot y ponga ≤ 1 |
| 6 | Blocked slots son hard constraints | Buscar lógica que fije `x[a][blocked_slot] = 0` |
| 7 | Soft penalties tienen pesos diferenciados | Buscar que `soft_strong` tenga penalización mayor que `soft_weak` |
| 8 | Time limit configurado | Buscar `3000` o `3` (milisegundos o segundos) |
| 9 | Discretización correcta | 48 slots/día × 7 días = 336 slots totales |

---

## 🛠 CHAT 3: Solver Wrapper + Explainer
**Cuándo**: Luego de que el CHAT 2 pase la checklist.
**Modelo recomendado**: Claude Sonnet 4.6 (Thinking) — *Necesita conectar el modelo con highs-js y generar explicaciones en español.*
**Acción**: Abrí un **CHAT NUEVO** y pegá esto:

```text
Estamos terminando el scheduler MILP del Sprint 2.

1. Leé los tipos: `src/lib/scheduler/types.ts`
2. Leé el modelo MILP: `src/lib/scheduler/milp-model.ts`
3. Leé el constraint builder: `src/lib/scheduler/constraint-builder.ts`
4. Leé `src/lib/domain/plan-item.ts` (para construir TimeEventItem en el output)

Tus objetivos:
1. Crear `src/lib/scheduler/solver.ts`:
   - Función `solveSchedule(input: SchedulerInput): Promise<SchedulerOutput>`
   - Usa highs-js para resolver el modelo MILP
   - Time limit: 3 segundos
   - Si no encuentra óptimo, devuelve mejor solución encontrada (status "feasible" en vez de "optimal")
   - Traduce la solución numérica (slots ganadores) a `TimeEventItem[]` con startAt, durationMin, etc.
   - Genera `weekStartDate` + offset de slots para calcular las fechas ISO reales

2. Crear `src/lib/scheduler/explainer.ts`:
   - Función `explainUnscheduled(input, solverResult): UnscheduledItem[]`
   - Para cada actividad que NO entró, explicar POR QUÉ en español argentino abuela-proof
   - Ejemplos de explicaciones:
     - "No hay espacio para 4 sesiones de gym. ¿Te sirve hacer 3?"
     - "Correr y natación compiten por la mañana. ¿Podrías hacer natación a la tarde?"
   - Función `generateTradeoffs(input, solverResult): Tradeoff[]`
   - Cuando hay alternativas, generar Plan A vs Plan B con pregunta para el usuario

Recordá que todas las strings de UX deben estar en español argentino y ser abuela-proof (sin jerga técnica).
```

### ✅ Checklist — Qué verificar después del CHAT 3

| # | Qué chequear | Cómo |
|---|-------------|------|
| 1 | Existe `src/lib/scheduler/solver.ts` | Verificar archivo |
| 2 | Existe `src/lib/scheduler/explainer.ts` | Verificar archivo |
| 3 | Compila sin errores | `npm run typecheck` ✅ |
| 4 | `solveSchedule` retorna `Promise<SchedulerOutput>` | Verificar la firma de la función |
| 5 | Usa `highs` | Buscar `import` o `require` de `highs` |
| 6 | Time limit configurado | Buscar `time_limit` o equivalente = 3s |
| 7 | Genera `TimeEventItem[]` con fechas ISO | Buscar construcción de objetos con `startAt`, `durationMin`, `kind: 'time_event'` |
| 8 | Explicaciones en español | Buscar strings con texto en español argentino |
| 9 | Tradeoffs tienen Plan A y Plan B | Buscar `planA` y `planB` en el output |

---

## 🛠 CHAT 4: Tests del Scheduler
**Cuándo**: Luego de que el CHAT 3 pase la checklist.
**Modelo recomendado**: Claude Sonnet 4.6 (Thinking) — *Necesita diseñar escenarios de scheduling complejos.*
**Acción**: Abrí un **CHAT NUEVO** y pegá esto:

```text
Implementamos el scheduler MILP completo en `src/lib/scheduler/`.
Ahora necesito tests exhaustivos.

Leé todos estos archivos para entender qué testear:
- `src/lib/scheduler/types.ts`
- `src/lib/scheduler/solver.ts`
- `src/lib/scheduler/milp-model.ts`
- `src/lib/scheduler/constraint-builder.ts`
- `src/lib/scheduler/explainer.ts`

Crear `tests/pipeline-v5/scheduler.test.ts` con los siguientes escenarios:

1. **Caso simple**: 2 actividades (correr 3×/sem, guitarra 5×/sem), horario amplio libre → todo entra sin conflictos
2. **Overlap**: 3 actividades quieren lunes a las 09:00 → solver coloca sin overlap (una se mueve)
3. **Soft strong**: gym pedido 4×/sem pero solo hay espacio para 3 → se programa 3 (soft_strong respetado)
4. **Soft weak**: "prefiero cocinar los fines de semana" pero no hay espacio → se mueve a miércoles (weak rompe primero)
5. **Agenda llena**: blocked slots cubren casi todo → unscheduled con explicación en español
6. **Trade-offs**: 2 actividades compiten por mismo bloque → tradeoff generado con Plan A y Plan B
7. **Rest days**: running con minRestDaysBetween=1 → no hay running lunes Y martes
8. **Performance**: 7 actividades × 3-5 sesiones cada una → resuelve en <3 segundos
9. **Edge case vacío**: 0 actividades → output vacío sin error
10. **Edge case sin disponibilidad**: todo bloqueado → todas las actividades en unscheduled

Cada test debe verificar que NO hay overlaps en el output (invariante fundamental).
```

### ✅ Checklist — Qué verificar después del CHAT 4

| # | Qué chequear | Cómo |
|---|-------------|------|
| 1 | Existe `tests/pipeline-v5/scheduler.test.ts` | Verificar archivo |
| 2 | Tests pasan | `npm run test` ✅ |
| 3 | Hay ≥10 escenarios | Contar los `it()` o `test()` en el archivo |
| 4 | Test de performance existe | Buscar test que mida tiempo y verifique < 3000ms |
| 5 | Invariante de no-overlap | Buscar helper que verifique que ningún output tiene slots solapados |
| 6 | Tests de unscheduled | Buscar test que verifique que `unscheduled` tiene explicación en español |
| 7 | Tests de tradeoffs | Buscar test que verifique generación de Plan A / Plan B |
| 8 | Tests v1 siguen pasando | `npm run test` no rompe tests existentes |

---

## 🏁 Checklist Final del Sprint 2

Cuando los 4 chats estén completos, verificar:

| # | Gate | Comando |
|---|------|---------|
| 1 | Typecheck | `npm run typecheck` ✅ |
| 2 | Tests | `npm run test` ✅ |
| 3 | Build | `npm run build` ✅ |
| 4 | Performance | Test de 7 actividades resuelve en <3 seg |
| 5 | No overlaps | Invariante verificada en todos los tests |
| 6 | Pipeline v1 funciona | La app en `localhost:3000` sigue creando planes normalmente |
| 7 | 0 archivos v1 modificados | `git diff --name-only` muestra SOLO archivos nuevos en `src/lib/scheduler/` y `tests/pipeline-v5/` |
| 8 | Estructura correcta | Existen: `types.ts`, `milp-model.ts`, `constraint-builder.ts`, `solver.ts`, `explainer.ts` |
