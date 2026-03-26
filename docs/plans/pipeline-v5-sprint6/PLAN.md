# Pipeline V5 — Sprint 6: UX Final

> **Plan ID**: `pipeline-v5-sprint6`
> **Autor**: Claude Code
> **Fecha**: 2026-03-25
> **Spec de referencia**: `docs/architecture/PIPELINE_V5_SPEC.md` §7 Sprint 6
> **Prerequisito**: Sprint 5 completado (adaptador proactivo Beta-Bernoulli)

---

## Objetivo

Conectar el motor matemático del pipeline v5 (12 fases, MILP scheduler, adaptador proactivo) con la interfaz de usuario. El resultado es un dashboard multi-vista que permite al usuario **ver, entender y actuar** sobre su plan sin exponer ninguna jerga técnica.

---

## Restricciones heredadas

- **i18n**: Toda string visible usa `t('key')` con claves en `src/i18n/locales/es-AR.json`
- **Abuela-proof**: Cero jerga técnica (no LLM, no API, no JSON, no tokens, no MILP, no Beta-Bernoulli)
- **CSS Modules**: Estilo consistente con el proyecto (no Tailwind); usar design tokens de `globals.css`
- **Luxon**: Para toda lógica de fechas (no `new Date()`)
- **Zod `.strict()`**: Para schemas nuevos de API
- **Dark theme only**: Seguir la paleta existente (`--brand`, `--success`, `--warning`, etc.)
- **Server Components por defecto**: `'use client'` solo donde haga falta interactividad

---

## Arquitectura de datos (lo que la UI consume)

El punto de entrada principal es `PlanPackage` (output de Phase 11):

```
PlanPackage
├── plan: V5Plan
│   ├── skeleton   (12 semanas — fases, hitos, frecuencias)
│   ├── detail     (2-4 semanas — eventos día a día)
│   └── operational (7 días — time blocks + buffers)
├── items: PlanItem[]        (5 kinds: time_event, flex_task, milestone, metric, trigger_rule)
├── habitStates: HabitState[]
├── slackPolicy: SlackPolicy
├── summary_esAR: string
├── qualityScore: number
├── implementationIntentions: string[]
├── warnings: string[]
└── [scheduler.tradeoffs?: Tradeoff[]]
     └── planA / planB / question_esAR

AdaptiveOutput (Phase 12 — feedback loop)
├── mode: ABSORB | PARTIAL_REPAIR | REBASE
├── overallRisk: SAFE | AT_RISK | CRITICAL
├── assessments: AdaptiveAssessment[]  (por hábito: adherence, risk, failures)
├── recommendations: string[]
└── changesMade: string[]
```

---

## Tareas de implementación

### Tarea 1: API Route — Servir PlanPackage al frontend

**Archivo nuevo**: `app/api/plan/v5/package/route.ts`

**Qué hace**: Endpoint `GET` que devuelve el `PlanPackage` más reciente del usuario. Recibe `?planId=xxx` opcional.

**Contrato**:
```typescript
// GET /api/plan/v5/package?planId=xxx
// Response: { ok: true, data: PlanPackage } | { ok: false, error: string }
```

**Implementación**:
1. Importar tipos de `src/lib/pipeline/v5/phase-io-v5.ts`
2. Leer `PlanPackage` de la DB (o del store en memoria si aún no hay persistencia — en ese caso, devolver un mock representativo para desarrollo)
3. Zod response schema con `.strict()`
4. Manejo de errores estándar

**Nota**: Si la persistencia de `PlanPackage` en PostgreSQL no está lista, crear un **mock factory** en `src/lib/pipeline/v5/__mocks__/plan-package.mock.ts` que genere un `PlanPackage` realista para desarrollo UI. El mock debe tener: 3+ objetivos, 10+ time events, 2+ milestones, 2+ habits con adherencia variada, y al menos 1 tradeoff.

---

### Tarea 2: API Route — Servir AdaptiveOutput

**Archivo nuevo**: `app/api/plan/v5/adaptive/route.ts`

**Qué hace**: Endpoint `GET` que devuelve el último `AdaptiveOutput` para un plan.

**Contrato**:
```typescript
// GET /api/plan/v5/adaptive?planId=xxx
// Response: { ok: true, data: AdaptiveOutput | null } | { ok: false, error: string }
```

