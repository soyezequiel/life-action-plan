# Ordenar la frontera de auth y cerrar duplicidad NextAuth/lap-session

> **Linear:** SOY-76
> **Status:** `pending`
> **Plan:** `docs/plans/soy-76-frontera-auth-nextauth-lap-session-v1/PLAN.md`
> **Padre:** SOY-45 — stage 6 de `navigation-performance-hardening-v1`

## Contexto
El sistema de auth tiene duplicación entre `NextAuth` y `lap-session`: el middleware autentica la ruta pero los componentes y Server Components repiten chequeos de sesión que ya fueron resueltos. Esto genera latencia innecesaria y riesgo de inconsistencia.

## Alcance
Reducir la duplicación entre `NextAuth` y `lap-session`. Evitar chequeos redundantes cuando el middleware ya autenticó la ruta. Validar que `typecheck`, `test` y `build` pasan, y registrar métricas antes/después.

## Pasos de implementación
1. Mapear el flujo completo de auth: middleware → layout → Server Component → Client Component
2. Identificar dónde se llama `getServerSession()` o equivalentes de `lap-session` redundantemente (ya autenticado por middleware)
3. Definir la regla: el middleware es la única fuente de verdad de auth en rutas protegidas; los componentes acceden a la sesión ya resuelta, no la revalidan
4. Eliminar chequeos de sesión redundantes en layouts y Server Components de rutas protegidas
5. Unificar el tipo de sesión: si `NextAuth` y `lap-session` producen objetos de sesión diferentes, crear un adaptador único
6. Ejecutar `npm run typecheck`, `npm run test`, `npm run build`
7. Registrar métricas de antes/después comparando con baseline de SOY-71

## Criterio de cierre
- Sin chequeos de sesión duplicados en rutas ya protegidas por middleware
- `npm run typecheck`, `npm run test`, `npm run build` en verde
- Tabla antes/después con métricas registradas

## No tocar
- Lógica de login/logout (`app/api/auth/`)
- Rutas públicas
- Callbacks de NextAuth (solo optimizar uso, no modificar configuración)
