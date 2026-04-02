# Mantener paridad de SSE y debug con la máquina XState

> **Linear:** SOY-83
> **Status:** `pending`
> **Plan:** `docs/plans/soy-83-paridad-sse-debug-xstate-v1/PLAN.md`
> **Padre:** SOY-46 — stage 7 de `pipeline-v6-xstate-migration-v1`

## Contexto
El pipeline emite eventos SSE que el frontend consume para mostrar progreso en tiempo real. Al migrar a XState, las transiciones de la máquina deben producir los mismos eventos SSE que el orchestrator actual, sin romper el contrato con el cliente.

## Alcance
Conectar las transiciones de la máquina XState a la emisión de eventos SSE. Preservar heartbeats y salida de debug CLI. El contrato de eventos está definido y no cambia.

## Pasos de implementación
1. Listar todos los eventos SSE actuales: `v6:phase`, `v6:progress`, `v6:needs_input`, `v6:complete`, `v6:blocked`
2. Crear listener de transiciones en el actor XState usando `machine.subscribe()`
3. En cada transición relevante, emitir el evento SSE correspondiente al stream activo
4. Mantener heartbeat: emitir `v6:progress` periódicamente durante fases activas
5. Conectar `debugTrace` del contexto a la salida de debug CLI existente
6. Verificar con tests de integración SSE que los eventos llegan al cliente en orden correcto

## Criterio de cierre
- Todos los eventos SSE (`v6:phase`, `v6:progress`, `v6:needs_input`, `v6:complete`, `v6:blocked`) se emiten desde la máquina XState
- Heartbeats funcionando durante fases activas
- Debug CLI output intacto

## No tocar
- El contrato de eventos SSE (no agregar ni renombrar eventos)
- Código de frontend que consume los eventos
- `app/api/` (las rutas no cambian)