**Implementación**: Mismo patrón que Tarea 1. Si no hay adaptación aún, devolver `data: null`. Incluir mock para desarrollo.

---

### Tarea 3: Hook `usePlanV5` — Client-side data fetching

**Archivo nuevo**: `src/lib/client/use-plan-v5.ts`

**Qué hace**: Custom hook que carga `PlanPackage` y `AdaptiveOutput` para la UI.

```typescript
'use client'

interface UsePlanV5Result {
  package: PlanPackage | null
  adaptive: AdaptiveOutput | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function usePlanV5(planId?: string): UsePlanV5Result
```

**Implementación**:
1. `useEffect` con fetch a los dos endpoints de Tareas 1 y 2
2. State management con `useState`
3. `refetch` callback para refresh manual
4. Manejo de loading y error states

---

### Tarea 4: Componente `PlanDashboardV5` — Layout multi-vista

**Archivo nuevo**: `components/plan-v5/PlanDashboardV5.tsx` + `PlanDashboardV5.module.css`

**Qué hace**: Contenedor principal con tabs para alternar entre vistas.

**Vistas (tabs)**:
1. **Semana** — Vista operacional (7 días con bloques horarios) → Tarea 5
2. **Calendario** — Vista mensual con FullCalendar → Tarea 6
3. **Hábitos** — Tracker semáforo de adherencia → Tarea 7
4. **Progreso** — Milestones y métricas del plan → Tarea 8

**Estructura**:
```tsx
<div className={styles.dashboard}>
  <PlanSummaryBar package={pkg} adaptive={adaptive} />  {/* Tarea 9 */}
  <ViewTabs activeView={view} onChange={setView} />
  {view === 'week'     && <WeekView ... />}
  {view === 'calendar' && <CalendarView ... />}
  {view === 'habits'   && <HabitTracker ... />}
  {view === 'progress' && <ProgressView ... />}
</div>
```

**i18n keys requeridas** (agregar a `es-AR.json`):
```json
{
  "planV5": {
    "tabs": {
      "week": "Mi semana",
      "calendar": "Calendario",
      "habits": "Mis hábitos",
      "progress": "Mi progreso"
    },
    "loading": "Cargando tu plan...",
    "empty": "Todavía no tenés un plan activo. ¡Creá uno desde el inicio!",
    "error": "No pudimos cargar tu plan. Intentá de nuevo."
  }
}
```

**Directiva**: `'use client'` (maneja estado de tabs y datos).

---

### Tarea 5: Componente `WeekView` — Vista operacional semanal

**Archivo nuevo**: `components/plan-v5/WeekView.tsx` + `WeekView.module.css`

**Qué hace**: Muestra la capa operacional (7 días) como una grilla temporal con bloques de color.

**Datos de entrada**: `V5Operational` (de `plan.operational`) + `habitStates`

**Diseño**:
- 7 columnas (Lun-Dom), filas por hora (06:00–23:00)
- Cada `TimeEventItem` renderizado como bloque con:
  - Color por objetivo/goal (usar palette derivada de `--brand`)
  - Título truncado
  - Duración visual proporcional
  - Indicador de rigidez: borde sólido (hard) vs punteado (soft)
- Buffers (`OperationalBuffer`) renderizados como bloques tenues etiquetados según `kind`:
  - `slack` → "Tiempo libre"
  - `transition` → "Transición"
  - `recovery` → "Descanso"
  - `contingency` → "Reserva"
- Click en un evento abre un mini-detalle (tooltip o modal ligero) con:
  - Título completo
  - Hora inicio/fin
  - A qué objetivo pertenece
  - Si es flexible o fijo

**Interacción**: Solo lectura en esta iteración (no drag & drop).

**Fecha**: Usar `luxon` para formatear días y horas con locale `es-AR`.

---

### Tarea 6: Componente `CalendarView` — Vista mensual con FullCalendar

**Archivo nuevo**: `components/plan-v5/CalendarView.tsx` + `CalendarView.module.css`

**Qué hace**: Reutiliza `@fullcalendar/react` (ya instalado) para mostrar la capa de detalle en vista mensual/semanal.

**Datos de entrada**: `V5Detail` + `V5Skeleton` (milestones)

