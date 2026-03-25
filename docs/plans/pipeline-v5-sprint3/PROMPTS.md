# Prompts de Implementación — Sprint 3: Pipeline 12 Fases

> **Prerequisito**: Sprint 1 (domain types) + Sprint 2 (scheduler MILP) completados.
> **Uso**: Copiar y pegar cada prompt en un CHAT NUEVO.
> **⚠️ Este es el sprint más grande.** Tiene 6 chats porque conecta todo el pipeline.

---

## 🛠 CHAT 1: Phase IO v5 + Fases 2-3 (Requirements + Profile)
**Cuándo**: AHORA (inicio del sprint).
**Modelo recomendado**: Claude Sonnet 4.6 (Thinking) — *Necesita diseñar contratos I/O para 12 fases y la lógica de preguntas adaptativas.*
**Acción**: Abrí un chat nuevo y pegá esto:

```text
Estamos en el Sprint 3 del pipeline v5: conectar las 12 fases.

1. Leé la spec: `docs/architecture/PIPELINE_V5_SPEC.md` (secciones 3 y 6)
2. Leé el plan: `docs/plans/pipeline-v5-sprint3/PLAN.md`
3. Leé los tipos existentes:
   - `src/lib/domain/goal-taxonomy.ts` (GoalType, GoalClassification)
   - `src/lib/domain/plan-item.ts` (PlanItem, TimeEventItem)
   - `src/lib/scheduler/types.ts` (SchedulerInput, ActivityRequest)
4. Leé el phase-io actual como referencia de estructura: `src/lib/pipeline/phase-io.ts`

Tus objetivos:
1. Crear `src/lib/pipeline/v5/phase-io-v5.ts`:
   - Definir tipos de Input/Output para CADA una de las 12 fases del pipeline v5
   - Usar el wrapper genérico `PhaseIO<I, O>` del phase-io existente
   - Crear un `PhaseIORegistryV5` con las 12 fases

2. Crear `src/lib/pipeline/v5/requirements.ts` (Fase 2):
   - Función que, dado un GoalClassification, genera preguntas adaptadas al tipo de objetivo
   - SKILL_ACQUISITION → nivel actual, tiempo, experiencia previa
   - QUANT_TARGET_TRACKING → target numérico, plazo, situación actual
   - FINITE_PROJECT → deadline, entregables, recursos
   - Etc. para los 7 tipos
   - ~300 tokens de LLM para generar las preguntas

3. Crear `src/lib/pipeline/v5/profile.ts` (Fase 3):
   - Consolida respuestas del usuario en un perfil con anclas numéricas
   - Calcula: horas libres/día laboral, horas libres/fin de semana
   - Extrae: constraints de horario, energía estimada, compromisos fijos
   - ~500 tokens de LLM

Recordá: NO modificar archivos de la pipeline v1. Todo es nuevo en `src/lib/pipeline/v5/`.
```

### ✅ Checklist — Qué verificar después del CHAT 1

| # | Qué chequear | Cómo |
|---|-------------|------|
| 1 | Existe `src/lib/pipeline/v5/phase-io-v5.ts` | Verificar archivo |
| 2 | `PhaseIORegistryV5` tiene 12 entradas | Buscar las 12 fases: classify, requirements, profile, strategy, template, schedule, hardValidate, softValidate, coveVerify, repair, package, adapt |
| 3 | Existe `src/lib/pipeline/v5/requirements.ts` | Verificar archivo |
| 4 | Requirements cubre los 7 GoalTypes | Buscar switch/map con los 7 tipos |
| 5 | Existe `src/lib/pipeline/v5/profile.ts` | Verificar archivo |
| 6 | Profile calcula anclas numéricas | Buscar cálculo de `freeHoursWeekday` y `freeHoursWeekend` |
| 7 | Compila sin errores | `npm run typecheck` ✅ |
| 8 | No toca archivos v1 | `git diff --name-only` solo archivos en `v5/` |

---

## 🛠 CHAT 2: Fase 4 (Strategy) + Fase 5 (Template Builder)
**Cuándo**: Luego de que el CHAT 1 pase la checklist.
**Modelo recomendado**: Claude Sonnet 4.6 (Thinking) — *El strategy agent necesita generar planes coherentes por tipo de objetivo.*
**Acción**: Abrí un **CHAT NUEVO** y pegá esto:

