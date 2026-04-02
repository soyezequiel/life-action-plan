# Reducir duplicación del cliente SSE de build

> **Linear:** SOY-58
> **Status:** `pending`
> **Plan:** `docs/plans/soy-58-cliente-sse-build-unificado-v1/PLAN.md`
> **Padre:** SOY-42 — stage 3 de `frontend-system-integration-v1`

## Contexto
El cliente SSE para `/api/plan/build` existe en más de un lugar: la ruta `/plan` y la ruta `/settings` tienen implementaciones separadas del mismo streaming. Esto genera deuda de mantenimiento y riesgo de divergencia.

## Alcance
Un solo cliente SSE frontend para `/api/plan/build`. Extraer contrato de eventos común si coexisten dos caminos temporalmente. Eliminar la dependencia de build directa desde Settings cuando `/plan` cubre el caso completo.

## Pasos de implementación
1. Identificar todos los archivos que implementan el cliente SSE para `/api/plan/build`
2. Extraer la lógica común a un hook o utility: `useBuildStream(profileId)` o similar
3. Reemplazar las implementaciones duplicadas por el hook unificado
4. Verificar que Settings no llama directamente a build (redirigir a `/plan` si es necesario)
5. `npm run test` en verde, `npm run build` en verde

## Criterio de cierre
- Un único cliente SSE para `/api/plan/build` en el frontend
- Settings no tiene lógica de build directa
- `npm run build` en verde

## No tocar
- `app/api/plan/build` (solo el cliente frontend cambia)
- Lógica de eventos SSE del pipeline
