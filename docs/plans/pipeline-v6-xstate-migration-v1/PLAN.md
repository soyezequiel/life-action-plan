# Plan: Migracion del motor de generacion v6 a XState

> **Objetivo**: mover el control de flujo del motor de generacion `v6` a una maquina de estados explicita con `XState v5`, sin romper los contratos externos actuales de rutas, SSE, snapshot ni `PlanPackage` compatible con `v5`.
> **Base arquitectonica**: `docs/architecture/PIPELINE_V6_SPEC.md`, `app/api/plan/build/route.ts`, `app/api/plan/build/resume/route.ts`, `src/lib/pipeline/v6/orchestrator.ts`, `src/lib/pipeline/v6/state-machine.ts`, `src/lib/pipeline/v6/types.ts`.
> **Criterio rector**: migracion incremental con adaptador de compatibilidad. Primero se centraliza el flujo; despues se simplifican los bordes.
> **Nota de alcance**: el skill `react-state-machines` no estuvo disponible en esta sesion. Este plan cubre el uso de `xstate` en el runtime server-side. `@xstate/react` queda fuera de fase 1 salvo que aparezca una necesidad concreta en UI.

## Diagnostico actual

Hoy el motor `v6` ya se comporta como una maquina de estados, pero la implementacion real esta partida en varios lugares:

1. `src/lib/pipeline/v6/state-machine.ts`
   Declara estados, transiciones base y el score de progreso por fase.

2. `src/lib/pipeline/v6/orchestrator.ts`
   Ejecuta el loop real, mantiene el contexto, aplica guards adicionales, pausa por input, registra outcomes, fuerza cierres, resuelve publication gate y arma el resultado final.

3. `app/api/plan/build/route.ts` y `app/api/plan/build/resume/route.ts`
   Agregan preflight, SSE, persistencia de sesion, persistencia del plan y errores terminales.

El problema no es que falte una maquina de estados, sino que hoy no hay una unica fuente de verdad ejecutable para:

- transiciones reales
- eventos que disparan transiciones
- guards
- estados terminales
- pausa y resume
- relacion entre fase interna y contrato SSE

Consecuencias actuales:

- la spec y el runtime pueden divergir
- el resume y el skip de aclaracion no quedan modelados de forma explicita
- publication gate y terminal failure viven fuera del mapa de transiciones base
- el `orchestrator.ts` mezcla control de flujo con side effects
- testear la logica del flujo completo obliga a recorrer mucha infraestructura junta

## Objetivo tecnico

La migracion debe dejar una arquitectura donde:

- `XState` sea la fuente de verdad de estados, eventos, guards y estados terminales
- los agentes de cada fase queden como actores o servicios invocados por la maquina
- SSE, persistencia de sesion y persistencia final del plan queden como side effects externos o acciones bien delimitadas
- `PlanOrchestrator` siga existiendo al principio como adaptador para no romper rutas, tests y cliente
- el contrato externo se mantenga estable mientras la implementacion interna cambia

## No objetivos

Este plan no busca:

- redisenar la UX del flow
- cambiar el contrato SSE publico
- cambiar el formato persistido de `PlanPackage` o el visor `/plan/v5`
- meter `@xstate/react` en el frontend sin una necesidad clara
- reescribir agentes o prompts por separado
- cambiar wallet, auth, billing o flujo hibrido

## Decision de migracion

Se adopta `xstate` **v5** solo para el runtime del motor `v6`.

La estrategia elegida es:

