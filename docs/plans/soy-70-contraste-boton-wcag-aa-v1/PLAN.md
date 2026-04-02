# Mejorar contraste del botón primario a WCAG AA

> **Linear:** SOY-70
> **Status:** `pending`
> **Plan:** `docs/plans/soy-70-contraste-boton-wcag-aa-v1/PLAN.md`
> **Padre:** SOY-44 — task 7 de `ui-fixes-dashboard-v1`

## Contexto
El color de texto del botón primario (`¡Listo!`) es `#002b69`, que no alcanza el ratio de contraste WCAG AA. Cambiarlo a `#0a1628` mejora el contraste manteniendo la misma paleta visual.

## Alcance
Cambiar el color de texto del botón primario de `#002b69` a `#0a1628`. Validar con build y verificación visual.

## Pasos de implementación
1. Localizar la definición CSS del color de texto del botón primario (buscar `#002b69` en archivos CSS/module)
2. Cambiar el valor a `#0a1628`
3. Ejecutar `npm run build`
4. Verificar visualmente en `/` que el botón se ve correctamente y el contraste es legible

## Criterio de cierre
- Color de texto del botón primario es `#0a1628`
- `npm run build` en verde
- Verificación visual en `/` confirma contraste adecuado

## No tocar
- Otros colores del botón (background, hover, border)
- Otros botones del sistema
