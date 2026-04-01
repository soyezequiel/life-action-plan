# Plan: Hardening de rendimiento de navegacion

> **Objetivo**: reducir la latencia percibida al cambiar entre secciones principales de LAP, especialmente en local, sin redisenar la UI ni alterar el flujo funcional vigente.
> **Base de analisis**: `docs/architecture/FLUJO_HIBRIDO_DRAFT.md`, `app/layout.tsx`, `src/lib/client/app-services.tsx`, `src/lib/client/use-user-status.ts`, `components/guards/UserStatusGuard.tsx`, `components/midnight-mint/MockupShell.tsx`, `components/mockups/DashboardMockup.tsx`, `components/mockups/ResourceProviderMockup.tsx`, `components/plan-viewer/PlanificadorPage.tsx`, `components/PlanCalendar.tsx`, `app/api/_wallet.ts`.
> **Criterio rector**: primero eliminar waterfalls y trabajo global innecesario; despues recien optimizar render y bundle.

## Evidencia relevada

Mediciones y observaciones obtenidas en esta sesion:

1. **Cold compile pesado en pantallas cliente**
   - `GET /auth/signup` en dev: compilacion fria de `1502 modules`, `3736ms`
   - `GET /api/auth/session` en frio: `2592ms`

2. **Latencia de rutas protegidas con sesion autenticada**
   - `/`: `1385ms`
   - `/intake`: `1794ms`
   - `/plan`: `1241ms`
   - `/settings`: `869ms`

3. **Fetches adicionales despues del primer paint**
   - `/api/profile/latest`: `564ms` en sesion autenticada fria
   - `/api/wallet/status`: `882ms` en sesion autenticada fria, `521ms` warm
   - `/api/settings/api-key?provider=openai`: `603ms` en sesion autenticada fria, `471ms` warm

4. **Waterfall estructural visible en codigo**
   - cada pagina principal hace `auth()` en servidor
   - despues monta una pantalla cliente que vuelve a consultar datos por `fetch`
   - el layout global monta `SessionProvider`, `UserStatusProvider` y `UserStatusGuard` para toda la app

5. **Trabajo caro en endpoints de status**
   - `app/api/_wallet.ts` ejecuta `getPlanBuildChargeState()` dentro de `getWalletStatus()`
   - eso implica resolver modelo backend, politica de cobro y chequeos de billing en un endpoint que la UI llama como "status" basico

6. **Dos capas de auth conviviendo**
   - paginas y middleware usan `NextAuth`
   - varios endpoints y helpers siguen usando la sesion propia `lap-session`
   - esto aumenta complejidad, costo de chequeo y riesgo de inconsistencia

## Diagnostico

El problema principal no es un componente aislado sino una suma de decisiones de arquitectura:

1. **Navegacion con waterfall**
   - `auth()` en servidor
   - payload de App Router
   - hidratacion de una pantalla cliente grande
   - fetches cliente para bootstrap de datos

2. **Shell global demasiado costoso**
   - `RootLayout` monta providers y guardas cliente para toda la app
   - `UserStatusGuard` puede bloquear con un loading fullscreen mientras resuelve estado
   - `MockupShell` usa `framer-motion`, `next-auth/react`, `useSearchParams` y logica de nav en todas las vistas principales

3. **Pantallas top-level demasiado client-heavy**
   - dashboard, intake, settings y plan legacy cargan sus datos dentro de `useEffect`
   - eso garantiza un segundo viaje de datos despues de entrar a la ruta

4. **Status y costos acoplados**
   - settings no solo consulta si hay wallet o API key
   - tambien arrastra logica de cotizacion y billing que no deberia correr en cada entrada a la seccion

5. **Bundles y dependencias pesadas entrando demasiado pronto**
   - `framer-motion` esta en shell, auth y varias pantallas
   - `@fullcalendar/react` vive en la experiencia de plan legacy
   - `@xyflow/react` aparece en intake/build avanzado

## Decision de diseno

Se adopta una estrategia de cuatro decisiones:

1. **Mover bootstrap de datos criticos al servidor o a bordes mas finos**
   - las paginas principales deben llegar con datos base o con un unico request bien definido
   - evitar el patron "entra a la ruta y recien ahi se descubre que hay que pedir todo"

2. **Sacar logica de onboarding/auth del shell global**
   - la navegacion permitida debe resolverse preferentemente antes del render de la pantalla
   - el guard cliente global debe dejar de ser el portero universal

