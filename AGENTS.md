# Contexto para Agentes IA

> Lee este archivo completo antes de modificar codigo.
> Source of truth arquitectonica: `PLAN_LAP_FINAL.md`

## Que es LAP

LAP es una web app Next.js 15 para crear, simular y ejecutar planes de accion personales con asistencia de LLM.

Estado del producto:
- App web 100 por ciento browser-based
- Frontend en `app/` y `components/`
- API Routes en `app/api/*/route.ts`
- Persistencia en PostgreSQL via Drizzle
- Inspector LLM activo para diagnostico
- Electron eliminado del producto y del runtime soportado

## Realidad operativa actual

### Desarrollo local en esta maquina

- `npm run dev` levanta Next.js con Turbopack
- `DATABASE_URL` apunta hoy a PostgreSQL local
- Ollama corre localmente en `http://localhost:11434`
- El flujo esperado es `intake -> build -> dashboard -> inspector`

### Produccion objetivo

- Deploy en Vercel
- PostgreSQL cloud por `DATABASE_URL`
- LLM cloud para `build` y `simulate`
- Ollama no es una opcion realista dentro de Vercel

## Estado actual del repo

### Implementado

- App Router configurado
- Dashboard, intake y settings
- API routes para intake, profile, plan, progress, streak, wallet, cost y debug
- PostgreSQL con Drizzle
- Build de plan con OpenAI u Ollama
- Simulacion de plan
- Exportacion `.ics`
- Inspector LLM con snapshot y streaming
- Tests unitarios con Vitest

### Pendiente real

- Limpieza de residuos legacy y documentacion desalineada
- Frontera mas explicita entre ruta real, fallback y demo
- Hardening de deploy en Vercel con proveedor cloud
- Pulido visual y accesibilidad
- Productizacion de wallet y costos

## Estructura real

```text
app/
  layout.tsx
  page.tsx
  intake/page.tsx
  settings/page.tsx
  api/
    intake/route.ts
    profile/route.ts
    profile/latest/route.ts
    plan/build/route.ts
    plan/list/route.ts
    plan/simulate/route.ts
    plan/export-ics/route.ts
    progress/list/route.ts
    progress/toggle/route.ts
    streak/route.ts
    settings/api-key/route.ts
    wallet/status/route.ts
    wallet/connect/route.ts
    wallet/disconnect/route.ts
    cost/route.ts
    debug/route.ts
    debug/snapshot/route.ts

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

## API routes reales

| Endpoint | Metodo | Estado |
| --- | --- | --- |
| `/api/intake` | `POST` | activo |
| `/api/profile` | `GET` | activo |
| `/api/profile/latest` | `GET` | activo |
| `/api/plan/build` | `POST` | activo, streaming SSE |
| `/api/plan/list` | `GET` | activo |
| `/api/plan/simulate` | `POST` | activo, streaming SSE |
| `/api/plan/export-ics` | `POST` | activo |
| `/api/progress/list` | `GET` | activo |
| `/api/progress/toggle` | `POST` | activo |
| `/api/streak` | `GET` | activo |
| `/api/settings/api-key` | `POST` | activo |
| `/api/wallet/status` | `GET` | activo |
| `/api/wallet/connect` | `POST` | activo |
| `/api/wallet/disconnect` | `POST` | activo |
| `/api/cost` | `GET` | activo |
| `/api/debug` | `GET/POST` | activo |
| `/api/debug/snapshot` | `GET` | activo |

## Reglas inquebrantables

1. i18n: no hardcodear strings de UI
2. Abuela-proof: no mostrar jerga tecnica en la interfaz
3. PostgreSQL: no volver a SQLite para estado mutable
4. Luxon: no usar `new Date()` para logica de negocio
5. Zod `.strict()`: obligatorio en schemas nuevos
6. API keys: solo server-side o encriptadas en DB
7. No Electron: cero imports y cero planificacion de features dependientes de Electron
8. Si el cambio toca `app/api/`, `src/lib/db/` o contratos compartidos, correr `npm run build`
9. Si el cambio toca providers o streaming, verificar tambien un flujo visible real

## Comandos

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run typecheck`
- `npm run test`
- `npm run lint`
- `npm run doctor:local`
- `npm run smoke:local`
- `npm run db:generate`
- `npm run db:push`
- `npm run db:migrate`

## Criterio de validacion

Cada unidad debe cerrar con:
- evidencia automatica: `typecheck`, `test` o `build`
- evidencia visible: UI, stream SSE, inspector, archivo exportado o estado persistido

## Documentos operativos vigentes

- Continuacion atomica: `continuacion-web-nextjs-divs.md`
- Matriz de smoke: `matriz-smoke-web.md`

## Documentos legacy

- `continuacion-browser-first-divs.md`: solo compatibilidad historica
- `matriz-smoke-browser-electron.md`: solo compatibilidad historica

No deben usarse como source of truth.
