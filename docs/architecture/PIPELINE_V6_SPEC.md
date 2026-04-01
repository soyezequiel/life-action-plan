# LAP Pipeline v6 - Especificacion Operativa

> **Status**: Documentacion tecnica del runtime de build vigente.
> **Basado en**: implementacion real en `app/api/plan/build*`, `src/lib/pipeline/v6/` y `src/lib/pipeline/shared/`.
> **Fecha**: 2026-03-29

## 1. Alcance

Este documento describe el pipeline `v6` que hoy corre el build de planes.

Su alcance es:
- runtime de build y resume
- fases internas del orchestrator
- contratos de snapshot y SSE
- frontera entre `v6` y la persistencia/visualizacion `v5`

Este documento no reemplaza:
- `FLUJO_HIBRIDO_DRAFT.md` para el flujo E2E del producto
- `PIPELINE_V5_SPEC.md` para el contrato historico del paquete compartido
- `FRONTEND_V5_SPEC.md` para la UI del visor persistido

## 2. Entradas reales del runtime

Los entrypoints publicos del pipeline `v6` son:
- `POST /api/plan/build`
- `POST /api/plan/build/resume`

El request operativo de `build` se valida con `v6RequestSchema` (extension de `planBuildRequestSchema`):

| Campo | Tipo | Descripcion |
| --- | --- | --- |
| `goalText` | `string (1–2000)` | Objetivo en texto libre (obligatorio para v6) |
| `profileId` | `string UUID` | ID del perfil del usuario |
| `provider` | `string?` | Proveedor LLM (`ollama`, nombre de modelo, etc.) |
| `resourceMode` | `'auto' \| 'backend' \| 'user' \| 'codex' \| null` | Modo de resolucion de credenciales |
| `apiKey` | `string?` | API key provista por el usuario |
| `backendCredentialId` | `string?` | ID de credencial almacenada en backend |
| `thinkingMode` | `'enabled' \| 'disabled' \| null` | Modo de razonamiento extendido |
| `debug` | `boolean?` | Activa eventos `v6:debug` y `v6:heartbeat` |

El request de `resume` se valida con `resumeRequestSchema`:

| Campo | Tipo | Descripcion |
| --- | --- | --- |
| `sessionId` | `string` | ID de sesion activa a retomar |
| `answers` | `Record<string, string>` | Respuestas del usuario indexadas por `question.id` |
| `debug` | `boolean?` | Activa debug en el resume |

Fuentes:
- `app/api/plan/build/route.ts`
- `app/api/plan/build/resume/route.ts`
- `src/lib/pipeline/v6/types.ts`

## 3. Arquitectura actual

La arquitectura vigente no es `v5` puro.

Hoy conviven tres capas:
- `v6` como runtime de build y resume
- flujo hibrido como UX principal en `app/flow` y `/api/flow/session/*`
- persistencia y visor `v5` para planes ya materializados

En terminos practicos:
- `v6` orquesta interpretacion, aclaracion, planificacion, chequeo, calendarizacion, critica, revision y empaquetado
- el resultado final sigue materializandose como `PlanPackage` compatible con el contrato compartido de `v5`
- el plan persistido se abre en `/plan/v5`

Fuentes:
- `app/api/plan/build/route.ts`
- `app/flow/page.tsx`
- `src/lib/domain/plan-v5-activation.ts`
- `components/plan-viewer/PlanDashboardV5.tsx`

## 4. Componentes principales

### 4.1 Rutas

- `app/api/plan/build/route.ts`: inicia el run `v6`, resuelve credenciales, hace preflight, emite SSE y persiste el plan
- `app/api/plan/build/resume/route.ts`: restaura una sesion pausada y continua desde snapshot

### 4.2 Cliente

- `src/lib/client/plan-client.ts`: consume el SSE y traduce eventos `v6:*` a callbacks de UI (incluyendo `onDegraded`)
- `components/flow/PlanFlow.tsx`: UI guiada de build incremental con banner de degradacion

### 4.3 Core del pipeline

- `src/lib/pipeline/v6/orchestrator.ts`: adaptador runtime que ejecuta fases, integra agentes, SSE, publication gate y snapshots
- `src/lib/pipeline/v6/xstate/`: maquina XState v5 tipada, serializable y fuente de verdad del flujo
- `src/lib/pipeline/v6/state-machine.ts`: wrapper de compatibilidad para scores de progreso y tests puros de transicion
- `src/lib/pipeline/v6/session-snapshot.ts`: snapshot versionado para pause/resume
- `src/lib/pipeline/v6/types.ts`: contratos estrictos del runtime
- `src/lib/pipeline/v6/agent-registry.ts`: registro de agentes disponibles
- `app/api/plan/build/_terminal-failure.ts`: logica de error terminal y mensajes de bloqueo