1. modelar primero la maquina real actual
2. envolverla en un adaptador compatible con `PlanOrchestrator`
3. mantener los bordes existentes (`build`, `resume`, SSE, snapshot, package`)
4. recien despues simplificar el `orchestrator` legado

No conviene un rewrite directo porque hoy el motor tiene varias valvulas de seguridad y terminal states que no estan todas en un solo archivo.

## Mapa objetivo de estados

La maquina objetivo debe reflejar los nombres visibles del producto y sus ids internos actuales.

| Nombre visible | Id interno actual | Tipo |
| --- | --- | --- |
| `Interpretar meta` | `interpret` | fase activa |
| `Clarificar` | `clarify` | fase activa |
| `Planificar estrategia` | `plan` | fase activa |
| `Verificar viabilidad` | `check` | fase activa |
| `Armar agenda semanal` | `schedule` | fase activa |
| `Criticar el plan` | `critique` | fase activa |
| `Revisar y mejorar` | `revise` | fase activa |
| `Empaquetar resultado` | `package` | fase activa |
| `Listo` | `done` | terminal exitosa |
| `Fallo` | `failed` | terminal fallida |
| `Pausado esperando respuestas` | hoy implicito | estado explicito nuevo |
| `Bloqueado para publicar` | hoy implicito por gate | estado explicito nuevo |

### Decision importante

`blocked` no debe seguir siendo solo un calculo posterior al empaquetado. En la migracion a XState debe existir como estado terminal explicito del runtime.

## Eventos objetivo

La maquina debe exponer y consumir eventos explicitos. Minimo:

- `BUILD_STARTED`
- `PHASE_COMPLETED`
- `PHASE_FAILED`
- `ANSWERS_SUBMITTED`
- `INPUT_SKIPPED`
- `FORCE_FINISH`
- `PUBLICATION_READY`
- `PUBLICATION_BLOCKED`
- `PUBLICATION_FAILED`
- `SESSION_RESTORED`

Los nombres pueden ajustarse en implementacion, pero el criterio es que no haya mutaciones escondidas que cambien el flujo sin pasar por un evento.

## Contexto objetivo de la maquina

La maquina debe contener en `context` lo que hoy se reparte entre `state`, `context`, `pendingAnswers`, `progressHistory`, `agentOutcomes` y `debugTrace`.

Minimo:

- request original
- goal text
- perfil resumido y contexto de agenda
- resultados por fase
- respuestas del usuario
- preguntas pendientes
- clarify rounds
- revision cycles
- progress history
- token budget
- agent outcomes
- debug trace
- publication decision
- terminal state

## Frontera propuesta: estado vs side effects

### Va dentro de la maquina

- estados
- eventos
- guards
- contadores de iteracion, clarify y revise
- decision de siguiente fase
- deteccion de pause
- deteccion de force finish
- evaluacion de publication state
- transicion a `done`, `failed` o `blocked`

### Queda fuera de la maquina

- IO con DB
- creacion de `interactive_session`
- persistencia del plan final
- serializacion SSE
- timers de heartbeat y progress
- preflight del provider
- traduccion entre nombres internos y payloads externos

### Va en actores o servicios invocados

- `goal-interpreter`
- `clarifier`
- `planner`
- `feasibility-checker`
- `scheduler`
- `critic`
- `packager`
- `domain-expert`

## Inconsistencias actuales que el plan debe resolver

Antes de congelar la maquina hay que decidir dos puntos donde hoy el repo no esta del todo alineado:

### 1. `resume` con `answers = {}`

La spec vigente dice que salta directo a `plan`, pero el runtime actual parece volver a quedar pausado en `clarify`.

La migracion debe elegir una de estas dos opciones y testearla:

- preservar el comportamiento real actual
- corregir el runtime para alinearlo con la spec

No debe quedar ambiguo despues de migrar.

### 2. `degraded_skip` y `clarificationSkipRequested`

Hoy existe estructura para `degraded_skip`, pero el camino publico no queda claramente expuesto como evento formal.

La migracion debe decidir:

- o se convierte en evento real (`INPUT_SKIPPED`)
- o se elimina como rama muerta

## Plan de implementacion

### Etapa 1. Congelar el contrato actual antes de migrar

**Objetivo**: fijar paridad funcional antes de tocar el motor.

**Archivos**:
- `tests/pipeline/`
- `tests/plan-build-resume-route.test.ts`
- `src/lib/pipeline/v6/orchestrator.ts`
- `src/lib/pipeline/v6/state-machine.ts`

**Tareas**:
- agregar o ajustar tests que documenten las transiciones actuales por fase
- capturar el comportamiento real de `resume`
- capturar publication outcomes: `ready`, `blocked`, `failed`
- cubrir force finish por iteraciones, token budget y stalled progress
- dejar claro que SSE y resultado final son contratos a preservar

**Resultado esperado**:
- matriz minima de regresion que permita migrar sin trabajar a ciegas

### Etapa 2. Introducir XState v5 sin mover todavia las rutas

**Objetivo**: sumar la dependencia y modelar la maquina sin cambiar el borde publico.

**Archivos**:
- `package.json`
- nuevo directorio `src/lib/pipeline/v6/xstate/`

**Tareas**:
- agregar `xstate`
- crear tipos propios para contexto, eventos y estados de la maquina
- crear una primera maquina que replique el mapa actual de fases
- mantener el `orchestrator` actual como referencia hasta lograr paridad

**Resultado esperado**:
- existe una maquina compilable que representa el flujo `v6` con nombres y guards explicitos

### Etapa 3. Extraer guards y transiciones reales al modelo XState

**Objetivo**: centralizar la logica de flujo hoy repartida entre `state-machine.ts` y `orchestrator.ts`.

**Archivos**:
- `src/lib/pipeline/v6/state-machine.ts`
- `src/lib/pipeline/v6/orchestrator.ts`
- nuevos archivos bajo `src/lib/pipeline/v6/xstate/`

**Tareas**:
- portar guards de avance de `clarify`
- portar `check -> plan|schedule|package`
- portar `critique -> clarify|revise|package`
- portar los estados terminales y el publication gate
- portar la pausa por input y el force finish
- definir una funcion unica de progreso por estado

**Resultado esperado**:
- la maquina ya decide el flujo real; el archivo `state-machine.ts` queda deprecable

### Etapa 4. Extraer side effects del orchestrator a servicios invocados

**Objetivo**: separar control de flujo de ejecucion de agentes.

**Archivos**:
- `src/lib/pipeline/v6/orchestrator.ts`
- `src/lib/pipeline/v6/agents/*`
- nuevos archivos `src/lib/pipeline/v6/xstate/services.ts` o equivalente

**Tareas**:
- envolver cada fase activa como actor o servicio
- mover el manejo de resultados de fase a acciones de la maquina
- mantener el registro de `agentOutcomes`, `debugTrace` y `scratchpad`
- dejar `domain-expert` como servicio auxiliar del planificador

**Resultado esperado**:
- el `orchestrator` deja de tener un loop imperativo fase por fase

### Etapa 5. Crear un adaptador compatible con `PlanOrchestrator`

**Objetivo**: no romper el resto del sistema durante la migracion.

**Archivos**:
- `src/lib/pipeline/v6/orchestrator.ts`
- nuevos archivos `src/lib/pipeline/v6/xstate/runner.ts` o `adapter.ts`

**Tareas**:
- hacer que `run()`, `resume()`, `getProgress()`, `getSnapshot()` y `getDebugStatus()` sigan existiendo
- traducir estados de la maquina a los shapes actuales de `OrchestratorResult`
- preservar `needs_input`, `completed`, `failed`
- preservar `publicationState`, `failureCode`, `blockingAgents` y `customMessage`

**Resultado esperado**:
- las rutas `build` y `resume` pueden seguir usando `PlanOrchestrator` sin saber que el motor interno cambio

### Etapa 6. Redisenar snapshot y pause/resume sobre la maquina

**Objetivo**: serializar el estado real de XState sin perder compatibilidad.

**Archivos**:
- `src/lib/pipeline/v6/session-snapshot.ts`
- `src/lib/pipeline/v6/types.ts`
- `app/api/plan/build/route.ts`
- `app/api/plan/build/resume/route.ts`

**Tareas**:
- definir `schemaVersion: 2` para snapshots de la maquina nueva
- mantener parser o adaptador para snapshots `schemaVersion: 1`
- serializar `state value`, `context` y metadatos suficientes para resume
- documentar el contrato real de `answers` vacio

**Resultado esperado**:
- un run pausado puede reanudarse igual o mejor que hoy

### Etapa 7. Mantener paridad de SSE y debug

**Objetivo**: que la migracion no rompa el frontend ni la CLI.

**Archivos**:
- `app/api/plan/build/route.ts`
- `app/api/plan/build/resume/route.ts`
- `src/lib/client/plan-client.ts`
- `scripts/run-plan.mjs`

**Tareas**:
- mantener `v6:phase`, `v6:progress`, `v6:needs_input`, `v6:degraded`, `v6:complete`, `v6:blocked`
- mantener `clarify-resume` como etiqueta SSE si sigue haciendo falta
- preservar heartbeats y debug events
- validar que `PlanFlow` y la CLI no necesiten reescritura

**Resultado esperado**:
- la migracion es interna; el borde observable sigue estable

### Etapa 8. Limpieza y retiro de duplicacion

**Objetivo**: cerrar la migracion y eliminar logica duplicada.

**Archivos**:
- `src/lib/pipeline/v6/state-machine.ts`
- `src/lib/pipeline/v6/orchestrator.ts`
- `docs/architecture/PIPELINE_V6_SPEC.md`

**Tareas**:
- eliminar o reducir `state-machine.ts` si queda reemplazado
- dejar `orchestrator.ts` como adaptador fino o retirarlo si ya no aporta
- actualizar la spec para que refleje el runtime real basado en XState
- documentar los nuevos puntos de extension

**Resultado esperado**:
- una sola fuente de verdad del flujo

## Estructura de archivos objetivo

Una estructura razonable para el resultado final:

```text
src/lib/pipeline/v6/
  orchestrator.ts              <- adaptador de compatibilidad
  types.ts
  session-snapshot.ts
  xstate/
    machine.ts
    context.ts
    events.ts
    guards.ts
    actions.ts
    services.ts
    snapshot.ts
    progress.ts
```

Los nombres exactos pueden variar, pero la separacion por responsabilidades debe quedar clara.

## Criterios de aceptacion

- el flujo `interpret -> clarify -> plan -> check -> schedule -> critique -> revise -> package -> done|failed|blocked` vive en una maquina XState ejecutable
- pause/resume se serializa y rehidrata desde el estado de la maquina
- el borde `POST /api/plan/build` y `POST /api/plan/build/resume` se mantiene compatible
- el cliente SSE sigue recibiendo los mismos eventos principales
- `PlanPackage` compatible con `v5` no cambia de contrato
- los tests de transiciones y routes pasan con la implementacion nueva
- la spec `PIPELINE_V6_SPEC.md` deja de contradecir el runtime

## Riesgos y mitigaciones

### Riesgo 1. Rewrite excesivo del motor

**Mitigacion**:
- migracion por adaptador
- mantener `PlanOrchestrator` como borde estable al principio
- no tocar el cliente mientras no haya paridad

### Riesgo 2. Romper pause/resume

**Mitigacion**:
- introducir snapshot versionado
- mantener compatibilidad de lectura con `schemaVersion: 1`
- testear al menos un caso real de `needs_input -> resume -> complete`

### Riesgo 3. Confundir estado de maquina con side effects

**Mitigacion**:
- no meter DB ni SSE dentro del modelo como estado
- dejar persistencia y networking como acciones o adaptadores externos

### Riesgo 4. Sobredisenar con `@xstate/react`

**Mitigacion**:
- limitar fase 1 al runtime server-side
- solo evaluar `@xstate/react` si luego se quiere sincronizar UI rica sobre el mismo modelo

## Evidencia requerida al ejecutar este plan

- automatica:
  - `npm run typecheck`
  - `npm run test`
  - `npm run build` si se toca `app/api/`, `types.ts` o snapshot

- visible:
  - `build -> needs_input -> resume -> complete`
  - `build -> blocked`
  - `build degradado con SSE`

## Cierre esperado

Al cerrar este plan, el repo debe pasar de una maquina de estados implicita y distribuida a una maquina de estados explicita, tipada y auditable, sin perder la operatividad actual del producto.
