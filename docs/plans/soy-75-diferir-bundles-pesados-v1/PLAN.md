# Diferir bundles pesados por superficie

> **Linear:** SOY-75
> **Status:** `pending`
> **Plan:** `docs/plans/soy-75-diferir-bundles-pesados-v1/PLAN.md`
> **Padre:** SOY-45 — stage 5 de `navigation-performance-hardening-v1`

## Contexto
Librerías como `FullCalendar`, `framer-motion` y `@xyflow/react` aumentan el bundle inicial de las rutas principales. Diferirlas con dynamic imports reduce el JavaScript que el browser debe parsear y ejecutar antes de mostrar la primera pantalla útil.

## Alcance
Lazy-load `FullCalendar` solo donde aporta valor real. Revisar si `framer-motion` está en el critical path del shell. Evaluar `@xyflow/react` para carga diferida. Usar `next/dynamic` con `ssr: false` donde corresponda.

## Pasos de implementación
1. Analizar bundle con `npm run build` y revisar output de chunk sizes para identificar los pesos reales
2. Identificar en qué rutas/componentes se importa `FullCalendar` — aplicar `next/dynamic` con `ssr: false`
3. Verificar si `framer-motion` aparece en el bundle de rutas principales; si sí, evaluar si es necesario en el shell crítico o si puede diferirse
4. Identificar si `@xyflow/react` se carga en rutas que no muestran el visualizador — aplicar `next/dynamic`
5. Agregar `loading` fallback adecuado a cada `dynamic()` (skeleton, no spinner global)
6. Ejecutar `npm run build` y verificar reducción de tamaño en chunks de rutas principales

## Criterio de cierre
- `FullCalendar` no aparece en el bundle inicial de rutas que no muestran el calendario
- Bundle de la ruta principal reducido respecto al baseline de SOY-71
- `npm run build` en verde sin warnings nuevos

## No tocar
- Funcionalidad de las librerías diferidas (solo el momento de carga cambia)
- Rutas donde el componente se necesita en el primer render sin interacción