### 4.4 Modulos reutilizados

`v6` reutiliza contratos y logica de `src/lib/pipeline/shared/`, especialmente:
- `strategy.ts`
- `packager.ts`
- `phase-io.ts`
- `scheduling-context.ts`

### 4.5 CLI

- `scripts/run-plan.mjs`: cliente de linea de comandos para invocar el pipeline v6

Uso basico:
```
node scripts/run-plan.mjs "Objetivo" --profile=<uuid> --provider=ollama
node scripts/run-plan.mjs "Objetivo" --provider=codex          # usa sesion OpenAI
node scripts/run-plan.mjs "Objetivo" --auto                    # no pregunta al usuario
node scripts/run-plan.mjs "Objetivo" > reporte.md              # redirige reporte a archivo
```

El CLI soporta modo interactivo (stdin TTY) y modo auto (`--auto` o stdin no-TTY). En modo interactivo pausa cuando llega `v6:needs_input` y lee respuestas del usuario por consola.

## 5. Preflight check

Antes de ejecutar el pipeline, la ruta de build verifica que el modelo LLM responda correctamente:

```
runtime.chat([{ role: 'user', content: 'Respond with exactly: OK' }])
```

Si el modelo no contiene `'OK'` en la respuesta, el pipeline aborta con `success: false` y un mensaje descriptivo con el `modelId` y `authMode`.

Si el chat lanza una excepcion, se construye un mensaje de error con `buildModelConnectionErrorMessage(modelId, authMode, message)`.

El preflight protege contra:
- credenciales invalidas o expiradas
- modelos no disponibles (Ollama apagado, endpoint caido)
- respuestas malformadas del proveedor

Fuente: `app/api/plan/build/route.ts` lineas 153-183

## 6. Configuracion por defecto del orchestrator

`PlanOrchestrator` se construye con `DEFAULT_CONFIG` si no se pasa config explicita:

| Parametro | Valor por defecto | Descripcion |
| --- | --- | --- |
| `maxIterations` | `20` | Tope de iteraciones totales |
| `maxClarifyRounds` | `3` | Maximo de rondas de aclaracion |
| `maxRevisionCycles` | `2` | Maximo de ciclos critique→revise |
| `tokenBudgetLimit` | `100 000` | Tope de tokens acumulados |
| `criticApprovalThreshold` | `75` | Score minimo para aprobar sin revision |
| `enableDomainExpert` | `true` | Habilita consulta a domainExpert |

## 7. Fases del orchestrator

Las fases publicas del orchestrator son:
- `interpret`
- `clarify`
- `plan`
- `check`
- `schedule`
- `critique`
- `revise`
- `package`
- `done`
- `failed`

### 7.1 Mapa de fases

| Fase | Responsable logico | Salida principal |
| --- | --- | --- |
| `interpret` | `goal-interpreter` | `GoalInterpretation` |
| `clarify` | `clarifier` | `ClarificationRound` |
| `plan` | `planner` | `StrategicDraft` |
| `check` | `feasibility-checker` | `FeasibilityReport` |
| `schedule` | `scheduler` | `ScheduleExecutionResult` |
| `critique` | `critic` | `CriticReport` |
| `revise` | `planner` | `StrategicDraft` corregido |
| `package` | `packager` | `PlanPackage` |

### 7.2 Scores de progreso por fase

| Fase | Score |
| --- | --- |
| `interpret` | 10 |
| `clarify` | 25 |
| `plan` | 40 |
| `check` | 50 |
| `schedule` | 65 |
| `critique` | 80 |
| `revise` | 70 |
| `package` | 95 |
| `done` | 100 |
| `failed` | 0 |

Fuente: `src/lib/pipeline/v6/state-machine.ts`

### 7.3 Nota importante sobre agentes

No toda fase corresponde a un archivo `agent` dedicado.

Estado actual:
- `goal-interpreter`, `clarifier`, `scheduler`, `packager` y `domain-expert` estan registrados por defecto
- `critic` y `feasibility-checker` se cargan como opcionales
- `planner` existe como rol logico y aparece en traces/resultados, pero hoy se apoya en `src/lib/pipeline/shared/strategy.ts` y prompts `v6`, no en un archivo `planner-agent.ts`

