# Separar wallet status de la cotización de build

> **Linear:** SOY-74
> **Status:** `pending`
> **Plan:** `docs/plans/soy-74-separar-wallet-status-build-v1/PLAN.md`
> **Padre:** SOY-45 — stage 4 de `navigation-performance-hardening-v1`

## Contexto
`getWalletStatus()` actualmente combina la verificación de estado del wallet con la cotización del costo de build. Esto hace que `/settings` dispare lógica de billing cara al entrar, aunque el usuario solo quiera ver su configuración.

## Alcance
Dividir `getWalletStatus()` en dos funciones: un check liviano de estado y una cotización bajo demanda. Prevenir que `/settings` ejecute billing logic en cada carga. Revisar el costo de `/api/settings/api-key`.

## Pasos de implementación
1. Leer la implementación actual de `getWalletStatus()` y mapear qué hace cada parte
2. Crear `getWalletStatusLight()`: solo verifica si el wallet existe y tiene saldo (sin cálculo de build cost)
3. Crear `getWalletBuildQuote()`: calcula el costo de build (llamar solo cuando el usuario inicia un build)
4. Reemplazar `getWalletStatus()` en `/settings` por `getWalletStatusLight()`
5. Revisar `/api/settings/api-key`: identificar si dispara lógica cara; si sí, optimizar o diferir
6. Verificar que Settings carga sin llamar a `getWalletBuildQuote()`
7. Verificar que el flujo de build sigue usando `getWalletBuildQuote()` correctamente

## Criterio de cierre
- `/settings` no dispara lógica de billing al cargar
- `getWalletBuildQuote()` solo se llama al iniciar un build
- `npm run typecheck` sin errores

## No tocar
- Lógica de billing en el flujo de build
- Contratos de respuesta de `/api/settings/api-key` (solo optimizar, no cambiar forma)
