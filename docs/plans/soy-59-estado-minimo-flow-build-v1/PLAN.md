# Estado mínimo compartido entre flow y build

> **Linear:** SOY-59
> **Status:** `pending`
> **Plan:** `docs/plans/soy-59-estado-minimo-flow-build-v1/PLAN.md`
> **Padre:** SOY-42 — stage 4 de `frontend-system-integration-v1`

## Contexto
Las superficies `/flow` y `/plan` necesitan compartir estado mínimo para el handoff. Sin un contrato claro, cada superficie hace suposiciones sobre qué datos tiene disponibles, generando acoplamiento implícito o datos perdidos en la transición.

## Alcance
Definir `profileId` como el contrato mínimo entre flow y build. Decidir qué va en query params vs local storage. Evitar que `PlanFlow` se acople al estado completo del flow.

## Pasos de implementación
1. Listar todos los datos que `/flow` produce y `/plan` necesita al inicio
2. Definir la frontera mínima: solo `profileId`, `provider` e `entry intent` pasan entre superficies
3. Implementar la transferencia via query params: `/plan?profileId=...&provider=...`
4. Verificar que `/plan` no depende de ningún estado de `/flow` más allá de los query params definidos
5. Si algo debe persistir entre recargas (ej: el usuario vuelve a `/plan`), mover a una clave específica de sessionStorage con TTL corto
6. Limpiar cualquier uso de localStorage o estado global que acople las dos superficies

## Criterio de cierre
- El único contrato entre `/flow` y `/plan` son los query params definidos
- `/plan` funciona correctamente recibiendo solo `profileId`
- `npm run build` en verde

## No tocar
- Estado interno de `/flow` (no simplificar su modelo interno en este stage)
- `app/api/`
