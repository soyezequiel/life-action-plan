# Actualizar mocks y guards de tests UI/flow

> **Linear:** SOY-55
> **Status:** `pending`
> **Plan:** `docs/plans/soy-55-mocks-guards-tests-ui-v1/PLAN.md`
> **Padre:** SOY-41 — sub-task de `fix-typecheck-stale-tests-v1`

## Contexto
Tres tests de UI y flow tienen mocks o fixtures desactualizados respecto a los contratos actuales. Son fixes puntuales pero requieren entender el contexto del componente o flujo más que los fixtures de simulación.

## Alcance
Tres fixes en tests de UI/flow:
1. Agregar `exportSimulation` al stub de `LapAPI` en dashboard interaction test
2. Agregar null guard para `calendar` en flow-engine test
3. Agregar `simulationTreeId: null` al fixture de FlowState en flow page content test

## Pasos de implementación
1. En `tests/dashboard.interaction.test.tsx`: localizar el stub de `LapAPI` y agregar el método `exportSimulation: vi.fn()` (o jest.fn())
2. En `tests/flow-engine.test.ts`: localizar la función `buildCalendarState` o el punto donde `calendar` puede ser undefined; agregar guard `if (!calendar) return ...` o el tipo correcto
3. En `tests/flow-page-content.test.tsx`: localizar el fixture de `FlowState` y agregar `simulationTreeId: null`
4. Ejecutar `npm run typecheck` — 0 errores
5. Ejecutar `npm run test` — en verde

## Criterio de cierre
- `npm run typecheck` sin errores en los 3 archivos
- `npm run test` en verde
- Sin cambios en código de producción

## No tocar
- Lógica de los tests (solo los stubs y fixtures)
- `LapAPI` de producción
