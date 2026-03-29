# Pipeline v5 — Sprint 4: Robustez

> **Status**: `pending`
> **Spec**: `docs/architecture/PIPELINE_V5_SPEC.md` (sección 5-6)
> **Depends on**: Sprint 3 completo (runner v5 y 12 fases básicas)
> **Scope**: Rolling Wave (3 capas de plan), HabitState persistente, SlackPolicy y Equivalence Classes.
> **NO incluye**: Adaptive Loop (adherencia), UI Changes.

---

## Objetivo

Transformar el plan generado de un documento estático a un sistema dinámico robusto. El "plan" ahora tiene estado (hábitos) y diferentes niveles de detalle según el horizonte temporal.

---

## Tareas

### 1. Modelo de Plan en 3 Capas (Rolling Wave)
**Archivo**: `src/lib/domain/rolling-wave-plan.ts`
Implementar el tipo `V5Plan` que contiene:
- **Skeleton** (12 semanas): Metas, frecuencias por fase, hitos. Estructura de alto nivel.
- **Detail** (2-4 semanas): Detalle de días/horarios sugeridos por el scheduler.
- **Operational** (7 días): El horario "congelado" listo para ejecución con buffers explícitos.

### 2. SlackPolicy e Invariantes de Estabilidad
**Archivo**: `src/lib/domain/slack-policy.ts`
Implementar lógica para manejar:
- `weeklyTimeBufferMin`: Tiempo sin asignar por semana (ej. 120min).
- `maxChurnMovesPerWeek`: Límite de cuántas veces puede cambiar un ítem el scheduler ante re-planes.
- `frozenHorizonDays`: Período de tiempo (ej. hoy + mañana) que el scheduler NUNCA debe tocar automáticamente.

### 3. HabitState - Persistencia del Progreso
**Archivo**: `src/lib/domain/habit-state.ts`
Implementar el objeto `HabitState` que rastrea:
- `progressionKey`: Identificador (ej. "guitarra").
- `weeksActive`: Cuántas semanas lleva el hábito en marcha.
- `level`: Nivel actual (monotónico, no se resetea en re-planes).
- `currentDose`: Configuración actual + `minimumViable` (táctica de defensa ante fallos).

### 4. Clases de Equivalencia (Swaps Seguros)
**Archivo**: `src/lib/domain/equivalence.ts`
Integrar en el `ActivityTemplate` de Sprint 1:
- `equivalenceGroupId`: Identificador de grupo (ej. "cardio-base").
- Lógica de swap: Si el usuario quiere cambiar "Correr" por "Nadar" y ambos están en el mismo grupo, el sistema hace el cambio respetando la frecuencia y el estado del hábito sin re-calcular la estrategia.

### 5. Integración en el Packager (Fase 11)
**Archivo**: `src/lib/pipeline/v5/packager.ts`
Actualizar el packager para que genere el `V5Plan` con las 3 capas, e incluya el `HabitState` inicial basado en el perfil del usuario.

### 6. Tests de Robustez
**Archivo**: `tests/pipeline-v5/robustness.test.ts`
Verificar:
- Que un re-plan parcial respeta la `frozen zone`.
- Que el estado del hábito no se resetea si se cambia el horario de la actividad.
- Que el swap de equivalencia no altera la estructura global del plan.
- Que el packager genera correctamente el esqueleto vs el detalle.

---

## Gates de calidad

- [ ] `npm run typecheck` pasa
- [ ] `npm run test` pasa (con los nuevos tests de robustez)
- [ ] El objeto `V5Plan` persiste correctamente en DB (opcional según el progreso)
- [ ] 0 regresiones en el repair loop de Sprint 3
