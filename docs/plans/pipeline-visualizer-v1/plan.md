# Pipeline Visualizer — Plan de Implementación

> **Para el agente implementador:** Leer primero `.agent/skills/multiagent-coordinator/SKILL.md`.
> Usar la skill `plan-executor` (Codex) o `plan-reviewer` (Antigravity) según corresponda.

**Plan ID:** pipeline-visualizer-v1
**Goal:** Crear un componente visual que muestre en tiempo real en qué fase del pipeline v6 está la generación de un plan, inspirado en el diagrama build-flow.mmd
**Arquitectura:** Componente React client-side que consume los eventos SSE existentes (`v6:phase`, `v6:progress`, `v6:needs_input`, `v6:degraded`, `v6:complete`) y renderiza un mapa visual de las 10 fases con la fase activa resaltada, progreso, estado de cada fase, y notificaciones. Se integra dentro del flujo de build existente sin modificar el backend.
**Stack relevante:** React 19, Framer Motion, CSS Modules, Tailwind CSS, i18n (es-AR), tipos de `src/lib/pipeline/v6/types.ts`
**Prioridad:** high
**Tags:** [ui, pipeline, visualizer, ux]

---

## Archivos involucrados

| Acción | Ruta | Responsabilidad |
|--------|------|-----------------|
| Crear | `components/pipeline-visualizer/PipelineVisualizer.tsx` | Componente principal del visualizador |
| Crear | `components/pipeline-visualizer/PipelineVisualizer.module.css` | Estilos del visualizador |
| Crear | `components/pipeline-visualizer/PipelinePhaseNode.tsx` | Nodo individual de cada fase |
| Crear | `components/pipeline-visualizer/PipelineConnector.tsx` | Conectores/flechas entre fases |
| Crear | `components/pipeline-visualizer/PipelineNotificationBar.tsx` | Barra de notificaciones (eventos al navegador) |
| Crear | `components/pipeline-visualizer/use-pipeline-state.ts` | Hook que mapea callbacks SSE a estado del visualizador |
| Crear | `components/pipeline-visualizer/pipeline-visualizer-types.ts` | Tipos locales del visualizador |
| Modificar | `src/i18n/locales/es-AR.json` | Agregar claves i18n para las 10 fases y estados |
| Modificar | `src/i18n/index.ts` | Registrar nuevas claves si es necesario |
| Crear | `tests/pipeline-visualizer.test.tsx` | Tests unitarios del visualizador |
| Crear | `tests/use-pipeline-state.test.ts` | Tests del hook de estado |

---

## Diseño visual

El visualizador replica la estructura del diagrama `build-flow.mmd` como componente interactivo:

```
┌─────────────────────────────────────────────────────────────┐
│  👤 USUARIO                                                  │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────┐   │
│  │ Define meta   │  │ Responde pregs  │  │ Revisa plan  │   │
│  └──────────────┘  └─────────────────┘  └──────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  ⚙️ MOTOR DE GENERACIÓN              Progreso: ████░░ 65%   │
│                                                              │
│  ○ Interpretar  →  ● Clarificar  →  ○ Planificar  →  ...   │
│     10%              25% ⏳           40%                    │
│                    (esperando                                │
│                     respuestas)                              │
│                                                              │
│  ... →  ○ Verificar  →  ○ Agendar  →  ○ Criticar  →  ...  │
│            50%            65%           80%                   │
│                                                              │
│  ... →  ○ Revisar  →  ○ Empaquetar  →  ○ Listo / ✕ Fallo  │
│            70%           95%             100%                 │
├─────────────────────────────────────────────────────────────┤
│  📡 NOTIFICACIONES                                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ⏳ Clarificando: necesito tus respuestas para avanzar│   │
│  └──────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  💾 DATOS                                                    │
│  Sesión: pausada ● | Plan: pendiente ○                      │
└─────────────────────────────────────────────────────────────┘
```

### Estados visuales de cada fase