```text
Continuamos el Sprint 3. Las fases 1-3 están implementadas.

Leé estos archivos para contexto:
- `docs/plans/pipeline-v5-sprint3/PLAN.md`
- `src/lib/pipeline/v5/phase-io-v5.ts` (contratos I/O)
- `src/lib/domain/goal-taxonomy.ts`
- `src/lib/domain/domain-knowledge/bank.ts` (DomainKnowledgeCard)
- `src/lib/scheduler/types.ts` (ActivityRequest — el output del template builder)

Tus objetivos:
1. Crear `src/lib/pipeline/v5/strategy.ts` (Fase 4):
   - Dado el perfil del usuario + GoalClassification + DomainKnowledgeCard, genera un roadmap estratégico
   - El roadmap tiene: fases (ej: "fundamentos" → "consolidación" → "avanzado"), hitos con deadline, frecuencias por fase
   - Usa la DomainKnowledgeCard para informar progresiones y constraints de dominio
   - ~800 tokens de LLM
   - Output: `StrategicRoadmap` (definido en phase-io-v5)

2. Crear `src/lib/pipeline/v5/template-builder.ts` (Fase 5):
   - Traduce el StrategicRoadmap a `ActivityRequest[]` para el scheduler del Sprint 2
   - Para cada actividad del roadmap genera un ActivityRequest con frequencyPerWeek, durationMin, constraintTier, preferredSlots, minRestDaysBetween
   - Usa la DomainKnowledgeCard para constraints de dominio (ej: running → minRestDaysBetween=1)
   - DETERMINÍSTICO: NO usa LLM. Es una compilación/mapping puro.

Recordá: NO modificar archivos existentes. Todo nuevo en v5/.
```

### ✅ Checklist — Qué verificar después del CHAT 2

| # | Qué chequear | Cómo |
|---|-------------|------|
| 1 | Existe `src/lib/pipeline/v5/strategy.ts` | Verificar archivo |
| 2 | Strategy usa DomainKnowledgeCard | Buscar import de `bank.ts` o `findCard` |
| 3 | Strategy genera fases con hitos | Buscar tipo `StrategicRoadmap` con array de fases |
| 4 | Existe `src/lib/pipeline/v5/template-builder.ts` | Verificar archivo |
| 5 | Template builder genera `ActivityRequest[]` | Buscar import de `ActivityRequest` desde `scheduler/types.ts` |
| 6 | Template builder es determinístico | **NO debe tener** imports de providers LLM ni llamadas async a modelos |
| 7 | Template builder usa constraints de domain card | Buscar uso de `constraints` o `minRestDaysBetween` |
| 8 | Compila sin errores | `npm run typecheck` ✅ |

---

## 🛠 CHAT 3: Fases 7-8 (Hard + Soft Validator)
**Cuándo**: Luego de que el CHAT 2 pase la checklist.
**Modelo recomendado**: Gemini 3.1 Pro (Low) — *Son validadores determinísticos con reglas claras.*
**Acción**: Abrí un **CHAT NUEVO** y pegá esto:

```text
Continuamos el Sprint 3. Fases 1-6 están listas (clasificación, perfil, estrategia, template, scheduler).

Leé estos archivos:
- `docs/plans/pipeline-v5-sprint3/PLAN.md`
- `src/lib/pipeline/v5/phase-io-v5.ts` (contratos I/O)
- `src/lib/scheduler/types.ts` (SchedulerOutput — lo que producen las fases anteriores)
- `src/lib/domain/plan-item.ts` (TimeEventItem)

Tus objetivos:
1. Crear `src/lib/pipeline/v5/hard-validator.ts` (Fase 7):
   - Función que recibe SchedulerOutput y verifica constraints DURAS:
     a. No hay overlaps (2 eventos en el mismo slot)
     b. Ningún evento fuera de las availability windows del usuario
     c. Duraciones son correctas (coinciden con lo pedido)
     d. Frecuencias mínimas hard cumplidas
   - Output: `HardValidationResult` con lista de `HardFinding[]`
   - Cada finding tiene: code, severity ('FAIL'), description (es-AR), affectedItems
   - DETERMINÍSTICO: puro código, sin LLM

2. Crear `src/lib/pipeline/v5/soft-validator.ts` (Fase 8):
   - Función que recibe SchedulerOutput + perfil y verifica calidad:
     a. Context switches excesivos (programar→cocinar→programar)
     b. Deep work en horarios de baja energía (ej: 22h)
     c. Días sin descanso (7/7 con actividades)
     d. Ramp-up demasiado agresivo (semana 1: 5 actividades nuevas)
     e. Monotonía (mismo tipo de actividad todos los días)
   - Output: `SoftValidationResult` con `SoftFinding[]`
   - Cada finding tiene: code, severity ('WARN' | 'INFO'), suggestion_esAR
   - DETERMINÍSTICO: puro código, sin LLM

Recordá que las descripciones y sugerencias van en español argentino, abuela-proof.
```

