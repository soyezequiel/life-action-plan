# Pipeline v5 — Sprint 2: Scheduler MILP

> **Status**: `pending`
> **Spec**: `docs/architecture/PIPELINE_V5_SPEC.md` (sección 4)
> **Depends on**: Sprint 1 completado (tipos en `src/lib/domain/`)
> **Scope**: Motor de scheduling basado en optimización MILP
> **NO incluye**: CoVe, Repair Manager, Rolling Wave, UI changes

---

## Objetivo

Implementar el scheduler que reemplaza al LLM como colocador de eventos en el calendario.
El LLM ya no decide "día/hora" — eso lo hace un solver MILP determinístico.

---

## Conceptos clave

### Discretización temporal
- 1 slot = 30 minutos
- 1 semana = 336 slots (7 días × 48 slots/día)
- Cada actividad ocupa N slots consecutivos

### 3 tiers de constraints

| Tier | Semántica | Ejemplo | En el solver |
|------|----------|---------|-------------|
| `hard` | NUNCA se viola | No overlap, no durante sueño, no durante trabajo | Constraints lineales estrictas |
| `soft_strong` | Solo se viola si no hay alternativa | "Gym 4×/semana" (puede bajar a 3× si no entra) | Penalización alta en función objetivo |
| `soft_weak` | Se rompe primero | "Prefiero cocinar los fines de semana" | Penalización baja en función objetivo |

### Output

El scheduler produce `TimeEventItem[]` (del Sprint 1) + info de lo que NO entró + trade-offs opcionales.

---

## Tareas

### 1. Instalar `highs-js`
**Acción**: `npm install highs`
**Verificar**: Que importa y corre sin errores en Node.js (HiGHS es WASM, no necesita binarios nativos).

### 2. Tipos del scheduler
**Archivo**: `src/lib/scheduler/types.ts`

```typescript
// Input al scheduler
interface SchedulerInput {
  activities: ActivityRequest[]        // qué actividades colocar
  availability: AvailabilityWindow[]   // cuándo puede el usuario
  blocked: BlockedSlot[]               // cuándo NO puede (trabajo, sueño, compromisos)
  preferences: SchedulingPreference[]  // soft constraints
  weekStartDate: string                // ISO date
}

interface ActivityRequest {
  id: string
  label: string                        // "Correr", "Guitarra"
  durationMin: number                  // 30, 45, 60...
  frequencyPerWeek: number             // 3
  goalId: string
  constraintTier: 'hard' | 'soft_strong' | 'soft_weak'
  preferredSlots?: string[]            // "morning", "evening"
  avoidDays?: string[]                 // "friday"
  minRestDaysBetween?: number          // 1 (no correr 2 días seguidos)
}

// Output del scheduler
interface SchedulerOutput {
  events: TimeEventItem[]
  unscheduled: UnscheduledItem[]
  tradeoffs?: Tradeoff[]
  metrics: SchedulerMetrics
}
```

### 3. Modelo MILP
**Archivo**: `src/lib/scheduler/milp-model.ts`

Variables de decisión:
- `x[a][s]` ∈ {0,1}: actividad `a` empieza en slot `s`

Constraints hard:
- No overlap: para cada slot, ∑ actividades que lo cubren ≤ 1
- Blocked slots: x[a][s] = 0 si slot s está bloqueado
- Duración: si x[a][s]=1, los slots s..s+dur deben estar libres

Soft constraints (como penalización en función objetivo):
- `soft_strong`: penalización alta si frecuencia < mínimo pedido
- `soft_weak`: penalización baja si no se respeta preferencia

Función objetivo: minimizar ∑ penalidades

### 4. Constraint Builder
**Archivo**: `src/lib/scheduler/constraint-builder.ts`

Traduce `SchedulerInput` → matrices/vectores que HiGHS entiende:
- Availability windows → slots habilitados
- Blocked slots → constraints hard
- Activity requests → variables + constraints de frecuencia
- Preferences → penalidades en función objetivo

### 5. Solver Wrapper
**Archivo**: `src/lib/scheduler/solver.ts`

```typescript
export async function solveSchedule(input: SchedulerInput): Promise<SchedulerOutput>
```

- Llama a `highs-js` con el modelo MILP construido
- Time limit: 3 segundos
- Si no encuentra óptimo, devuelve mejor solución encontrada
- Traduce solución numérica → `TimeEventItem[]`

### 6. Explainer (por qué no entró)
**Archivo**: `src/lib/scheduler/explainer.ts`

Cuando hay items `unscheduled`:
- Analizar qué constraint impide la colocación
- Generar `suggestion_esAR` abuela-proof ("¿Podrías hacer gym al mediodía en vez de a la noche?")
- Generar `tradeoffs` si hay alternativas (Plan A vs Plan B)

### 7. Tests
**Archivo**: `tests/pipeline-v5/scheduler.test.ts`

Escenarios de test:
1. **Caso simple**: 2 actividades, 2×/semana, sin conflictos → todo entra
2. **Overlap detection**: 3 actividades quieren el mismo horario → solver elige
3. **Soft constraints**: gym 4×/semana pero solo hay espacio para 3 → respetado como soft_strong
4. **No cabe nada**: agenda llena → unscheduled con explicación
5. **Trade-offs**: 2 actividades compiten por mismo slot → tradeoff generado
6. **Rest days**: running requiere 1 día descanso entre sesiones → respetado
7. **Performance**: 7 actividades × 3-5 sesiones → resuelve en <3 segundos

---

## Gates de calidad

- [ ] `npm run typecheck` pasa
- [ ] `npm run test` pasa (incluye tests de scheduler)
- [ ] Solver resuelve 7 actividades en <3 segundos
- [ ] No hay overlaps en ningún output
- [ ] Pipeline v1 sigue funcionando (0 archivos v1 modificados)
