# Instrumentar baseline de navegación y bootstrap

> **Linear:** SOY-71
> **Status:** `pending`
> **Plan:** `docs/plans/soy-71-baseline-navegacion-bootstrap-v1/PLAN.md`
> **Padre:** SOY-45 — stage 1 de `navigation-performance-hardening-v1`

## Contexto
Antes de optimizar la navegación hay que medir el estado actual. Sin un baseline documentado no hay forma de verificar que las optimizaciones siguientes tuvieron impacto real.

## Alcance
Medir tiempos fríos y cálidos de las rutas principales. Registrar cuántas requests de bootstrap hace cada superficie. Producir una tabla antes/después reproducible.

## Pasos de implementación
1. Definir el set de rutas a medir: `/`, `/intake`, `/plan`, `/plan/v5`, `/settings`
2. Usar Performance API o Network tab de DevTools para medir tiempo hasta First Meaningful Paint por ruta
3. Medir cold load (hard refresh, sin cache) y warm load (navegación SPA) por ruta
4. Registrar número de requests de bootstrap por superficie (cuántos fetch se disparan al entrar)
5. Documentar resultados en `docs/plans/soy-71-baseline-navegacion-bootstrap-v1/baseline.md` como tabla markdown
6. Identificar los 3 cuellos de botella más grandes (candidatos para los stages siguientes)

## Criterio de cierre
- Tabla `baseline.md` creada con métricas de cold/warm por ruta
- Número de requests de bootstrap documentado por superficie
- Top 3 cuellos de botella identificados

## No tocar
- Ningún archivo de código en este stage — solo medición y documentación