### ✅ Checklist — Qué verificar después del CHAT 3

| # | Qué chequear | Cómo |
|---|-------------|------|
| 1 | Existe `hard-validator.ts` | Verificar archivo |
| 2 | Existe `soft-validator.ts` | Verificar archivo |
| 3 | Hard validator chequea overlaps | Buscar lógica de detección de solapamientos |
| 4 | Hard validator chequea availability | Buscar verificación contra ventanas de disponibilidad |
| 5 | Soft validator chequea context switches | Buscar lógica que detecte actividades alternadas de distinto tipo |
| 6 | Soft validator chequea descanso | Buscar verificación de al menos 1 día libre |
| 7 | Ambos son determinísticos | **NO tienen** imports de providers ni llamadas a LLM |
| 8 | Findings en español | Buscar strings `description` o `suggestion_esAR` en castellano |
| 9 | Compila sin errores | `npm run typecheck` ✅ |

---

## 🛠 CHAT 4: Fase 9 (CoVe) + Fase 10 (Repair Manager)
**Cuándo**: Luego de que el CHAT 3 pase la checklist.
**Modelo recomendado**: Claude Opus 4.6 (Thinking) — *CoVe y Repair son la parte más compleja del sprint: razonamiento estructurado con patch ops atómicos.*
**Acción**: Abrí un **CHAT NUEVO** y pegá esto:

```text
Sprint 3, fases 9 y 10: verificación y reparación.

Leé estos archivos:
- `docs/plans/pipeline-v5-sprint3/PLAN.md`
- `docs/architecture/PIPELINE_V5_SPEC.md` (secciones 3 y 4)
- `src/lib/pipeline/v5/phase-io-v5.ts`
- `src/lib/pipeline/v5/hard-validator.ts` (HardFinding[])
- `src/lib/pipeline/v5/soft-validator.ts` (SoftFinding[])
- `src/lib/scheduler/types.ts` (SchedulerOutput)

Tus objetivos:
1. Crear `src/lib/pipeline/v5/cove-verifier.ts` (Fase 9 — CoVe = Chain-of-Verification):
   - Genera preguntas de verificación CONCRETAS sobre el plan:
     "¿El plan incluye descanso después de 2 días de running?"
     "¿Las sesiones de guitarra están distribuidas o concentradas en 1 día?"
     "¿Hay al menos 1 día libre por semana?"
   - Se auto-responde verificando los PlanItems (determinístico para las respuestas)
   - Las preguntas se generan con LLM (~800 tokens)
   - Output: `CoVeResult` con preguntas, respuestas, y findings adicionales

2. Crear `src/lib/pipeline/v5/repair-manager.ts` (Fase 10):
   - Recibe ALL findings (hard + soft + CoVe)
   - Solo actúa sobre findings con severity FAIL o WARN
   - Para cada finding, genera un patch op:
     - MOVE: mover actividad a otro slot
     - SWAP: intercambiar 2 actividades
     - DROP: eliminar actividad (último recurso, solo si no hay alternativa)
     - RESIZE: acortar duración de una actividad
   - Cada patch op se aplica, se re-valida, y se mide el score
   - Si el patch EMPEORA el score, se REVIERTE (commit/revert)
   - El repair loop puede re-invocar al scheduler si el patch requiere re-scheduling
   - Máximo 3 iteraciones de repair
   - ~500 tokens por iteración de LLM
   - Output: `RepairResult` con patches aplicados, score antes/después, iteraciones

Recordá: el repair manager debe ser capaz de REVERTIR un patch si no mejora las cosas.
```

