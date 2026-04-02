# Definir contrato de navegación flow → plan → plan/v5

> **Linear:** SOY-57
> **Status:** `pending`
> **Plan:** `docs/plans/soy-57-contrato-navegacion-flow-plan-v1/PLAN.md`
> **Padre:** SOY-42 — stages 2 + 2.1 de `frontend-system-integration-v1`

## Contexto
Las tres superficies del producto (`/flow`, `/plan`, `/plan/v5`) no tienen un contrato de handoff claro entre sí. El usuario puede quedar atrapado entre superficies o ver UI chrome innecesario durante el procesamiento.

## Alcance
Definir el contrato de navegación entre las tres superficies. Homogenizar output final a `/plan/v5?planId=...`. Minimizar chrome de UI durante procesamiento, expandir solo en estado `clarifying`.

## Pasos de implementación
1. Documentar el estado actual de cada superficie: qué recibe, qué produce, qué query params usa
2. Definir el contrato de handoff:
   - `/flow` → prepara el perfil → navega a `/plan?profileId=...`
   - `/plan` → ejecuta el build (SSE) → navega a `/plan/v5?planId=...` al completar
   - `/plan/v5` → muestra y ejecuta el plan persisted
3. Implementar la navegación en `/plan`: al recibir evento SSE `v6:complete`, redirigir a `/plan/v5?planId={planId}`
4. En `/plan`, ocultar chrome de UI (sidebar, nav) durante el estado de procesamiento activo; mostrar solo durante `clarifying`
5. En `/flow`, asegurar que al activar navega a `/plan?profileId=...` con el profileId correcto
6. Verificar el recorrido completo: dashboard → /flow → /plan → /plan/v5

## Criterio de cierre
- Las tres superficies tienen handoff documentado y funcionando
- Output final siempre termina en `/plan/v5?planId=...`
- Chrome de UI oculto durante procesamiento activo en `/plan`
- `npm run build` en verde

## No tocar
- Lógica del pipeline (no cambiar el engine, solo la navegación)
- `app/api/`
