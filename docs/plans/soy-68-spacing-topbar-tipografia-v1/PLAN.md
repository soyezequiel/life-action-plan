# Ajustar spacing topbar y tipografía de task cards

> **Linear:** SOY-68
> **Status:** `pending`
> **Plan:** `docs/plans/soy-68-spacing-topbar-tipografia-v1/PLAN.md`
> **Padre:** SOY-44 — tasks 3-4 de `ui-fixes-dashboard-v1`

## Contexto
Dos ajustes CSS puntuales en el dashboard: el margen inferior del topbar es demasiado pequeño, y las task cards usan font mono para metadata cuando debería ser la fuente de UI.

## Alcance
Cambiar `.shellTopbar` margin-bottom de `1rem` a `1.25rem`. Cambiar `.task-card__meta` font-family de `var(--font-mono)` a `var(--font-ui)`.

## Pasos de implementación
1. Localizar el archivo CSS/module que define `.shellTopbar` y cambiar `margin-bottom: 1rem` a `margin-bottom: 1.25rem`
2. Localizar el archivo CSS/module que define `.task-card__meta` y cambiar `font-family: var(--font-mono)` a `font-family: var(--font-ui)`
3. Verificar visualmente en el dashboard que el cambio se ve correctamente
4. `npm run build` en verde

## Criterio de cierre
- `.shellTopbar` tiene `margin-bottom: 1.25rem`
- `.task-card__meta` tiene `font-family: var(--font-ui)`
- `npm run build` en verde

## No tocar
- Cualquier otro estilo del topbar o de las task cards
- Lógica de componentes