### ✅ Checklist — Qué verificar después del CHAT 4

| # | Qué chequear | Cómo |
|---|-------------|------|
| 1 | Existe `cove-verifier.ts` | Verificar archivo |
| 2 | CoVe genera preguntas concretas | Buscar strings de ejemplo de preguntas sobre el plan |
| 3 | CoVe se auto-responde | Buscar lógica que verifica PlanItems contra cada pregunta |
| 4 | Existe `repair-manager.ts` | Verificar archivo |
| 5 | 4 tipos de patch op | Buscar `MOVE`, `SWAP`, `DROP`, `RESIZE` |
| 6 | Commit/revert implementado | Buscar lógica que compara score antes/después y revierte si empeora |
| 7 | Máx 3 iteraciones | Buscar constante `MAX_REPAIR_ITERATIONS = 3` o equivalente |
| 8 | Compila sin errores | `npm run typecheck` ✅ |

---

## 🛠 CHAT 5: Fase 11 (Packager) + Runner v5
**Cuándo**: Luego de que el CHAT 4 pase la checklist.
**Modelo recomendado**: Claude Sonnet 4.6 (Thinking) — *El runner es orquestación compleja con repair loop.*
**Acción**: Abrí un **CHAT NUEVO** y pegá esto:

```text
Sprint 3, tareas finales: packager + runner v5.

Leé TODOS estos archivos (son las 12 fases):
- `docs/plans/pipeline-v5-sprint3/PLAN.md`
- `src/lib/pipeline/v5/phase-io-v5.ts` (contratos)
- `src/lib/pipeline/v5/classify.ts` (Fase 1 - Sprint 1)
- `src/lib/pipeline/v5/requirements.ts` (Fase 2)
- `src/lib/pipeline/v5/profile.ts` (Fase 3)
- `src/lib/pipeline/v5/strategy.ts` (Fase 4)
- `src/lib/pipeline/v5/template-builder.ts` (Fase 5)
- `src/lib/scheduler/solver.ts` (Fase 6 - Sprint 2)
- `src/lib/pipeline/v5/hard-validator.ts` (Fase 7)
- `src/lib/pipeline/v5/soft-validator.ts` (Fase 8)
- `src/lib/pipeline/v5/cove-verifier.ts` (Fase 9)
- `src/lib/pipeline/v5/repair-manager.ts` (Fase 10)

Tus objetivos:
1. Crear `src/lib/pipeline/v5/packager.ts` (Fase 11):
   - Empaqueta el resultado final en un `PlanPackage`:
     - `items: PlanItem[]` — todos los ítems polimórficos del plan
     - `summary_esAR: string` — resumen en español abuela-proof
     - `qualityScore: number` — 0-100
     - `implementationIntentions: string[]` — "Si [situación], entonces [acción]"
     - `warnings: string[]` — advertencias honestas si el plan tiene compromisos
   - DETERMINÍSTICO: no usa LLM

2. Crear `src/lib/pipeline/v5/runner.ts` (Runner V5):
   - Clase `FlowRunnerV5` que orquesta las 12 fases secuencialmente
   - Mantiene contexto entre fases (output de fase N = input de fase N+1)
   - Emite `PhaseIO` para cada fase (compatible con el Flow Viewer existente)
   - Repair loop: si fases 7-9 reportan FAILs, ejecutar fase 10 y re-validar (máx 3 iter)
   - Tracker/callbacks para reportar progreso (compatible con SSE streaming)
   - NO modifica `src/lib/pipeline/runner.ts` (v1 intacto)

Recordá: el runner v5 debe ser 100% independiente del runner v1. Importas desde v5/ y scheduler/, NO desde services/ ni skills/.
```

### ✅ Checklist — Qué verificar después del CHAT 5

