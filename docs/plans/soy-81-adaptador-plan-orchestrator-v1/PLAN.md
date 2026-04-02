# Crear adaptador compatible con PlanOrchestrator

> **Linear:** SOY-81
> **Status:** `pending`
> **Plan:** `docs/plans/soy-81-adaptador-plan-orchestrator-v1/PLAN.md`
> **Padre:** SOY-46 — stage 5 de `pipeline-v6-xstate-migration-v1`

## Contexto
La API pública del orchestrator (`run()`, `resume()`, `getProgress()`, etc.) es usada por las rutas de API. Este adaptador traduce los estados internos de la máquina XState a los contratos que esas rutas ya esperan, sin modificarlas.

## Alcance
Crear `src/lib/pipeline/v6/xstate/orchestrator-adapter.ts` que implemente la misma interfaz pública que `PlanOrchestrator`, traduciendo estados XState a `OrchestratorResult`.

## Pasos de implementación
1. Leer la interfaz actual de `PlanOrchestrator` y listar todos los métodos y tipos que expone
2. Crear `orchestrator-adapter.ts` que instancia y maneja el actor XState internamente
3. Implementar `run()`: iniciar la máquina y retornar cuando alcance estado terminal
4. Implementar `resume()`: restaurar snapshot y continuar la máquina desde `needs_input`
5. Implementar `getProgress()`: leer contexto de la máquina y mapear a formato existente
6. Implementar `getSnapshot()`: serializar estado XState a formato `schemaVersion: 2`
7. Implementar `getDebugStatus()`: exponer `debugTrace` del contexto
8. Mapear estados XState a: `needs_input`, `completed`, `failed`, `publicationState`, `failureCode`, `blockingAgents`
9. Verificar con tests de integración que el adaptador produce resultados idénticos al orchestrator actual

## Criterio de cierre
- Adaptador implementa todos los métodos de la interfaz de `PlanOrchestrator`
- Tests de integración contra el adaptador pasan
- Las rutas de API pueden ser apuntadas al adaptador sin cambios de contrato

## No tocar
- `app/api/` — las rutas no cambian en este stage
- El orchestrator actual (se retira en SOY-84)
