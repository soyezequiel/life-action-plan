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

## Flujo E2E del producto

> Detalle completo en `FLUJO_HIBRIDO_DRAFT.md` (mismo directorio). Aquí el resumen ejecutivo.

### Flujo principal (usuario nuevo)

| Paso | Nombre | Descripción |
|------|--------|-------------|
| 0 | Gate | Si no tiene LLM o billetera configurada, se le pide una de las dos. Se muestra costo estimado antes de pedir billetera. |
| 1 | Objetivos | El usuario dice qué quiere lograr (uno o varios). Si hay múltiples, los prioriza. |
| 2 | Intake dinámico | El LLM decide qué datos necesita y pregunta en bloques temáticos. Auto-guardado por respuesta. |
| 3 | Plan alto nivel | El LLM genera un plan estratégico con fases, dependencias e hitos. Sin tareas diarias aún. |
| 4 | Chequeo de realidad | Se comparan horas necesarias vs disponibles. Si no cuadra, se ofrecen trade-offs respetando priorización. |
| 5 | Simulación | Bucle máx 5 iteraciones: el LLM simula semana a semana, detecta errores, corrige. Checkpoint por iteración. |
| 6 | Presentación visual | Plan mostrado con diagramas + cards. El usuario da feedback tipo chat o edita gráficos. Máx 10 rondas. |
| 7 | Calendario existente | Importar .ics o ingreso manual de actividades fijas. OAuth Google Calendar futuro. |
| 8 | Generación top-down | Años → trimestres → meses → semanas → días (niveles se adaptan a duración del plan). |
| 9 | Ejecución | Dashboard con tareas del día, progreso, racha, costos. Re-planificación on-demand. |

### Reanudación

Si el usuario vuelve con una sesión interrumpida, se retoma desde el último checkpoint.
Se pregunta si algo cambió y se actualizan los datos antes de continuar.

### Flujo técnico mínimo (smoke test)

1. Gate → configurar LLM
2. Intake → responder preguntas
3. Build → generar plan con streaming SSE
4. Dashboard → ver tareas
5. Marcar progreso
6. Inspector LLM para diagnóstico

## Estructura real del repo

