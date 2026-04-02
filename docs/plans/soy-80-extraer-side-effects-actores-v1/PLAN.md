# Extraer side effects a servicios invocados (actores XState)

> **Linear:** SOY-80
> **Status:** `pending`
> **Plan:** `docs/plans/soy-80-extraer-side-effects-actores-v1/PLAN.md`
> **Padre:** SOY-46 — stage 4 de `pipeline-v6-xstate-migration-v1`

## Contexto
El orchestrator actual mezcla control flow con ejecución de agentes. Este stage separa ambas responsabilidades: la máquina maneja el control flow y los agentes corren como actores/servicios XState invocados.

## Alcance
Envolver las fases activas del pipeline como actores XState. Preservar `agentOutcomes`, `debugTrace` y `scratchpad` en el contexto de la máquina. Mantener `domain-expert` como servicio auxiliar.

## Pasos de implementación
1. Identificar todas las fases activas que producen side effects (llamadas a LLM, escrituras a DB)
2. Crear un actor XState por fase activa usando `fromPromise` de XState v5
3. Pasar `profileId`, `scratchpad` y contexto necesario como input al actor
4. En `onDone` del actor: actualizar `agentOutcomes` y `debugTrace` en el contexto de la máquina
5. En `onError` del actor: transicionar a `failed` con `failureCode` apropiado
6. Mantener `domain-expert` como servicio auxiliar invocado donde corresponda
7. Verificar que `agentOutcomes`, `debugTrace` y `scratchpad` se preservan correctamente

## Criterio de cierre
- Cada fase activa es un actor XState separado
- `agentOutcomes`, `debugTrace` y `scratchpad` disponibles en contexto después de cada fase
- `npm run test` en verde con la matrix de regresión de SOY-77

## No tocar
- El adaptador público (se construye en SOY-81)
- Rutas de API
- Archivos fuera de `src/lib/pipeline/v6/xstate/`
