# Consolidar entrada principal del dashboard hacia /plan

> **Linear:** SOY-56
> **Status:** `pending`
> **Plan:** `docs/plans/soy-56-dashboard-entrada-plan-v1/PLAN.md`
> **Padre:** SOY-42 — stage 1 de `frontend-system-integration-v1`

## Contexto
El CTA principal del dashboard no apunta consistentemente a `/plan`. Algunos usuarios llegan a Settings como paso intermedio, lo que rompe el flujo esperado. La copy actual no es abuela-proof: expone términos técnicos.

## Alcance
Hacer que el CTA principal del dashboard apunte a `/plan`. Mantener Settings como ruta avanzada/técnica. Ajustar copy a lenguaje abuela-proof en español.

## Pasos de implementación
1. Identificar el CTA principal del dashboard (componente y archivo)
2. Cambiar el target de navegación del CTA principal a `/plan`
3. Actualizar la copy del CTA: reemplazar términos técnicos por lenguaje natural (sin "LLM", "API", "build", "tokens")
4. Agregar/actualizar keys i18n en `es.json` para los textos modificados
5. Verificar que Settings sigue accesible pero no es el destino principal
6. Smoke test: dashboard → click CTA → landing en `/plan` guiado

## Criterio de cierre
- CTA principal apunta a `/plan`
- Copy del CTA no contiene términos técnicos
- Keys i18n actualizadas
- `npm run build` en verde

## No tocar
- Lógica de `/plan` (no cambiar el comportamiento de la ruta destino)
- Rutas de Settings
- `app/api/`