3. **Separar status ligero de cotizacion costosa**
   - `/api/wallet/status` debe responder estado
   - la cotizacion de build debe vivir en un endpoint o accion separada y on-demand

4. **Partir el peso cliente por superficie**
   - calendar, visualizadores avanzados y motion intenso deben cargar solo donde aportan valor real

## Objetivos

1. Reducir la sensacion de espera al cambiar entre `/`, `/intake`, `/plan`, `/plan/v5` y `/settings`.
2. Eliminar waterfalls de bootstrap evitables.
3. Reducir trabajo global por ruta y por sesion.
4. Mantener la UI y los contratos funcionales visibles para el usuario.

## No objetivos

1. Reescribir el pipeline `v6`.
2. Redisenar la interfaz principal.
3. Cambiar el modelo de datos de planes o progreso.
4. Resolver toda la deuda historica de auth en esta misma unidad.

## Archivos con mayor probabilidad de cambio

- `app/layout.tsx`
- `app/page.tsx`
- `app/intake/page.tsx`
- `app/plan/page.tsx`
- `app/plan/v5/page.tsx`
- `app/settings/page.tsx`
- `src/lib/client/app-services.tsx`
- `src/lib/client/use-user-status.ts`
- `components/guards/UserStatusGuard.tsx`
- `components/midnight-mint/MockupShell.tsx`
- `components/mockups/DashboardMockup.tsx`
- `components/mockups/ResourceProviderMockup.tsx`
- `components/mockups/IntakeMockup.tsx`
- `components/plan-viewer/PlanificadorPage.tsx`
- `components/PlanCalendar.tsx`
- `app/api/_wallet.ts`
- `app/api/settings/api-key/route.ts`

## Plan de implementacion

### Etapa 1. Instrumentacion y baseline repetible

**Objetivo**: dejar una forma estable de medir antes y despues.

**Tareas**:
- agregar medicion simple de tiempos por ruta principal y por endpoint bootstrap
- comparar frio y warm para `/`, `/intake`, `/plan`, `/plan/v5`, `/settings`
- registrar cuantos requests cliente se disparan al montar cada superficie

**Salida esperada**:
- tabla before/after
- lista concreta de waterfalls removidos

### Etapa 2. Cortar el waterfall de las pantallas principales

**Objetivo**: que dashboard, plan y settings no dependan de una segunda fase de bootstrap cliente para lo esencial.

**Tareas**:
- mover resolucion de sesion y datos base al servidor donde aplique
- pasar props serializadas minimas a los client components que sigan siendo necesarios
- evitar cadenas del tipo `profile.latest -> plan.list -> progress.list` dentro de `useEffect`
- revisar si dashboard y plan legacy pueden arrancar con datos base desde el server component de pagina

**Resultado esperado**:
- menos loading states despues de entrar a una ruta
- menos round-trips para ver contenido util

### Etapa 3. Adelgazar el shell global

**Objetivo**: que el layout compartido no pague costos que solo pertenecen a algunas vistas.

**Tareas**:
- revisar si `SessionProvider`, `UserStatusProvider` y `UserStatusGuard` deben seguir en `RootLayout`
- mover guardas o providers a grupos/rutas que realmente los necesiten
- reducir dependencia de `MockupShell` en `useSession`, `useSearchParams` y motion si no aportan al cambio de seccion
- evitar fullscreen loading global despues de la primera resolucion de sesion

**Resultado esperado**:
- transiciones mas directas
- menos remount perceptible del shell

### Etapa 4. Separar status de cotizacion en settings/wallet

**Objetivo**: que entrar a `/settings` no active logica de billing mas cara de la necesaria.

**Tareas**:
- dividir `getWalletStatus()` en status ligero y quote de build on-demand
- revisar si `/api/settings/api-key` puede responder de forma mas barata o agruparse con otros datos
- llamar cotizacion solo cuando el usuario abre el paso de build o confirma una accion de costo

**Resultado esperado**:
- `/settings` mas rapida
- menos costo backend por navegacion

### Etapa 5. Bundle split y carga diferida de superficies pesadas

**Objetivo**: bajar el costo de JS e hidratacion por seccion.

**Tareas**:
- cargar `FullCalendar` solo dentro de la vista que realmente lo usa
- evitar que `framer-motion` quede en la ruta critica del shell si solo anima entrada cosmetica
- revisar visualizadores avanzados (`@xyflow/react`, pipeline visualizers) para carga diferida
- limitar estado y efectos al minimo necesario en top-level components

