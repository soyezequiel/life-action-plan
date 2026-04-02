# Ocultar alias técnicos de wallet y corregir pluralización

> **Linear:** SOY-69
> **Status:** `pending`
> **Plan:** `docs/plans/soy-69-wallet-alias-pluralizacion-v1/PLAN.md`
> **Padre:** SOY-44 — tasks 5-6 de `ui-fixes-dashboard-v1`

## Contexto
El dashboard muestra el alias del wallet aunque sea un acrónimo corto no legible por humanos. La key i18n `dashboard.today_summary` no soporta pluralización, mostrando `1 actividades` en lugar de `1 actividad`.

## Alcance
Ocultar el alias del wallet si es un acrónimo corto. Dividir `dashboard.today_summary` en `today_summary_one` / `today_summary_other` para pluralización correcta.

## Pasos de implementación
1. Localizar dónde se renderiza el alias del wallet en el componente Dashboard
2. Agregar condición: si el alias tiene menos de 5 caracteres (acrónimo no legible), no mostrarlo
3. Localizar la key `dashboard.today_summary` en `es.json`
4. Dividirla en: `today_summary_one: "1 actividad para hoy"` y `today_summary_other: "{{count}} actividades para hoy"`
5. Actualizar el componente para usar la función de pluralización de i18n (ej: `t('today_summary', { count })`)
6. Verificar que con 1 actividad muestra singular y con N muestra plural

## Criterio de cierre
- Alias del wallet oculto si es acrónimo de < 5 caracteres
- Pluralización correcta: `1 actividad` vs `N actividades`
- `npm run build` en verde

## No tocar
- Lógica de cálculo del wallet
- Otras keys de i18n
