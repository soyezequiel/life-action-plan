# Prompts de Implementación — Sprint 4: Robustez

> **Prerequisito**: Sprint 3 (12 fases completas) completado.
> **Uso**: Copiar y pegar cada prompt en un CHAT NUEVO para Codex.

---

## 🛠 CHAT 1: Modelos de Robustez (Rolling Wave + HabitState)
**Cuándo**: AHORA (inicio del sprint 4).
**Modelo recomendado**: Claude Sonnet 4.7 (Thinking) o GPT-4o (Codex).
**Acción**: Abrí un chat nuevo y pegá esto:

```text
Estamos en el Sprint 4 del pipeline v5: Robustez. Queremos implementar las tareas 1, 2 y 3 del plan.

1. Leé la spec: `docs/architecture/PIPELINE_V5_SPEC.md` (sección 5: Sistema Adaptativo)
2. Leé el plan del sprint: `docs/plans/pipeline-v5-sprint-4-v1/PLAN.md`
3. Leé los tipos del Sprint 1 y 3 (`src/lib/domain/plan-item.ts` y `src/lib/pipeline/v5/phase-io-v5.ts`).

Tus objetivos:
1. Crear `src/lib/domain/rolling-wave-plan.ts`:
   - Definir `V5Plan` con las 3 capas: `skeleton` (12 semanas), `detail` (2-4 semanas), `operational` (congelado 7 días).
   - El `detail` debe heredar los `TimeEventItem` del scheduler.

2. Crear `src/lib/domain/slack-policy.ts`:
   - Implementar la estructura `SlackPolicy` con: `weeklyTimeBufferMin`, `maxChurnMovesPerWeek`, `frozenHorizonDays`.
   - Lógica de validación: ¿Un re-plan propuesto viola la zona `frozen`?

3. Crear `src/lib/domain/habit-state.ts`:
   - Implementar el objeto `HabitState` que rastrea la progresión fuera del schedule (weeksActive, level, currentDose, minimumViable).
   - Persistir esto como una interfaz para que el runner pueda inyectar el estado previo en un re-plan.

Recordá:
- Usá Zod `.strict()` para todos los tipos.
- No modifiques el runner v5 todavía, solo creá las estructuras en `src/lib/domain/`.
```

### ✅ Checklist — Qué verificar después del CHAT 1

| # | Qué chequear | Cómo |
|---|-------------|------|
| 1 | Existen `rolling-wave-plan.ts`, `slack-policy.ts`, `habit-state.ts` | Verificar archivos |
| 2 | Compila sin errores | `npm run typecheck` ✅ |
| 3 | `V5Plan` tiene 3 capas | Skeleton, Detail, Operational |
| 4 | `HabitState` tiene level y weeksActive | Buscar campos en el archivo |
| 5 | `SlackPolicy` tiene `frozenHorizonDays` | Buscar campo en el archivo |

---

## 🛠 CHAT 2: Clases de Equivalencia y Swaps Seguros
**Cuándo**: Luego de que el CHAT 1 pase la checklist.
**Acción**: Abrí un **CHAT NUEVO** y pegá esto:

```text
Continuamos Sprint 4. Fases 1-3 listas. Ahora la TAREA 4: Clases de Equivalencia.

Objetivos:
1. Crear `src/lib/domain/equivalence.ts`:
   - Lógica para agrupar ítems compatibles (ej: "cardio-outdoor", "gym-indoors").
   - Función `canSwap(itemA, itemB): boolean` basada en ID de grupo de equivalencia.
   - Si el usuario quiere cambiar una actividad por otra del mismo grupo, el `HabitState` se transfiere sin problemas.

2. Actualizar `ActivityTemplate` o donde se definan las plantillas base en `src/lib/domain/` para incluir `equivalenceGroupId: string`.

3. Implementar un helper para que el scheduler (cuando se re-ejecute) prefiera swaps de equivalencia antes que re-scheduling agresivo.

Recordá: NO alterar la lógica del MILP solver, solo exponer la compatibilidad para que el runner la use.
```

---

## 🛠 CHAT 3: Integración en el Runner y Packager
**Cuándo**: Luego de que el CHAT 2 pase la checklist.
**Acción**: Abrí un **CHAT NUEVO** y pegá esto:

```text
Sprint 4, TAREA 5: Integración final.

Leé:
- `src/lib/pipeline/v5/runner.ts`
- `src/lib/pipeline/v5/packager.ts`
- Los nuevos archivos en `src/lib/domain/` (rolling-wave-plan, slack-policy, habit-state).

Tus objetivos:
1. Actualizar `src/lib/pipeline/v5/packager.ts` (Fase 11):
   - El packager ahora debe devolver un `V5Plan` completo, no solo una lista plana de ítems.
   - Debe calcular la versión inicial del `HabitState` para los nuevos objetivos.
   - Debe inyectar los buffers de la `SlackPolicy`.

2. Actualizar el runner en `src/lib/pipeline/v5/runner.ts`:
   - Al inicio del flujo, si hay una sesión previa, recuperar el `HabitState`.
   - Pasar el estado actual a la Fase 4 (Strategy) para que la estrategia sea adaptativa desde el inicio (ej: saltar fase de "introducción" si el hábito ya tiene 4 semanas).

Check: Que el `PlanPackage` ahora exponga la estructura de 3 capas.
```

---

## 🛠 CHAT 4: Tests de Robustez
**Cuándo**: Final del sprint.
**Acción**: Abrí un **CHAT NUEVO** y pegá esto:

```text
Última tarea del Sprint 4: Tests.

Creá `tests/pipeline-v5/robustness.test.ts` para verificar:
1. Proyección de 3 capas: El plan a 12 semanas existe vs el detalle a 2 semanas.
2. Frozen Zone: Si pido un re-plan que toca "mañana", el sistema debe evitar cambios en ese slot.
3. Persistencia de Hábito: Simular una semana de ejecución, actualizar `HabitState`, pedir nuevo plan y verificar que el `level` se mantiene o sube correctamente.
4. Swap de Equivalencia: Verificar que cambiar "Correr" por "Bici" (mismo grupo) no invalida el plan.

Corré `npm run test` y asegurate que todo pase.
```
