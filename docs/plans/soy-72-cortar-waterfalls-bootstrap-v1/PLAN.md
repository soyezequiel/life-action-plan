# Cortar waterfalls de bootstrap en rutas principales

> **Linear:** SOY-72
> **Status:** `pending`
> **Plan:** `docs/plans/soy-72-cortar-waterfalls-bootstrap-v1/PLAN.md`
> **Padre:** SOY-45 — stage 2 de `navigation-performance-hardening-v1`

## Contexto
Las rutas principales disparan cadenas de fetch en el cliente (profile → plan list → progress list) que generan waterfalls de red y múltiples estados de carga. Mover estos datos al servidor elimina la cascada y reduce el tiempo hasta contenido visible.

## Alcance
Mover fetch de datos base a Server Components o RSC boundaries. Eliminar cadenas tipo `useEffect → fetch → setState → useEffect`. Reducir loading states visibles al entrar a una ruta.

## Pasos de implementación
1. Auditar rutas `/`, `/intake`, `/plan`, `/plan/v5` identificando todos los `useEffect` que disparan fetch al montar
2. Para cada cadena de fetch: evaluar si puede moverse a un Server Component padre
3. Mover `profile.latest` a layout server-side donde corresponda
4. Mover `plan.list` y `progress.list` a Server Components con `await` paralelo (Promise.all)
5. Reemplazar loading states granulares por un solo Suspense boundary por ruta
6. Verificar que `npm run build` pasa y no hay errores de RSC boundary
7. Medir tiempos con la tabla de baseline de SOY-71 como referencia

## Criterio de cierre
- Cero cadenas de fetch encadenadas en el cliente para datos de bootstrap
- Número de loading states por ruta reducido a ≤ 1 Suspense boundary
- `npm run build` en verde

## No tocar
- Fetch de datos interactivos (acciones del usuario, SSE del pipeline)
- `app/api/` (las rutas no cambian, solo quién las llama)