| Estado | Estilo | Icono |
|--------|--------|-------|
| `pending` | Gris, borde tenue | ○ círculo vacío |
| `active` | `--brand` (#69a7ff), pulso animado | ● círculo lleno + pulso |
| `waiting` | `--warning` (#f2bf82), parpadeo suave | ⏳ reloj |
| `completed` | `--success` (#6ed7a5), check | ✓ check |
| `failed` | Rojo, cross | ✕ cross |
| `skipped` | Gris claro, dash | — dash |
| `degraded` | `--warning`, triángulo | ⚠ advertencia |

### Colores de subgraphs (consistentes con build-flow.mmd)

| Sección | Fondo | Borde |
|---------|-------|-------|
| Usuario | `#f3e8fd` / `rgba(243,232,253,0.1)` dark | `#9334e6` |
| Motor de generación | `#e8f0fe` / `rgba(232,240,254,0.08)` dark | `#1a73e8` |
| Notificaciones | `#fef7e0` / `rgba(254,247,224,0.08)` dark | `#f9ab00` |
| Datos | `#e6f4ea` / `rgba(230,244,234,0.08)` dark | `#1e8e3e` |

---

## Tareas

### Tarea 1: Tipos y constantes del visualizador

**Archivos:**
- Crear: `components/pipeline-visualizer/pipeline-visualizer-types.ts`

- [ ] **Paso 1.1:** Definir tipo `PhaseNodeStatus` con los 7 estados: `pending | active | waiting | completed | failed | skipped | degraded`

- [ ] **Paso 1.2:** Definir tipo `PhaseNodeData` que mapee cada fase del pipeline a datos visuales:
  ```typescript
  interface PhaseNodeData {
    phase: OrchestratorPhase       // de src/lib/pipeline/v6/types.ts
    labelKey: string               // clave i18n (ej: 'visualizer.phase.interpret')
    targetProgress: number         // 10, 25, 40, 50, 65, 80, 70, 95, 100, 0
    status: PhaseNodeStatus
    agentName: V6AgentName | null  // agente asociado
    iteration?: number             // ronda actual si hay loop
    maxIterations?: number         // máximo de rondas (3 para clarify, 2 para revise)
  }
  ```

- [ ] **Paso 1.3:** Definir tipo `PipelineVisualizerState` completo:
  ```typescript
  interface PipelineVisualizerState {
    phases: PhaseNodeData[]
    currentPhase: OrchestratorPhase | null
    progressScore: number          // 0-100
    lastAction: string
    lifecycle: 'idle' | 'running' | 'paused_for_input' | 'completed' | 'failed'
    sessionId: string | null       // para resume
    degraded: boolean
    notifications: VisualizerNotification[]
    storage: {
      sessionSaved: boolean
      planSaved: boolean
    }
  }
  ```

- [ ] **Paso 1.4:** Definir constante `PHASE_ORDER` con las 10 fases en orden, sus progress targets y agentes asociados. Importar `OrchestratorPhase` y `V6AgentName` de `src/lib/pipeline/v6/types.ts`.
  Verificación: `npx tsc --noEmit components/pipeline-visualizer/pipeline-visualizer-types.ts` — sin errores

### Tarea 2: Hook `usePipelineState`

**Archivos:**
- Crear: `components/pipeline-visualizer/use-pipeline-state.ts`

- [ ] **Paso 2.1:** Crear hook `usePipelineState()` que retorne `PipelineVisualizerState` y exponga métodos para recibir eventos SSE. El hook implementa la interfaz `PlanStreamCallbacks` de `src/lib/client/plan-client.ts`:
  ```typescript
  export function usePipelineState(): {
    state: PipelineVisualizerState
    callbacks: PlanStreamCallbacks
    reset: () => void
  }
  ```

- [ ] **Paso 2.2:** Implementar `onPhase(phase, iteration)`:
  - Marcar fase anterior como `completed` (o `degraded` si hubo fallback)
  - Marcar fase nueva como `active`
  - Detectar loops: si `phase === 'clarify'` e `iteration > 0` → incrementar ronda
  - Detectar loops: si `phase === 'revise'` → incrementar ciclo de revisión
  - Actualizar `currentPhase` y `lifecycle: 'running'`

- [ ] **Paso 2.3:** Implementar `onProgress(score, lastAction)`:
  - Actualizar `progressScore` y `lastAction`
  - Si score baja (ej: 80→70 al entrar en revise) el progreso visual no debe retroceder bruscamente — usar animación suave

- [ ] **Paso 2.4:** Implementar `onNeedsInput(sessionId, questions)`:
  - Marcar fase `clarify` como `waiting`
  - Guardar `sessionId`
  - Actualizar `lifecycle: 'paused_for_input'`
  - Push notificación: "Necesito tus respuestas para continuar"
  - Actualizar `storage.sessionSaved: true`

- [ ] **Paso 2.5:** Implementar `onDegraded(data)`:
  - Marcar `degraded: true`
  - Marcar agentes fallidos en sus fases correspondientes con status `degraded`
  - Push notificación: "Plan generado con limitaciones"

- [ ] **Paso 2.6:** Implementar `onComplete(planId, score, iterations)`:
  - Marcar todas las fases restantes como `completed` o `skipped`
  - Marcar `done` como `completed`
  - Actualizar `lifecycle: 'completed'`
  - Actualizar `storage.planSaved: true`
  - Push notificación: "Plan completado"

- [ ] **Paso 2.7:** Implementar `onError(message)`:
  - Marcar fase actual como `failed`
  - Marcar `failed` phase node como `failed`
  - Actualizar `lifecycle: 'failed'`
  - Push notificación con el error

  Verificación: `npm run typecheck` — sin errores

### Tarea 3: Componente `PipelinePhaseNode`

**Archivos:**
- Crear: `components/pipeline-visualizer/PipelinePhaseNode.tsx`

- [ ] **Paso 3.1:** Crear componente que renderice un nodo de fase individual. Props:
  ```typescript
  interface PipelinePhaseNodeProps {
    data: PhaseNodeData
    isCurrent: boolean
  }
  ```

- [ ] **Paso 3.2:** Renderizar:
  - Icono de estado (○ / ● / ⏳ / ✓ / ✕ / — / ⚠) con color correspondiente
  - Label traducido vía i18n (`t(data.labelKey)`)
  - Porcentaje target (ej: "25%")
  - Si tiene loops (clarify/revise): mostrar "ronda 2/3" o "ciclo 1/2"

- [ ] **Paso 3.3:** Animar con Framer Motion:
  - `active`: escala 1.05 + pulso suave en el borde (`boxShadow` animado)
  - `waiting`: parpadeo suave (`opacity` animada entre 0.6 y 1)
  - `completed`: entrada del check con `scale` spring
  - Transición entre estados: `spring { stiffness: 400, damping: 30 }`

  Verificación: `npm run typecheck` — sin errores

### Tarea 4: Componente `PipelineConnector`

**Archivos:**
- Crear: `components/pipeline-visualizer/PipelineConnector.tsx`

- [ ] **Paso 4.1:** Crear componente de flecha/conector entre fases. Props:
  ```typescript
  interface PipelineConnectorProps {
    fromStatus: PhaseNodeStatus
    toStatus: PhaseNodeStatus
    isLoopBack?: boolean   // para clarify→clarify y critique→revise
    label?: string         // "máx 3 rondas", "encontró problemas", etc.
  }
  ```

- [ ] **Paso 4.2:** Renderizar:
  - Línea horizontal con flecha (→) para flujo normal
  - Línea curva para loops (clarify→clarify, critique↔revise)
  - Color: gris si pendiente, `--brand` si activo/pasado, `--warning` si loop activo
  - Label opcional sobre la flecha (texto pequeño, i18n)

- [ ] **Paso 4.3:** Animar: la línea se "llena" progresivamente cuando la fase origen se completa (Framer Motion `pathLength` o width transition).

  Verificación: `npm run typecheck` — sin errores

### Tarea 5: Componente `PipelineNotificationBar`

**Archivos:**
- Crear: `components/pipeline-visualizer/PipelineNotificationBar.tsx`

- [ ] **Paso 5.1:** Crear componente que muestre la notificación más reciente. Props:
  ```typescript
  interface PipelineNotificationBarProps {
    notifications: VisualizerNotification[]
  }
  ```

- [ ] **Paso 5.2:** Renderizar:
  - Último mensaje con icono de tipo (info/warning/success/error)
  - Colores del subgraph de notificaciones (`--f9ab00` borde)
  - AnimatePresence para entrada/salida suave del mensaje

- [ ] **Paso 5.3:** Historial colapsable: click/tap para ver notificaciones anteriores.

  Verificación: `npm run typecheck` — sin errores

### Tarea 6: Componente principal `PipelineVisualizer`

**Archivos:**
- Crear: `components/pipeline-visualizer/PipelineVisualizer.tsx`
- Crear: `components/pipeline-visualizer/PipelineVisualizer.module.css`

- [ ] **Paso 6.1:** Crear componente contenedor `'use client'`. Props:
  ```typescript
  interface PipelineVisualizerProps {
    callbacks: PlanStreamCallbacks  // se pasan al flujo de build
    state: PipelineVisualizerState  // del hook usePipelineState
  }
  ```

- [ ] **Paso 6.2:** Layout en 4 secciones (replicando build-flow.mmd):

  **Sección 1 — Usuario** (fondo purple tenue):
  - 3 nodos estáticos: "Define meta", "Responde preguntas", "Revisa plan"
  - El nodo activo se resalta según `lifecycle`:
    - `idle` → "Define meta" activo
    - `paused_for_input` → "Responde preguntas" activo
    - `completed` → "Revisa plan" activo

  **Sección 2 — Motor de generación** (fondo blue tenue):
  - Barra de progreso global arriba: `progressScore`% con `lastAction`
  - Grid de los 10 `PipelinePhaseNode` conectados por `PipelineConnector`
  - Layout en 2 filas para pantallas anchas, 1 columna vertical para mobile:
    ```
    Fila 1: interpret → clarify → plan → check → schedule
    Fila 2: critique → revise → package → done / failed
    ```
  - Loops visibles: arco de clarify a sí mismo, arco de critique↔revise

  **Sección 3 — Notificaciones** (fondo yellow tenue):
  - `PipelineNotificationBar`

  **Sección 4 — Datos** (fondo green tenue):
  - 2 indicadores: "Sesión: guardada/pendiente" y "Plan: guardado/pendiente"

- [ ] **Paso 6.3:** CSS Module con:
  - Variables de color de cada sección (tomadas de build-flow.mmd, adaptadas a dark mode)
  - Responsive: grid 2 filas en desktop, columna en mobile (`< 640px`)
  - Transiciones suaves entre secciones

- [ ] **Paso 6.4:** Mobile-first: en viewport chico, las fases se muestran como lista vertical con conectores simplificados (sin curvas).

  Verificación: `npm run typecheck` — sin errores

### Tarea 7: Claves i18n

**Archivos:**
- Modificar: `src/i18n/locales/es-AR.json`

- [ ] **Paso 7.1:** Agregar claves bajo `"visualizer"`:
  ```json
  "visualizer": {
    "title": "Estado de la generación",
    "section_user": "Usuario",
    "section_engine": "Motor de generación",
    "section_notifications": "Notificaciones",
    "section_storage": "Datos",
    "user_define_goal": "Define meta de vida",
    "user_answer_questions": "Responde preguntas",
    "user_review_plan": "Revisa y acepta plan",
    "phase": {
      "interpret": "Interpretar meta",
      "clarify": "Clarificar",
      "plan": "Planificar estrategia",
      "check": "Verificar viabilidad",
      "schedule": "Armar agenda",
      "critique": "Criticar plan",
      "revise": "Revisar y mejorar",
      "package": "Empaquetar resultado",
      "done": "Listo",
      "failed": "Fallo"
    },
    "status": {
      "pending": "Pendiente",
      "active": "En curso",
      "waiting": "Esperando respuestas",
      "completed": "Completado",
      "failed": "Falló",
      "skipped": "Omitido",
      "degraded": "Con limitaciones"
    },
    "connector": {
      "max_clarify_rounds": "máx {{max}} rondas",
      "max_revision_cycles": "máx {{max}} ciclos",
      "found_issues": "encontró problemas",
      "approved": "aprobado",
      "needs_answers": "necesita respuestas",
      "pause": "pausa",
      "resume": "retoma",
      "partial_ai": "IA parcial",
      "quality_insufficient": "calidad insuficiente"
    },
    "notification": {
      "needs_input": "Necesito tus respuestas para continuar",
      "degraded": "Plan generado con limitaciones",
      "completed": "¡Plan completado!",
      "failed": "La generación falló",
      "phase_change": "Avanzando a: {{phase}}"
    },
    "storage": {
      "session_label": "Sesión",
      "plan_label": "Plan",
      "saved": "guardado",
      "pending": "pendiente"
    },
    "progress": "Progreso: {{score}}%",
    "last_action": "{{action}}"
  }
  ```
  Verificación: `npm run typecheck` — sin errores por claves faltantes

### Tarea 8: Integración con el flujo de build existente

**Archivos:**
- Modificar: `app/plan/page.tsx` (o el componente que inicia el build)

- [ ] **Paso 8.1:** Identificar dónde se invoca `startPlanBuild()` / `consumeSseStream()` actualmente. El punto de integración es donde se pasan los `PlanStreamCallbacks`.

- [ ] **Paso 8.2:** Instanciar `usePipelineState()` en el componente padre del build.

- [ ] **Paso 8.3:** Pasar `state.callbacks` como los callbacks del stream SSE y `state` al `<PipelineVisualizer>`.

- [ ] **Paso 8.4:** El visualizador debe aparecer durante todo el proceso de build y permanecer visible después de completar (con estado final).

  Verificación: `npm run build` — sin errores. Verificar manualmente que el componente se renderiza.

### Tarea 9: Tests y verificación

**Archivos:**
- Crear: `tests/pipeline-visualizer.test.tsx`
- Crear: `tests/use-pipeline-state.test.ts`

- [ ] **Paso 9.1:** Tests del hook `usePipelineState`:
  - Estado inicial: todas las fases `pending`, lifecycle `idle`, progressScore 0
  - `onPhase('interpret', 0)` → interpret `active`, lifecycle `running`
  - `onPhase('clarify', 0)` → interpret `completed`, clarify `active`
  - `onNeedsInput(...)` → clarify `waiting`, lifecycle `paused_for_input`
  - `onPhase('clarify', 1)` después de resume → clarify `active`, ronda incrementada
  - `onProgress(40, 'Planificando')` → progressScore 40, lastAction actualizado
  - `onDegraded(...)` → degraded true, agentes marcados
  - `onComplete(...)` → done `completed`, lifecycle `completed`, planSaved true
  - `onError(...)` → fase actual `failed`, lifecycle `failed`

- [ ] **Paso 9.2:** Tests del componente `PipelineVisualizer`:
  - Renderiza las 4 secciones
  - Muestra las 10 fases con labels i18n
  - Fase activa tiene clase CSS correspondiente
  - Barra de progreso muestra porcentaje correcto
  - Notificación aparece cuando hay `needs_input`

- [ ] **Paso 9.3:** Test de accesibilidad básico:
  - Todas las fases tienen `aria-label` con nombre y estado
  - Barra de progreso tiene `role="progressbar"` con `aria-valuenow`
  - Notificaciones tienen `role="alert"`

- [ ] **Paso 9.4:** Correr `npm run test` y `npm run typecheck`.

  Verificación: todos los tests pasan, typecheck limpio