### 7.4 Estrategia de carga de agentes

El orchestrator intenta cargar agentes en dos etapas:
1. **Registry** (`agent-registry.ts`): `createDefaultRegistry()` — si disponible
2. **Direct imports** (`loadAgentDirect`): carga el modulo individual directamente

Si ninguna funciona, el agente no esta disponible y el orchestrator usa el fallback del propio agente o del orchestrator.

## 8. Maquina de estados real

La fuente de verdad del flujo ahora es una maquina `XState v5` con estos estados:
- `interpret`
- `clarify`
- `paused_for_input`
- `plan`
- `check`
- `schedule`
- `critique`
- `revise`
- `package`
- `done`
- `blocked`
- `failed`

Transiciones base:
- `interpret -> clarify`
- `clarify -> paused_for_input` cuando siguen faltando respuestas
- `clarify -> plan` cuando hay senales suficientes y no quedan preguntas pendientes
- `paused_for_input -> clarify` con `ANSWERS_SUBMITTED`
- `paused_for_input -> plan` con `INPUT_SKIPPED`
- `plan -> check`
- `check -> schedule` si el plan es `feasible` o `tight`
- `check -> plan` si es `infeasible` y `revisionCycles < maxRevisionCycles`
- `check -> package` si es `infeasible` y se agotaron revisiones
- `schedule -> critique`
- `critique -> package` si el verdict es `approve`
- `critique -> revise` si el verdict es `revise` y `revisionCycles < maxRevisionCycles`
- `critique -> package` si el verdict es `revise` y se agotaron revisiones
- `critique -> clarify` si el verdict es `rethink` y `clarifyRounds < maxClarifyRounds`
- `critique -> package` si el verdict es `rethink` y se agotaron rondas de aclaracion
- `revise -> critique`
- `package -> done|blocked|failed` segun el publication gate

Valvulas de seguridad (fuerzan salto a `package`):
- `iteration >= maxIterations`
- `tokenBudget.used >= tokenBudget.limit`
- `stalled_progress` (ver seccion 9)

Cuando se fuerza un cierre, el orchestrator salta a `package` en modo best-effort.

Fuentes:
- `src/lib/pipeline/v6/state-machine.ts`
- `src/lib/pipeline/v6/orchestrator.ts`

## 9. Stall detection

El orchestrator mantiene un historial de `progressScore` llamado `progressHistory`.

En cada iteracion evalua si las ultimas `max(MAX_STALLED_ITERATIONS, 3)` entradas son todas iguales o decrecientes.

Condiciones para activar el forzado de cierre:
- `progressHistory.length >= 3`
- `state.phase !== 'package'`
- `state.phase !== 'done'`
- `state.phase !== 'clarify'` (exento — quedarse en clarify esperando input es normal)
- todos los scores recientes `<= recent[0]`

Si se cumple, `shouldForceFinish()` devuelve `true` y el orchestrator salta a `package`.

Fuente: `src/lib/pipeline/v6/orchestrator.ts`

## 10. Pause/Resume real

El pipeline `v6` soporta pausa por aclaraciones del usuario.

### 10.1 Logica de pausa

La fase `clarify` puede activar `pauseForInput()` cuando:
- `requiresUserInput('clarify')` es `true` (siempre en esa fase)
- `hasPendingAnswers()` devuelve `false`

`hasPendingAnswers()` devuelve `true` en dos casos:
1. `pendingAnswers !== null` y `Object.keys(pendingAnswers).length > 0` (hay respuestas reales)
2. `clarifyRounds === 0` (primera ronda — siempre ejecuta para generar preguntas)

### 10.2 Contrato de ClarificationQuestion

| Campo | Tipo | Descripcion |
| --- | --- | --- |
| `id` | `string` | Identificador de la pregunta (clave para `answers`) |
| `text` | `string` | Texto de la pregunta en lenguaje natural |
| `purpose` | `string` | Para que sirve la respuesta |
| `type` | `'text' \| 'number' \| 'select' \| 'range'` | Tipo de entrada esperada |
| `options` | `string[]?` | Opciones validas (para `select`) |
| `min` / `max` | `number?` | Rango valido (para `number`/`range`) |

Maximo 4 preguntas por ronda. Maximo 3 rondas por defecto.

### 10.3 Persistencia de sesion

