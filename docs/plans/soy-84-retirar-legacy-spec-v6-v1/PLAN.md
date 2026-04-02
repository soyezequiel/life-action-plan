# Retirar duplicación legacy y actualizar la spec v6

> **Linear:** SOY-84
> **Status:** `pending`
> **Plan:** `docs/plans/soy-84-retirar-legacy-spec-v6-v1/PLAN.md`
> **Padre:** SOY-46 — stage 8 de `pipeline-v6-xstate-migration-v1`

## Contexto
Una vez que la máquina XState tiene paridad completa con el orchestrator anterior, el código legacy puede ser retirado. Este es el stage de limpieza post-migración: eliminar duplicación y actualizar la documentación de spec.

## Alcance
Reducir o eliminar `state-machine.ts` si fue completamente reemplazado. Dejar una sola fuente de verdad para el flujo del pipeline. Actualizar `docs/architecture/PIPELINE_V6_SPEC.md`.

## Pasos de implementación
1. Verificar que ningún archivo fuera de `src/lib/pipeline/v6/xstate/` importa el orchestrator legacy
2. Marcar el orchestrator legacy como deprecated con comentario JSDoc
3. Eliminar `state-machine.ts` si está completamente reemplazado (verificar con grep primero)
4. Actualizar imports en cualquier archivo que aún referencie el orchestrator legacy → apuntar al adaptador XState
5. Actualizar `docs/architecture/PIPELINE_V6_SPEC.md` para reflejar la arquitectura XState
6. Ejecutar `npm run typecheck` — 0 errores
7. Ejecutar `npm run test` — en verde
8. Ejecutar `npm run build` — build exitoso

## Criterio de cierre
- `npm run typecheck`, `npm run test` y `npm run build` en verde
- Ningún archivo de producción importa el orchestrator legacy eliminado
- `PIPELINE_V6_SPEC.md` actualizado

## No tocar
- Tests (no eliminar tests existentes)
- `app/api/` (las rutas ya apuntan al adaptador desde SOY-81)
- `docs/plans/` (no es parte del scope de spec)
