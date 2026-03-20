# Plan Final LAP

> Version consolidada v10.0
> Source of truth para la arquitectura y el roadmap real del repo

## Resumen ejecutivo

LAP es una web app Next.js 15 para crear, simular y ejecutar planes de accion personales con ayuda de LLM.

Realidad actual:
- Runtime principal: web-only
- Frontend: React 19 + App Router
- Backend: Next.js Route Handlers
- Persistencia: PostgreSQL via Drizzle
- Desarrollo local: PostgreSQL local + Ollama local
- Produccion objetivo: Vercel + PostgreSQL cloud + LLM cloud

Electron queda fuera del plan vigente. Puede existir como antecedente historico, no como direccion de producto.

## Estado actual del proyecto

### Lo que ya existe

- `app/page.tsx`, `app/intake/page.tsx`, `app/settings/page.tsx`
- `components/Dashboard.tsx`, `components/IntakeExpress.tsx`, `components/DebugPanel.tsx`
- API routes para intake, profile, plan, progress, streak, wallet, cost y debug
- Build de plan con streaming SSE
- Simulacion de plan con streaming SSE
- Exportacion `.ics`
- Inspector LLM con snapshot
- Capa DB en `src/lib/db/`
- Providers en `src/lib/providers/`
- Skills principales en `src/lib/skills/`
- Tests unitarios en `tests/`

### Lo que todavia no debe asumirse como resuelto

- Deploy productivo validado en Vercel con proveedor cloud
- UX final de wallet y costos
- Hardening completo de ruta real vs fallback
- Pulido de accesibilidad y mobile
- Limpieza total de residuos legacy y docs historicos

## Direccion arquitectonica

### Web-only

La aplicacion se construye y valida como web app.

Esto implica:
- nada de IPC
- nada de `electron`
- nada de `safeStorage`
- nada de `better-sqlite3`
- nada de shells desktop como criterio de aceptacion

### Persistencia

El estado mutable vive en PostgreSQL y se accede con Drizzle.

`DATABASE_URL` define el entorno:
- local: PostgreSQL local
- preview/prod: PostgreSQL cloud

No se reintroduce SQLite para estado de producto.

### Providers LLM

Hay dos modos utiles:
- local: Ollama desde el servidor Next.js
- cloud: OpenAI u otro proveedor cloud en Vercel

Regla operativa:
- local puede usar Ollama
- Vercel no debe depender de Ollama

### Streaming

Las operaciones largas usan streaming SSE desde Route Handlers.

Rutas criticas:
- `/api/plan/build`
- `/api/plan/simulate`
- `/api/debug/snapshot`

## Entornos soportados

| Entorno | DB | LLM | Objetivo |
| --- | --- | --- | --- |
| Local dev | PostgreSQL local | Ollama local u OpenAI | desarrollo diario |
| Vercel preview | PostgreSQL cloud | proveedor cloud | smoke pre-merge |
| Vercel prod | PostgreSQL cloud | proveedor cloud | uso real |

## Flujo E2E que debe mantenerse vivo

1. Abrir la app
2. Restaurar perfil previo o pasar por intake
3. Crear perfil
4. Volver al dashboard
5. Generar plan
6. Ver tareas del dia
7. Marcar progreso
8. Consultar racha y costos
9. Usar el Inspector LLM para diagnostico

Este flujo, con proveedor local o cloud segun el entorno, es el baseline del producto.

## Estructura real del repo

```text
app/
  globals.css
  layout.tsx
  page.tsx
  intake/page.tsx
  settings/page.tsx
  api/
    cost/route.ts
    debug/route.ts
    debug/snapshot/route.ts
    intake/route.ts
    plan/build/route.ts
    plan/export-ics/route.ts
    plan/list/route.ts
    plan/simulate/route.ts
    profile/route.ts
    profile/latest/route.ts
    progress/list/route.ts
    progress/toggle/route.ts
    settings/api-key/route.ts
    streak/route.ts
    wallet/connect/route.ts
    wallet/disconnect/route.ts
    wallet/status/route.ts

components/
  Dashboard.tsx
  IntakeExpress.tsx
  DebugPanel.tsx
  debug/

src/lib/
  auth/
  client/
  db/
  payments/
  providers/
  runtime/
  skills/

src/shared/
  schemas/
  types/

tests/
  *.test.ts
  *.test.tsx
```