| # | Qué chequear | Cómo |
|---|-------------|------|
| 1 | Existe `packager.ts` | Verificar archivo |
| 2 | Packager genera `PlanItem[]` | Buscar tipo `PlanPackage` con campo `items` |
| 3 | Packager genera summary en español | Buscar `summary_esAR` |
| 4 | Packager genera implementation intentions | Buscar `implementationIntentions` |
| 5 | Existe `runner.ts` (v5) | Verificar `src/lib/pipeline/v5/runner.ts` |
| 6 | Runner ejecuta 12 fases | Buscar las 12 fases en secuencia (classify → requirements → ... → package) |
| 7 | Repair loop implementado | Buscar loop que repite fases 7-10 hasta 3 veces |
| 8 | Emite PhaseIO | Buscar emisiones de `phaseIO` para cada fase |
| 9 | NO importa de v1 | Verificar que **NO** importa de `runner.ts`, `plan-builder.ts`, `plan-simulator.ts` ni `services/` |
| 10 | Compila sin errores | `npm run typecheck` ✅ |
| 11 | Build pasa | `npm run build` ✅ |

---

## 🛠 CHAT 6: Tests del Pipeline v5
**Cuándo**: Luego de que el CHAT 5 pase la checklist.
**Modelo recomendado**: Claude Sonnet 4.6 (Thinking) — *Necesita diseñar escenarios E2E complejos.*
**Acción**: Abrí un **CHAT NUEVO** y pegá esto:

```text
El pipeline v5 completo está implementado en `src/lib/pipeline/v5/`.

Leé estos archivos para entender el flujo:
- `src/lib/pipeline/v5/runner.ts` (orquestador)
- `src/lib/pipeline/v5/phase-io-v5.ts` (contratos)

Crear `tests/pipeline-v5/runner.test.ts` con los siguientes escenarios:

1. **Happy path simple**: objetivo "correr 3 veces por semana" → clasificar como RECURRENT_HABIT → plan con 3 TimeEventItems
2. **Happy path complejo**: objetivo "aprender guitarra" → SKILL_ACQUISITION → plan con progresión + sesiones
3. **Multi-objetivo**: "correr + guitarra + ahorrar" → 3 clasificaciones → plan combinado
4. **Repair loop**: inyectar un plan con overlap → verificar que el repair lo corrige en ≤3 iteraciones
5. **CoVe detecta problema**: inyectar plan sin descanso → CoVe genera finding → repair corrige
6. **Packager genera output correcto**: verificar que el PlanPackage tiene items, summary, qualityScore
7. **Phase IO emitido para cada fase**: verificar que el runner emite 11+ PhaseIO entries (fase 12 es async)

Cada test puede mockear las llamadas LLM para que sea rápido y determinístico.
El scheduler real (highs) debería usarse (no mockeado) para verificar integración.
```

### ✅ Checklist — Qué verificar después del CHAT 6

| # | Qué chequear | Cómo |
|---|-------------|------|
| 1 | Existe `tests/pipeline-v5/runner.test.ts` | Verificar archivo |
| 2 | Tests pasan | `npm run test` ✅ |
| 3 | Hay ≥7 escenarios | Contar `it()` o `test()` |
| 4 | Happy path produce PlanItems | Buscar assertions sobre `items.length > 0` |
| 5 | Repair loop se testea | Buscar test que inyecta overlap y verifica corrección |
| 6 | LLM mockeado | Buscar mocks de providers para las fases LLM |
| 7 | Scheduler real usado | Buscar que NO mockea `solveSchedule` |
| 8 | Tests v1 siguen pasando | `npm run test` no rompe tests existentes |

---

## 🏁 Checklist Final del Sprint 3

| # | Gate | Comando |
|---|------|---------|
| 1 | Typecheck | `npm run typecheck` ✅ |
| 2 | Tests | `npm run test` ✅ |
| 3 | Build | `npm run build` ✅ |
| 4 | Pipeline v1 funciona | `localhost:3000` crea planes normalmente |
| 5 | 0 archivos v1 modificados | `git diff --name-only` solo archivos nuevos |
| 6 | Archivos nuevos completos | 10 archivos en `src/lib/pipeline/v5/`: phase-io-v5, requirements, profile, strategy, template-builder, hard-validator, soft-validator, cove-verifier, repair-manager, packager, runner |
| 7 | Repair loop funciona | Test de repair corrige overlap en ≤3 iteraciones |
| 8 | CoVe detecta problemas | Test de CoVe genera findings reales |