Cuando el pipeline emite `needs_input`:
- se genera un `sessionId` (UUID)
- se persiste un `V6RuntimeSnapshot` en `interactive_sessions` (expira en 30 minutos)
- el snapshot vigente usa `schemaVersion: 2` e incluye snapshot serializable de la maquina XState
- el parser mantiene lectura backward-compatible de `schemaVersion: 1`
- `userId` se verifica contra la tabla `users`; si no existe, se guarda `null` para evitar FK violation

El snapshot contiene:
- `schemaVersion: 1`
- `pipeline: 'v6'`
- `request`: parametros originales del build
- `orchestrator`: snapshot completo del estado (config, state, context, scratchpad, pendingAnswers, progressHistory, agentOutcomes, debugTrace)

### 10.4 Comportamiento de resume

`POST /api/plan/build/resume` con `{ sessionId, answers }`:

- Si `answers` tiene claves: el orchestrator procesa las respuestas y re-entra en `clarify` para evaluar si avanzar
- Si `answers` es `{}` (vacio): el orchestrator despacha `INPUT_SKIPPED`, marca la aclaracion como `degraded_skip` y avanza a `plan`

Esto evita loops infinitos cuando el cliente envia respuestas vacias y deja trazabilidad explicita de que se avanzo sin nuevas respuestas del usuario.

Fuentes:
- `src/lib/pipeline/v6/session-snapshot.ts`
- `src/lib/pipeline/v6/types.ts`
- `app/api/plan/build/route.ts`
- `app/api/plan/build/resume/route.ts`

## 11. Degradacion y AgentExecutionOutcome

Cada ejecucion de agente registra un `AgentExecutionOutcome`:

| Campo | Tipo | Descripcion |
| --- | --- | --- |
| `agent` | `V6AgentName` | Nombre del agente |
| `phase` | `OrchestratorPhase` | Fase en que ejecuto |
| `source` | `'llm' \| 'fallback' \| 'deterministic'` | Como se produjo el resultado |
| `errorCode` | `string \| null` | Codigo de error si hubo fallo |
| `errorMessage` | `string \| null` | Mensaje de error si hubo fallo |
| `durationMs` | `number` | Duracion en milisegundos |

El flag `degraded: boolean` en `OrchestratorResult` y `PlanPackage` es `true` si al menos un agente uso `source: 'fallback'`.

Agentes criticos segun `_terminal-failure.ts`: `clarifier`, `planner`, `critic`. Un fallback en estos agentes puede bloquear la publicacion.

## 12. Contrato SSE del build v6

### 12.1 Eventos normales

| Evento | Payload `data` | Descripcion |
| --- | --- | --- |
| `v6:phase` | `{ phase, iteration }` | Inicio de fase |
| `v6:progress` | `{ score, lastAction }` | Actualizacion de progreso (0-100) |
| `v6:needs_input` | `{ sessionId, questions: ClarificationRound }` | Pipeline pausado, requiere respuestas |
| `v6:degraded` | `{ message, failedAgents, agentOutcomes }` | Plan generado con fallbacks |
| `v6:complete` | `{ planId, score, iterations, package, reasoningTrace, scratchpad, degraded, agentOutcomes }` | Pipeline completado y plan persistido |

### 12.2 Eventos de bloqueo o falla

| Evento | Payload | Descripcion |
| --- | --- | --- |
| `v6:blocked` | `{ message, failureCode, blockingAgents, agentOutcomes, degraded, qualityIssues, warnings, package }` | Plan no publicable (requiere regeneracion o supervision) |
| `result` con `success: false` | `{ success, error, scratchpad, degraded, publicationState, failureCode, agentOutcomes, blockingAgents, qualityIssues, warnings, package }` | Error terminal del pipeline |

### 12.3 Eventos de debug (solo con `debug: true`)

| Evento | Payload | Descripcion |
| --- | --- | --- |
| `v6:debug` | `OrchestratorDebugEvent` | Evento detallado de ciclo de vida interno |
| `v6:heartbeat` | `{ timestamp, status: OrchestratorDebugStatus }` | Estado del orchestrator cada 10 segundos |

### 12.4 Nota sobre la fase `clarify-resume`

El endpoint de `resume` emite `{ type: 'v6:phase', data: { phase: 'clarify-resume', iteration: 0 } }` como primer evento para indicar que es una continuacion. Este valor no existe en `OrchestratorPhaseSchema` — es solo una etiqueta SSE para el cliente.