**Implementación**:
1. Mapear `TimeEventItem[]` de `detail.scheduledEvents` a FullCalendar events
2. Mapear `MilestoneItem[]` de `skeleton.milestones` como eventos all-day con icono de bandera
3. Color-coding por objetivo (mismo esquema que WeekView)
4. Vistas: `dayGridMonth` + `timeGridWeek` (toggle del propio FullCalendar)
5. Locale: `es` (FullCalendar soporta locale español)

**Reutilización**: Verificar si `components/PlanCalendar.tsx` existente se puede extender. Si su API es incompatible, crear uno nuevo pero reusar los estilos de `PlanCalendar.module.css` donde aplique.

---

### Tarea 7: Componente `HabitTracker` — Semáforo de adherencia

**Archivo nuevo**: `components/plan-v5/HabitTracker.tsx` + `HabitTracker.module.css`

**Qué hace**: Vista de semáforo por hábito. Es la vista más importante para la "psicología del fracaso".

**Datos de entrada**: `habitStates[]` + `AdaptiveOutput.assessments[]`

**Diseño por hábito** (card):
```
┌─────────────────────────────────────────┐
│ 🟢 Guitarra                    Nivel 3  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 85%       │
│ 4 de 5 sesiones esta semana             │
│ Racha: 3 semanas                        │
│                                         │
│ Tu versión mínima: "5 min de práctica"  │
│ ✨ Vas muy bien, seguí así              │
└─────────────────────────────────────────┘
```