## Reglas tecnicas

1. i18n obligatorio. No hardcodear strings de UI.
2. Abuela-proof. No mostrar jerga tecnica en la interfaz.
3. Luxon para fechas. No usar `new Date()` para logica de negocio.
4. Zod `.strict()` en schemas nuevos.
5. API keys solo server-side o encriptadas en DB.
6. Toda nueva superficie debe poder distinguir ruta real, fallback y error.
7. Si se toca `app/api/`, `src/lib/db/` o contratos compartidos, correr `npm run build`.
8. Si se toca streaming, providers o inspector, dejar evidencia visible real.

## No objetivos explicitos

Estas piezas no forman parte del plan vigente:
- volver a Electron
- reintroducir SQLite como almacenamiento de producto
- Express local como backend principal
- safeStorage
- tray service
- rebuilds de modulos nativos
- paridad browser/Electron como criterio de QA

## Roadmap real

### Fase 0 - Estabilizacion post-migracion

- limpiar documentacion y source of truth
- eliminar residuos legacy que confundan a futuros agentes
- dejar smoke local repetible
- asegurar `typecheck`, `test` y `build`

### Fase 1 - Robustez local

- mejorar mensajes de error
- endurecer el inspector
- hacer explicita la diferencia entre ruta real y fallback
- consolidar settings para API key y proveedor

### Fase 2 - Readiness para Vercel

- validar `DATABASE_URL` cloud
- usar proveedor cloud real en preview/prod
- revisar timeouts y `vercel.json`
- correr smoke de `intake -> build -> dashboard`

### Fase 3 - Productizacion

- wallet y costos como flujo entendible
- polish visual del dashboard
- accesibilidad y mobile
- exportacion y simulacion con UX consistente

### Fase 4 - Futuro

- auth mas robusta
- PWA si aporta valor real
- analytics privacy-first
- mejoras de growth y retention

## Gates de calidad

Cada unidad de trabajo debe cerrar con:
- evidencia automatica
- evidencia visible

Evidencia automatica valida:
- `npm run typecheck`
- `npm run test`
- `npm run build` cuando corresponda

Evidencia visible valida:
- flujo UI funcional
- stream SSE visible
- traza en inspector
- archivo exportado
- dato persistido y luego rehidratado

HMR por si solo no cuenta como evidencia suficiente cuando se toca transporte, DB o contratos.

## Riesgos abiertos

1. Documentacion vieja puede volver a empujar decisiones equivocadas.
2. El deploy en Vercel necesita proveedor cloud; Ollama no sirve como estrategia de produccion.
3. Si no se explicita fallback vs ruta real, los smokes pueden dar falsos positivos.
4. Hay residuos legacy en el repo que pueden confundir a agentes nuevos aunque no esten activos.

## Archivos criticos

1. `app/api/plan/build/route.ts`
2. `app/api/plan/simulate/route.ts`
3. `app/api/debug/route.ts`
4. `app/api/debug/snapshot/route.ts`
5. `components/Dashboard.tsx`
6. `components/DebugPanel.tsx`
7. `src/lib/client/browser-http-client.ts`
8. `src/lib/db/connection.ts`
9. `src/lib/db/db-helpers.ts`
10. `src/lib/db/schema.ts`
11. `src/lib/providers/provider-factory.ts`
12. `src/lib/skills/plan-builder.ts`
13. `src/lib/skills/plan-simulator.ts`
14. `src/shared/types/lap-api.ts`
15. `src/shared/types/debug.ts`

## Documentos operativos asociados

- `AGENTS.md`
- `continuacion-web-nextjs-divs.md`
- `matriz-smoke-web.md`