Fuentes:
- `app/api/plan/build/route.ts`
- `app/api/plan/build/resume/route.ts`
- `app/api/plan/build/_terminal-failure.ts`
- `src/lib/client/plan-client.ts`

## 13. Publication gate

`v6` no publica automaticamente cualquier paquete generado.

`OrchestratorResult` incluye:

| Campo | Tipo | Descripcion |
| --- | --- | --- |
| `status` | `'completed' \| 'needs_input' \| 'failed'` | Estado del run |
| `publicationState` | `'ready' \| 'blocked' \| 'failed'` | Aptitud para publicar |
| `failureCode` | `'requires_regeneration' \| 'requires_supervision' \| 'failed_for_quality_review' \| null` | Razon de bloqueo |
| `blockingAgents` | `AgentExecutionOutcome[]` | Agentes que causaron el bloqueo |
| `degraded` | `boolean` | Si hubo fallbacks |

La ruta de build solo persiste el plan y emite `v6:complete` cuando `status === 'completed' && publicationState === 'ready'`.

En cualquier otro caso terminal llama `sendTerminalFailure()`, que:
1. Emite `v6:blocked` si hay `failureCode` reconocido o `publicationState === 'blocked'`
2. Emite `v6:degraded` si `degraded === true` sin failureCode especifico
3. Siempre emite `result` con `success: false` y detalle del error

Mensajes de error por `failureCode`:
- `requires_supervision`: objetivo de salud de alto riesgo sin referencia a supervision profesional
- `failed_for_quality_review`: la revision final no paso el umbral de calidad
- `requires_regeneration`: la revision critica fallo y el plan requiere regeneracion
- sin failureCode + degraded: fallo parcial en el pipeline

Fuente:
- `src/lib/pipeline/v6/orchestrator.ts`
- `app/api/plan/build/_terminal-failure.ts`

## 14. Frontera v6 -> paquete v5

El runtime es `v6`, pero el paquete final sigue apoyandose en el contrato compartido historico.

Puntos concretos:
- `PlanPackage` de `v6` extiende el contrato compartido de `v5` agregando `reasoningTrace`, `agentOutcomes` y `degraded`
- `package.plan` sigue siendo `V5Plan`
- la persistencia actual llama `persistPlanFromV5Package(...)`
- el visor persistido usa `/api/plan/package`, `/api/plan/adaptive` y `/plan/v5`

Esto significa:
- `v6` ya es el motor de build
- `v5` sigue siendo el formato de salida persistido y la UI principal de lectura

Fuentes:
- `src/lib/pipeline/v6/types.ts`
- `src/lib/pipeline/shared/phase-io.ts`
- `src/lib/domain/plan-v5-activation.ts`
- `src/lib/client/use-plan-v5.ts`
- `components/plan-viewer/PlanDashboardV5.tsx`

## 15. Dependencias con el flujo hibrido

El flujo hibrido y el build `v6` no son lo mismo.

Separacion actual:
- `app/flow` y `/api/flow/session/*` modelan el journey del producto
- `/api/plan/build*` resuelve el build guiado por SSE
- ambos conviven en el repo y responden a necesidades distintas

Para evitar confusiones:
- usar `FLUJO_HIBRIDO_DRAFT.md` para journey E2E
- usar este documento para el runtime `v6`
- usar `PIPELINE_V5_SPEC.md` solo como referencia del contrato de salida reutilizado

## 16. No objetivos de esta spec

Esta spec no cubre:
- wallet y cobro
- auth de usuario
- flujo `/api/flow/session/*` en detalle
- el visor `plan-v5` completo
- costos, billing o deployment en Vercel

## 17. Archivos fuente para mantener esta spec

Si cambia el runtime `v6`, revisar primero:
- `app/api/plan/build/route.ts`
- `app/api/plan/build/resume/route.ts`
- `app/api/plan/build/_terminal-failure.ts`
- `src/lib/pipeline/v6/orchestrator.ts`
- `src/lib/pipeline/v6/state-machine.ts`
- `src/lib/pipeline/v6/types.ts`
- `src/lib/pipeline/v6/session-snapshot.ts`
- `src/lib/pipeline/v6/agent-registry.ts`
- `src/lib/pipeline/shared/phase-io.ts`
- `src/lib/domain/plan-v5-activation.ts`
- `src/lib/client/plan-client.ts`
- `scripts/run-plan.mjs`