**Lógica del semáforo** (colores):
- 🟢 `--success` (#6ed7a5): `risk === 'SAFE'` y `adherence.meanProbability >= 0.7`
- 🟡 `--warning` (#f2bf82): `risk === 'AT_RISK'` o `adherence.meanProbability` entre 0.4 y 0.7
- 🔴 `--danger` (definir ~#e57373): `risk === 'CRITICAL'` o `adherence.meanProbability < 0.4`

**Psicología del fracaso** (copy abuela-proof):
- Si el hábito baja de verde a amarillo: **"Esta semana costó un poco más. Tu versión mínima de [X min] cuenta igual."**
- Si baja a rojo: **"Tuviste una semana difícil, y eso es normal. No perdiste lo que construiste. Podés retomar con [versión mínima]."**
- Nunca usar "fallaste", "no cumpliste", "fracaso". Usar "costó más", "semana difícil", "podés retomar".
- Mostrar siempre el **Minimum Viable Habit** (de `habitState.currentDose.minimumViable`) como ancla de recuperación.
- Si `protectedFromReset === true`, mostrar: **"Llevás [N] semanas con este hábito. Eso no se pierde."**

**i18n keys**:
```json
{
  "planV5": {
    "habits": {
      "title": "Mis hábitos",
      "level": "Nivel {{level}}",
      "sessionsThisWeek": "{{done}} de {{total}} sesiones esta semana",
      "streak": "Racha: {{weeks}} semanas",
      "minimumViable": "Tu versión mínima: \"{{description}}\"",
      "safe": "Vas muy bien, seguí así",
      "atRisk": "Esta semana costó un poco más. Tu versión mínima de {{mvh}} cuenta igual.",
      "critical": "Tuviste una semana difícil, y eso es normal. No perdiste lo que construiste. Podés retomar con {{mvh}}.",
      "protected": "Llevás {{weeks}} semanas con este hábito. Eso no se pierde.",
      "lapseBanner": "Un tropezón no es una caída. Retomá desde tu versión mínima."
    }
  }
}
```

---

### Tarea 8: Componente `ProgressView` — Milestones y métricas

**Archivo nuevo**: `components/plan-v5/ProgressView.tsx` + `ProgressView.module.css`

**Qué hace**: Muestra el progreso macro del plan: milestones alcanzados, métricas, y la calidad general.

**Datos de entrada**: `PlanPackage.items` (filtrados por kind), `PlanPackage.qualityScore`, `skeleton.phases`

**Secciones**:

1. **Resumen del plan** — `summary_esAR` + `qualityScore` como barra visual (no como número crudo; ej: "Plan sólido ✓" si >70, "Plan ajustado" si 50-70, "Plan con riesgos" si <50)
2. **Fases del esqueleto** — Timeline horizontal de `skeleton.phases[]` con fase actual destacada
3. **Hitos** — Lista de `MilestoneItem[]` con checkbox visual de status (done/active/blocked)
4. **Métricas** — Para cada `MetricItem`, mostrar:
   - Nombre y valor actual vs target
   - Barra de progreso proporcional
   - Dirección (↑ ↓ →)
5. **Intenciones de implementación** — Lista de `implementationIntentions[]` como frases "Si [situación], entonces [acción]"
6. **Advertencias** — `warnings[]` como banners amarillos suaves

---

### Tarea 9: Componente `PlanSummaryBar` — Barra de estado global

**Archivo nuevo**: `components/plan-v5/PlanSummaryBar.tsx` + `PlanSummaryBar.module.css`

**Qué hace**: Barra compacta en la parte superior del dashboard que muestra el estado general de un vistazo.

**Contenido**:
- Nombre del plan o resumen corto
- Semáforo global: indicador de color basado en `adaptive.overallRisk` (o SAFE si no hay adaptación)
- Si hay adaptación activa, mostrar el modo en lenguaje humano:
  - `ABSORB` → "Todo bajo control"
  - `PARTIAL_REPAIR` → "Ajustando algunas cosas"
  - `REBASE` → "Reorganizando tu plan"
- Botón "Ver cambios" si `adaptive.changesMade.length > 0`

---

### Tarea 10: Componente `TradeoffDialog` — Explicación de conflictos

**Archivo nuevo**: `components/plan-v5/TradeoffDialog.tsx` + `TradeoffDialog.module.css`

**Qué hace**: Modal/dialog que presenta trade-offs del scheduler al usuario de forma abuela-proof.

**Datos de entrada**: `Tradeoff[]` del `SchedulerOutput`

**Diseño por tradeoff**:
```
┌──────────────────────────────────────────────┐
│  No entra todo en tu semana.                 │
│  Elegí qué preferís:                         │
│                                              │
│  ┌──────────────┐   ┌──────────────┐         │
│  │  Opción A    │   │  Opción B    │         │
│  │  Gym 4 veces │   │  Gym 3 veces │         │
│  │  sin inglés  │   │  + inglés    │         │
│  │  el viernes  │   │  el viernes  │         │
│  │   [Elegir]   │   │   [Elegir]   │         │
│  └──────────────┘   └──────────────┘         │
│                                              │
│  "¿Preferís mantener las 4 sesiones de gym   │
│   o hacer 3 y sumar inglés el viernes?"      │
└──────────────────────────────────────────────┘
```

**Fuente de texto**: Cada `Tradeoff` ya tiene `planA.description_esAR`, `planB.description_esAR`, y `question_esAR` generados por el backend.

**Comportamiento**: Las opciones seleccionadas se guardan y se reenvían al pipeline (alcance futuro — en esta iteración, solo mostrar la UI y loguear la selección a console).

---

### Tarea 11: Componente `AdaptiveChangesPanel` — Cambios del adaptador

**Archivo nuevo**: `components/plan-v5/AdaptiveChangesPanel.tsx` + `AdaptiveChangesPanel.module.css`

**Qué hace**: Panel expandible que muestra qué cambió el adaptador y por qué.

**Datos de entrada**: `AdaptiveOutput`

**Diseño**:
- Header: modo de adaptación en lenguaje humano (ver Tarea 9)
- Lista de `recommendations[]` como sugerencias amigables
- Lista de `changesMade[]` como "lo que ajustamos"
- Por cada `assessment` con `risk !== 'SAFE'`:
  - Nombre del hábito
  - Explicación del ajuste sugerido (de `activityAdjustments`)
  - Si hay MVH sugerido, mostrarlo como opción de recuperación

**i18n keys**:
```json
{
  "planV5": {
    "adaptive": {
      "title": "Ajustes a tu plan",
      "absorb": "Todo bajo control — no hace falta cambiar nada.",
      "partialRepair": "Hicimos algunos ajustes para que tu semana funcione mejor.",
      "rebase": "Reorganizamos tu plan para adaptarlo a los cambios.",
      "recommendations": "Sugerencias",
      "changes": "Lo que ajustamos",
      "noChanges": "No hubo cambios esta semana."
    }
  }
}
```

---

### Tarea 12: Integración con routing de la app

**Archivo nuevo**: `app/plan/v5/page.tsx`

**Qué hace**: Página de Next.js que monta `PlanDashboardV5`.

```tsx
// Server Component
import { PlanDashboardV5 } from '@/components/plan-v5/PlanDashboardV5'

export default function PlanV5Page() {
  return <PlanDashboardV5 />
}
```

**Metadata**: Usar i18n para el title.

---

### Tarea 13: Actualizar i18n — Agregar todas las claves

**Archivo a editar**: `src/i18n/locales/es-AR.json`

Agregar el bloque completo `planV5` con todas las claves definidas en Tareas 4, 7, 8, 9, 10, 11. Ver cada tarea para las claves exactas.

**Claves adicionales de UI general**:
```json
{
  "planV5": {
    "quality": {
      "solid": "Plan sólido",
      "tight": "Plan ajustado",
      "risky": "Plan con riesgos"
    },
    "tradeoff": {
      "title": "No entra todo en tu semana",
      "choose": "Elegí qué preferís:",
      "optionA": "Opción A",
      "optionB": "Opción B",
      "select": "Elegir"
    },
    "bufferKind": {
      "slack": "Tiempo libre",
      "transition": "Transición",
      "recovery": "Descanso",
      "contingency": "Reserva"
    },
    "rigidity": {
      "hard": "Fijo",
      "soft": "Flexible"
    },
    "milestone": {
      "done": "Completado",
      "active": "En curso",
      "blocked": "Bloqueado",
      "waiting": "Pendiente"
    }
  }
}
```

---

### Tarea 14: Tests — Componentes y hooks

**Archivos nuevos**:
- `tests/plan-v5/use-plan-v5.test.ts` — Test del hook con fetch mockeado
- `tests/plan-v5/habit-tracker.test.tsx` — Test de lógica de semáforo y copy psicológico
- `tests/plan-v5/tradeoff-dialog.test.tsx` — Test de renderizado de trade-offs
- `tests/plan-v5/week-view.test.tsx` — Test de mapeo de eventos a grilla

**Criterios**:
- El semáforo asigna colores correctos según risk + adherence
- El copy psicológico nunca contiene "fallaste", "no cumpliste", "fracaso"
- Los trade-offs renderizan ambas opciones con el texto del backend
- La WeekView coloca bloques en el slot horario correcto

---

## Orden de ejecución recomendado

```
Fase A — Datos (parallelizable)
  ├── Tarea 1: API route PlanPackage
  ├── Tarea 2: API route AdaptiveOutput
  └── Tarea 13: i18n keys

Fase B — Infraestructura UI
  ├── Tarea 3: Hook usePlanV5
  └── Tarea 4: PlanDashboardV5 layout + tabs

Fase C — Vistas (parallelizable)
  ├── Tarea 5: WeekView
  ├── Tarea 6: CalendarView
  ├── Tarea 7: HabitTracker (+ psicología del fracaso)
  └── Tarea 8: ProgressView

Fase D — Interacciones
  ├── Tarea 9: PlanSummaryBar
  ├── Tarea 10: TradeoffDialog
  └── Tarea 11: AdaptiveChangesPanel

Fase E — Integración
  ├── Tarea 12: Routing (app/plan/v5/page.tsx)
  └── Tarea 14: Tests
```

---

## Gate de cierre

- [x] `npm run typecheck` pasa
- [x] `npm run test` pasa (incluyendo tests nuevos de Tarea 14)
- [x] Evidencia visible: captura del dashboard con las 4 vistas renderizando datos mock
- [x] Cero strings hardcodeadas en UI (todo via `t()`)
- [x] Cero jerga tecnica visible al usuario
- [x] Copy psicologico validado (no "fallaste", no "fracaso", siempre hay MVH visible)
- [x] FullCalendar muestra eventos coloreados por objetivo
- [x] Semaforo asigna colores correctos en los 3 rangos de adherencia
- [x] Trade-offs se muestran como opciones A/B sin jerga

---

## Notas técnicas

1. **Mock-first**: Si la persistencia de PlanPackage en PostgreSQL no existe aún, usar mocks realistas. La UI no debe bloquearse esperando DB.
2. **Build global**: El build global tiene deuda preexistente fuera del scope de este sprint (igual que Sprint 5). El gate es `typecheck` + `test`, no `build` completo.
3. **No drag & drop**: La WeekView es solo lectura en esta iteración. El reordenamiento interactivo es scope de un sprint futuro.
4. **No persistencia de selección de tradeoffs**: En esta iteración, los trade-offs se muestran pero la selección solo se loguea. El ciclo completo (selección → re-run pipeline) es scope futuro.
