# Congelar el contrato actual antes de migrar a XState

> **Linear:** SOY-77
> **Status:** `pending`
> **Plan:** `docs/plans/soy-77-congelar-contrato-xstate-v1/PLAN.md`
> **Padre:** SOY-46 — stage 1 de `pipeline-v6-xstate-migration-v1`

## Contexto
Antes de migrar el motor de generación v6 a XState, hay que documentar y blindar el comportamiento actual del orchestrator. Sin una matriz de regresión verificada, cualquier cambio en la máquina puede romper flujos existentes silenciosamente.

## Alcance
Documentar las transiciones reales, los contratos de resume y los resultados de publicación del orchestrator actual. Producir una suite de tests de regresión que sirva de red de seguridad para la migración.

## Pasos de implementación
1. Leer `src/lib/pipeline/v6/` y mapear todos los caminos de transición posibles del orchestrator actual
2. Documentar comportamiento real de `run()`, `resume()`, `needs_input`, `completed`, `failed`, `blocked`
3. Crear matriz mínima de regresión: escenarios críticos con entrada, estado esperado y salida
4. Escribir tests de integración que cubran los escenarios de la matriz
5. Verificar que `npm run test` pasa con los nuevos tests antes de avanzar al stage 2

## Criterio de cierre
- Matriz de regresión documentada en `docs/plans/soy-77-congelar-contrato-xstate-v1/regression-matrix.md`
- Tests nuevos pasan en `npm run test`
- Cero modificaciones al código del orchestrator actual

## No tocar
- `src/lib/pipeline/v6/` — solo lectura en este stage
- Rutas públicas de API (`app/api/`)
- Código de producción fuera de la carpeta de tests