```text
app/
  globals.css
  layout.tsx
  page.tsx
  intake/page.tsx
  settings/page.tsx
  api/
    _auth.ts, _db.ts, _debug-state.ts, _domain.ts
    _plan.ts, _schemas.ts, _shared.ts, _user-settings.ts, _wallet.ts
    auth/
      claim-local-data/route.ts
      delete-account/route.ts
      login/route.ts
      logout/route.ts
      me/route.ts
      register/route.ts
    cost/route.ts
    debug/route.ts
    debug/snapshot/route.ts
    intake/route.ts
    models/available/route.ts
    plan/build/route.ts
    plan/export-ics/route.ts
    plan/list/route.ts
    plan/simulate/route.ts
    profile/route.ts
    profile/latest/route.ts
    progress/list/route.ts
    progress/toggle/route.ts
    settings/api-key/route.ts
    settings/build-preview/route.ts
    settings/credentials/route.ts
    settings/credentials/[credentialId]/route.ts
    settings/credentials/[credentialId]/validate/route.ts
    streak/route.ts
    vault/backup/route.ts
    wallet/connect/route.ts
    wallet/disconnect/route.ts
    wallet/status/route.ts

components/
  Dashboard.tsx (+Dashboard.module.css)
  IntakeExpress.tsx (+IntakeExpress.module.css)
  IntakePageContent.tsx
  DebugPanel.tsx
  PlanCalendar.tsx (+PlanCalendar.module.css)
  PulsoLogo.tsx
  SettingsPageContent.tsx (+SettingsPageContent.module.css)
  debug/
    DebugMessageInspector.tsx
    DebugPanelStatus.tsx
    DebugSpanDetail.tsx
    DebugTokenStream.tsx
    DebugTraceList.tsx
    debug-panel.css
  settings/
    AccountSection.tsx
    BuildSection.tsx
    LlmModeSelector.tsx
    OwnKeyManager.tsx
    ServiceAiSelector.tsx
    WalletSection.tsx
    types.ts

src/debug/
  instrumented-runtime.ts
  trace-collector.ts

src/i18n/
  index.ts

src/lib/
  auth/
    api-key-auth.ts
    credential-config.ts
    password.ts
    resolve-user.ts
    secret-storage.ts
    session-token.ts
    session.ts
    user-settings.ts
  client/
    app-services.tsx
    browser-http-client.ts
    client-crypto.ts
    error-utils.ts
    local-key-vault.ts
    providers.tsx
    resource-usage-copy.ts
    storage-keys.ts
    use-debug-traces.ts
    vault-sync.ts
  billing/
    operation-lifecycle.ts
  db/
    connection.ts
    db-helpers.ts
    schema.ts
  domain/
    plan-generation.ts
    plan-simulation.ts
  env/
    deployment.ts
  payments/
    billing-policy.ts
    nwc-provider.ts
    operation-charging.ts
    wallet-connection.ts
    wallet-errors.ts
  providers/
    payment-provider.ts
    provider-factory.ts
    provider-metadata.ts
  runtime/
    backend-service-execution.ts
    build-execution.ts
    execution-context-resolver.ts
    resource-usage-summary.ts
    resource-usage-tracking.ts
    types.ts
  skills/
    plan-builder.ts
    plan-intake.ts
    plan-simulator.ts
    skill-interface.ts

src/shared/
  config-errors.ts
  schemas/
    credential-registry.ts
    execution-context.ts
    index.ts
    manifiesto.ts
    perfil.ts
    resource-usage.ts
    rutina-base.ts
  types/
    credential-registry.ts
    debug.ts
    execution-context.ts
    lap-api.ts
    resource-usage.ts

src/utils/
  ics-generator.ts
  plan-build-fallback.ts
  streaks.ts

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
- **Refactorización de Backend (Completado)**: Estructura modular con dominios puros (`src/lib/domain`) y middleware de cobro (`src/lib/billing/operation-lifecycle.ts`).

### Fase 2 - Readiness para Vercel

- validar `DATABASE_URL` cloud
- usar proveedor cloud real en preview/prod
- bloquear Ollama y el fallback local en Vercel
- revisar timeouts de rutas largas y `vercel.json`
- agregar checks locales de readiness (`doctor:deploy`, `smoke:deploy`)
- correr smoke de `intake -> build -> dashboard` con provider cloud

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

1. El deploy en Vercel necesita proveedor cloud; Ollama no sirve como estrategia de produccion.
2. Si no se explicita fallback vs ruta real, los smokes pueden dar falsos positivos.

## Archivos criticos

1. `app/api/plan/build/route.ts`
2. `app/api/plan/simulate/route.ts`
3. `app/api/debug/route.ts`
4. `app/api/debug/snapshot/route.ts`
5. `app/api/auth/register/route.ts`
6. `app/api/auth/login/route.ts`
7. `app/api/settings/credentials/route.ts`
8. `app/api/_plan.ts`
9. `app/api/_schemas.ts`
10. `components/Dashboard.tsx`
11. `components/SettingsPageContent.tsx`
12. `components/DebugPanel.tsx`
13. `components/PlanCalendar.tsx`
14. `src/lib/auth/credential-config.ts`
15. `src/lib/auth/password.ts`
16. `src/lib/auth/session-token.ts`
17. `src/lib/auth/secret-storage.ts`
18. `src/lib/client/browser-http-client.ts`
19. `src/lib/db/connection.ts`
20. `src/lib/db/db-helpers.ts`
21. `src/lib/db/schema.ts`
22. `src/lib/env/deployment.ts`
23. `src/lib/providers/provider-factory.ts`
24. `src/lib/runtime/execution-context-resolver.ts`
25. `src/lib/runtime/build-execution.ts`
26. `src/lib/skills/plan-builder.ts`
27. `src/lib/skills/plan-simulator.ts`
28. `src/shared/types/lap-api.ts`
29. `src/shared/types/debug.ts`
30. `src/shared/types/credential-registry.ts`

## Documentos operativos asociados

- `AGENTS.md`
- `../progress/continuacion-web-nextjs-divs.md`
- `../progress/PROGRESS.md`
