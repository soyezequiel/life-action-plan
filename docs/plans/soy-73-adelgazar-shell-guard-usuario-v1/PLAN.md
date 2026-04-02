# Adelgazar el shell global y el guard de usuario

> **Linear:** SOY-73
> **Status:** `pending`
> **Plan:** `docs/plans/soy-73-adelgazar-shell-guard-usuario-v1/PLAN.md`
> **Padre:** SOY-45 — stage 3 de `navigation-performance-hardening-v1`

## Contexto
`RootLayout` envuelve toda la app con providers y guards que no son necesarios en todas las rutas. Esto genera un fullscreen loading global que bloquea el render incluso en rutas que no necesitan sesión. Mover guards y providers a route groups específicos mejora el TTFB percibido.

## Alcance
Revisar `RootLayout`, `SessionProvider`, `UserStatusProvider`, `UserStatusGuard`. Mover guards y providers a los route groups que realmente los necesitan. Eliminar el loading global fullscreen después de la primera resolución útil.

## Pasos de implementación
1. Auditar `RootLayout` y listar cada provider y guard con su justificación de estar global
2. Identificar rutas públicas (landing, login) que no necesitan `UserStatusProvider`
3. Crear route groups en App Router: `(auth)/` para rutas protegidas, `(public)/` para rutas abiertas
4. Mover `UserStatusGuard` y `UserStatusProvider` al layout de `(auth)/`
5. Eliminar el fullscreen loading global de `RootLayout`; si hace falta loading, que sea por route group
6. Verificar que rutas públicas cargan sin esperar a la sesión
7. Verificar que rutas protegidas siguen redirigiendo correctamente si no hay sesión
8. `npm run build` en verde, `npm run test` en verde

## Criterio de cierre
- Rutas públicas no dependen de `UserStatusProvider`
- Loading fullscreen global eliminado del layout raíz
- Redirección de auth sigue funcionando en rutas protegidas

## No tocar
- Lógica de autenticación en `app/api/auth/`
- Contratos de sesión (no modificar callbacks de NextAuth)
