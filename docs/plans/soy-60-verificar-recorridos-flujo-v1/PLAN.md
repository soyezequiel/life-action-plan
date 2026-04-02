# Verificar recorridos visibles del flujo integrado

> **Linear:** SOY-60
> **Status:** `pending`
> **Plan:** `docs/plans/soy-60-verificar-recorridos-flujo-v1/PLAN.md`
> **Padre:** SOY-42 — stage 5 de `frontend-system-integration-v1`

## Contexto
Una vez integradas las superficies, hay que verificar que todos los caminos de usuario visibles funcionan de extremo a extremo. Sin smoke tests completos, una regresión en el handoff puede pasar desapercibida.

## Alcance
Smoke test de los 4 recorridos principales del usuario: simple, avanzado, híbrido y error controlado.

## Pasos de implementación
1. **Recorrido simple:** `dashboard → /plan → clarifications → /plan/v5`
   - Verificar que el CTA lleva a `/plan`
   - Verificar que el pipeline corre y muestra clarifications si las hay
   - Verificar que al completar redirige a `/plan/v5?planId=...`
2. **Recorrido avanzado:** `dashboard → settings → build → dashboard/viewer`
   - Verificar que Settings sigue accesible
   - Verificar que el flujo avanzado termina en el viewer
3. **Recorrido híbrido:** `dashboard → /flow → activation → dashboard`
   - Verificar que `/flow` produce un profileId
   - Verificar que la activación navega correctamente
4. **Recorrido error:** error controlado con mensaje abuela-proof
   - Simular un error del pipeline
   - Verificar que el mensaje mostrado no expone términos técnicos
5. Documentar resultados en `docs/plans/soy-60-verificar-recorridos-flujo-v1/smoke-results.md`

## Criterio de cierre
- Los 4 recorridos pasan sin errores visibles
- Ningún mensaje de error expone términos técnicos al usuario
- `smoke-results.md` documentado

## No tocar
- Ningún código de producción — solo verificación