**Resultado esperado**:
- menor compilacion y menor hidratacion por ruta
- menos trabajo al cambiar de seccion

### Etapa 6. Frontera de auth y estado coherente

**Objetivo**: reducir duplicidad entre `NextAuth` y la sesion propia mientras se preserva compatibilidad.

**Tareas**:
- identificar que endpoints cliente todavia dependen de `lap-session`
- definir una frontera explicita: que se resuelve por `NextAuth` y que se mantiene legacy temporalmente
- evitar chequeos duplicados de sesion cuando la ruta ya fue autenticada por middleware

**Resultado esperado**:
- menos consultas redundantes de auth
- menos estado inconsistente entre shell, middleware y APIs

### Etapa 7. Verificacion visible y automatica

**Objetivo**: cerrar con evidencia, no con intuicion.

**Validaciones minimas**:
- `npm run typecheck`
- `npm run test`
- `npm run build` si el recorte toca `app/api/`, contratos o providers
- recorrido visible de navegacion entre secciones principales
- tabla comparativa de tiempos before/after

## Walking skeleton sugerido

La primera vertical debe atacar el camino con mejor retorno:

1. dashboard
2. settings
3. guard global

Orden propuesto:

1. sacar el loading global innecesario del guard
2. dividir `wallet/status` de `wallet/quote`
3. server-render de datos base del dashboard
4. medir de nuevo

Si esa vertical mejora claramente, se aplica el mismo patron a intake y plan.

## Criterios de aceptacion

1. Ninguna ruta principal depende de una cadena serial cliente para mostrar su estado base.
2. `/settings` no ejecuta cotizacion de build al entrar, salvo accion explicita.
3. El shell global deja de bloquear toda la app con un loading fullscreen despues de la primera resolucion util.
4. El numero de requests bootstrap por ruta baja respecto al baseline actual.
5. La navegacion entre secciones se siente mas inmediata y queda respaldada por mediciones before/after.

## Riesgos y mitigaciones

### Riesgo 1. Mover datos al servidor rompe interactividad actual

**Mitigacion**:
- mantener client components solo para interacciones reales
- pasar props serializadas minimas

### Riesgo 2. Cambiar guardas globales altera onboarding

**Mitigacion**:
- migrar por etapas
- validar `SETUP`, `PLAN` y `READY` en recorridos visibles

### Riesgo 3. Separar `wallet/status` introduce drift de UX

**Mitigacion**:
- mantener contrato UI claro: status basico al entrar, quote solo on-demand

### Riesgo 4. Mezclar performance con refactor amplio

**Mitigacion**:
- respetar el orden: waterfall, guard, endpoints, bundle
- sin "while I'm here" refactors

## Anexo: prompt operativo sugerido para implementar este plan

```text
You are working in F:\\proyectos\\planificador-vida.

Goal: implement docs/plans/navigation-performance-hardening-v1/PLAN.md with focus on reducing route transition latency between /, /intake, /plan, /plan/v5, and /settings.

Context to preserve:
- Next.js 15 App Router, React 19, PostgreSQL, pipeline v6.
- Do not revert unrelated changes.
- UI strings must remain in i18n.
- No Electron.
- If you touch app/api/, src/lib/db/, shared contracts, providers, or streaming, run the required validation commands.

Known root causes from the plan:
- top-level pages do auth() on the server and then bootstrap again from client useEffect
- RootLayout mounts SessionProvider, UserStatusProvider, and UserStatusGuard globally
- ResourceProviderMockup calls wallet status and API key status on mount
- app/api/_wallet.ts computes plan build charge state inside getWalletStatus()
- MockupShell and top-level client screens pull heavy client dependencies into route transitions

Required execution order:
1. Add a repeatable timing baseline for the affected routes and bootstrap endpoints.
2. Remove the most obvious navigation waterfall first.
3. Split wallet status from build quote so settings can load cheaply.
4. Reduce global guard/provider work if it still blocks route transitions.
5. Lazy-load heavy route-only widgets where appropriate.
6. Re-measure and summarize before/after.

Constraints:
- Keep the existing visual language unless a change is required for performance.
- Prefer server-side data loading for initial route state when feasible.
- Keep the write scope focused on navigation latency, bootstrap fetches, auth/session duplication, and heavy route bundles.
- Stop and ask before deleting files, changing schemas, adding dependencies, or altering external services/accounts.

Done when:
- route transitions between the main sections are materially faster
- settings no longer runs expensive quote logic just to show status
- the baseline and after metrics are documented
- validation commands required by the touched files have been run
```
