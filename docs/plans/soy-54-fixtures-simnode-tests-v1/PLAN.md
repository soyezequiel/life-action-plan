# Corregir fixtures de SimNode en tests de simulación

> **Linear:** SOY-54
> **Status:** `pending`
> **Plan:** `docs/plans/soy-54-fixtures-simnode-tests-v1/PLAN.md`
> **Padre:** SOY-41 — sub-task de `fix-typecheck-stale-tests-v1`

## Contexto
Los schemas de producción de `SimNode`, `RealityCheckResult` y `SimTree` agregaron campos requeridos con defaults. Los factories de tests no se actualizaron, generando errores de typecheck en 5 archivos de test.

## Alcance
Agregar campos faltantes a los factories de SimNode, RealityCheckResult y SimTree en los tests de simulación.

## Pasos de implementación
1. En `tests/user-agent.test.ts`, `tests/world-agent.test.ts`, `tests/simulation-propagation.test.ts`: agregar `actionLog: []` al objeto retornado por el helper factory `n()` de SimNode
2. En `tests/simulation-orchestrator.test.ts` y `tests/simulation-tree-builder.test.ts`: agregar `selectedAdjustment: 'keep' as const` a cada objeto fixture `rc` / `reality` de `RealityCheckResult`
3. En `tests/simulation-propagation.test.ts`: agregar `persona: null` al factory `tree()` de SimTree
4. En `tests/simulation-tree-builder.test.ts`: tipar el fixture `profile` como `as any` (el test valida comportamiento del árbol, no del perfil)
5. Ejecutar `npm run typecheck` y verificar reducción de errores
6. Ejecutar `npm run test` y verificar que todos los tests pasan

## Criterio de cierre
- `npm run typecheck` sin errores en los 5 archivos afectados
- `npm run test` en verde
- Sin cambios en código de producción

## No tocar
- Lógica de los tests (solo los fixtures/factories)
- Archivos fuera de `tests/`
