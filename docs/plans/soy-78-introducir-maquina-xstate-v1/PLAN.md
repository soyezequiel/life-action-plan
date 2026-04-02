# Introducir la máquina XState v5 sin mover rutas públicas

> **Linear:** SOY-78
> **Status:** `pending`
> **Plan:** `docs/plans/soy-78-introducir-maquina-xstate-v1/PLAN.md`
> **Padre:** SOY-46 — stage 2 de `pipeline-v6-xstate-migration-v1`

## Contexto
Se introduce la dependencia XState v5 y se crea la estructura base de la máquina en paralelo al orchestrator actual. Las rutas públicas no se tocan — el orchestrator existente sigue siendo la fuente de verdad hasta alcanzar paridad.

## Alcance
Agregar `xstate` al proyecto. Crear `src/lib/pipeline/v6/xstate/` con el modelo inicial de contexto, eventos y estados. El orchestrator actual permanece intacto.

## Pasos de implementación
1. Instalar `xstate` v5 como dependencia de producción
2. Crear directorio `src/lib/pipeline/v6/xstate/`
3. Definir el tipo `MachineContext`: campos mínimos del contexto de la máquina (profileId, phase, agentOutcomes, scratchpad, debugTrace)
4. Definir todos los eventos (`PHASE_COMPLETE`, `NEEDS_INPUT`, `INPUT_RECEIVED`, `FORCE_FINISH`, `FAIL`)
5. Crear la máquina inicial con estados: `idle`, `running`, `needs_input`, `completed`, `failed`, `blocked`
6. Verificar `npm run typecheck` sin errores nuevos
7. Verificar que el orchestrator actual sigue funcionando sin cambios

## Criterio de cierre
- `src/lib/pipeline/v6/xstate/machine.ts` existe con contexto, eventos y estados definidos
- `npm run typecheck` sin errores
- `npm run test` en verde (ningún test existente roto)
- Ninguna ruta pública modificada

## No tocar
- `src/lib/pipeline/v6/orchestrator.ts` ni ningún archivo fuera de `src/lib/pipeline/v6/xstate/`
- `app/api/`
- `package.json` más allá de agregar `xstate`
