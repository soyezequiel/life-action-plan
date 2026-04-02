# Corregir estado activo del botón Sistema y labels de proveedor

> **Linear:** SOY-67
> **Status:** `pending`
> **Plan:** `docs/plans/soy-67-boton-sistema-labels-proveedor-v1/PLAN.md`
> **Padre:** SOY-44 — tasks 1-2 de `ui-fixes-dashboard-v1`

## Contexto
El botón Sistema del shell rail tiene la clase `shellRailItemActive` aplicada incorrectamente, haciéndolo aparecer activo cuando no corresponde. Los labels de proveedor de LLM muestran valores técnicos en lugar de nombres legibles por el usuario.

## Alcance
Quitar `shellRailItemActive` del botón Sistema. Mapear labels de proveedor a strings i18n: `Asistente en línea` y `Asistente local`.

## Pasos de implementación
1. Localizar el componente del shell rail que renderiza el botón Sistema
2. Eliminar la clase `shellRailItemActive` del botón Sistema (solo debe aplicarse al item activo de la ruta actual)
3. Localizar dónde se renderizan los labels de proveedor (probablemente en Settings o Dashboard)
4. Agregar keys i18n en `es.json`: `provider.online: "Asistente en línea"` y `provider.local: "Asistente local"`
5. Reemplazar los valores técnicos de proveedor por las keys i18n correspondientes
6. Verificar visualmente que el estado activo del rail es correcto al navegar entre secciones

## Criterio de cierre
- Botón Sistema no aparece activo cuando no es la ruta actual
- Labels de proveedor muestran `Asistente en línea` / `Asistente local`
- `npm run build` en verde

## No tocar
- Lógica de routing del shell rail
- Otros botones del rail
