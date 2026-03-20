# Contexto para Agentes IA (Codex, Copilot, Cursor, Aider, Claude Code)

> **Leé este archivo COMPLETO antes de escribir una sola línea de código.**
> Source of truth arquitectónica: `PLAN_LAP_FINAL.md`

---

## Qué es LAP

**Life Action Plan** — Web app **Next.js 15 (App Router)** desplegada en **Vercel** con React + TypeScript y PostgreSQL cloud para crear, simular y ejecutar planes de acción personales con asistencia de LLM. **Electron fue eliminado completamente — la app es 100% web.** Hackathon La Crypta FOUNDATIONS (Marzo 2026). Pagos Lightning via NWC.

---

## Estado Actual del Proyecto (2026-03-20)

### Completado (era Electron/browser-first — pre-migración Next.js)

| Paso | Descripción | Estado |
|------|-------------|--------|
| 0.1–0.7 | Boilerplate, DB, Intake, Provider LLM, Plan Builder | ✅ (requiere migración a Next.js) |
| 1.1–1.4 | Check-in, Rachas, Exportación .ics | ✅ (requiere migración a Next.js) |
| — | Schemas Zod `.strict()` + Drizzle DB layer | ✅ (reutilizable — solo cambiar driver) |
| — | Provider LLM — `provider-factory.ts` con Vercel AI SDK | ✅ (reutilizable directamente) |
| — | Simulación de plan con progreso en vivo | ✅ (adaptar streaming a Route Handlers) |
| — | Inspector LLM / debug panel con tracing | ✅ (adaptar a Next.js) |
| — | Cost summary y tracking base por operación | ✅ (reutilizable) |
| — | Wallet status + conexión NWC | ✅ (adaptar storage de safeStorage a DB encriptada) |
| — | Ollama fallback automático | ✅ (reutilizable) |
| — | i18n, framer-motion, CSS base, streaks | ✅ (reutilizable) |
| — | 109 tests Vitest | ✅ (adaptar los que referencien Electron/IPC) |

### Pendiente: Migración Next.js + Vercel

| Paso | Descripción | Responsable | Notas |
|------|-------------|-------------|-------|
| M.0 | Scaffold Next.js 15 + PostgreSQL (Neon) + Drizzle setup | Full-stack | Crear proyecto Next.js, migrar schema, conectar DB cloud |
| M.1 | Migrar IPC channels → API Route Handlers | Backend | Cada canal IPC se convierte en `app/api/*/route.ts` |
| M.2 | Migrar frontend React de `src/renderer/` a `app/` + `components/` | Frontend | Reemplazar `window.api.*` por fetch a `/api/*` o Server Actions |
| M.3 | Reemplazar `electron.safeStorage` por encriptación server-side | Backend | API keys per-user en PostgreSQL con aes-256-gcm |
| M.4 | Adaptar streaming (plan:build, simulate) a Route Handler ReadableStream | Backend | Vercel AI SDK tiene soporte nativo para Next.js streaming |
| M.5 | Eliminar todas las dependencias de Electron | Full-stack | Desinstalar electron, electron-vite, better-sqlite3, etc. |
| M.6 | Primer deploy a Vercel (smoke test) | Full-stack | intake → build → dashboard funcional en Vercel |
| 3.1 | Pulido visual + accesibilidad real | Frontend | Refinar jerarquía visual, motion, estados vacíos, `prefers-reduced-motion` |
| 3.3 | Provider Lightning productizado | Backend | Cerrar UX, errores, budget y cobro real por operación |
| 3.4 | Endurecimiento del inspector LLM | Full-stack | Volverlo criterio de aceptación para features largas |
| 3.5 | Remoción de últimos placeholders / modo demo explícito | Full-stack | Ninguna ruta real detrás del mock sin señal visible |

### Migración Next.js + Vercel (2026-03-20)

- **Electron eliminado**. No existe `src/main/`, `src/preload/`, ni IPC. La app es 100% web.
- `npm run dev` levanta Next.js dev server con Turbopack.
- La lógica de negocio vive en `src/lib/` (server-only): skills, runtime, providers, db.
- Los componentes React viven en `components/` y `app/`.
- Las rutas API viven en `app/api/*/route.ts`.
- La DB es PostgreSQL cloud (Neon/Supabase) con Drizzle ORM.
- Deploy automático en Vercel.

### Protocolo de Ejecucion Para IDEs Agenticos

- No continuar una unidad si no produce feedback verificable.
- Cada unidad debe cerrar con una evidencia automática y una visible.
- Si el cambio toca `app/api/`, `src/lib/db/`, o schemas compartidos, verificar con `npm run build` además de dev (Next.js build detecta errores que dev no).
- Diferenciar siempre validación en ruta real vs fallback/demo.
- Persistir el progreso de continuación en un plan atomizado y actualizarlo al cerrar cada unidad.
- **NUNCA** importar nada de `electron`, `better-sqlite3`, `src/main/`, o `src/preload/`. Estos módulos ya no existen.
- Matriz vigente de smoke/paridad browser-Electron: `matriz-smoke-browser-electron.md`.

---

## Flujo actual del usuario (E2E)

1. Abre la app → si tiene perfil previo, restaura sesión automáticamente
2. Sin perfil: ve "LAP — Tu plan de vida" + botón "Crear mi plan"
3. Intake Express: 5 preguntas secuenciales (nombre, edad, ciudad, ocupación, objetivo)
4. Dashboard: "¡Hola, {nombre}!" + "Todavía no tenés un plan armado"
5. Click "Armar con asistente en línea" → pantalla de API key → LLM genera plan
6. Click "Armar con asistente local" → Ollama genera plan (sin API key)
7. Plan generado: eventos semanales se seedean como filas en `plan_progress` con fecha real
8. Dashboard muestra actividades de hoy ordenadas por hora, con ¡Listo!/Deshacer
9. Contador "X de Y listas" se actualiza en tiempo real

---

## API Routes (Next.js Route Handlers)

> Reemplaza los IPC channels de Electron. Cada endpoint vive en `app/api/*/route.ts`. El contrato de tipos está en `src/shared/types/lap-api.ts`.

| Endpoint | Método | Qué hace |
|----------|--------|----------|
| `/api/intake` | POST | Guarda perfil Zod-valid y actualiza `lastProfileId` |
| `/api/plan/build` | POST | Genera plan via LLM (streaming response), persiste manifest y seed de progreso |
| `/api/plan/list` | GET | Lista planes del perfil |
| `/api/plan/simulate` | POST | Revisa viabilidad del plan (streaming response) |
| `/api/plan/export-ics` | POST | Genera y retorna archivo `.ics` |
| `/api/profile` | GET | Devuelve perfil por ID (query param) |
| `/api/profile/latest` | GET | Devuelve ultimo profileId guardado |
| `/api/progress/list` | GET | Lista tareas del plan para una fecha |
| `/api/progress/toggle` | POST | Toggle completado de una tarea |
| `/api/streak` | GET | Devuelve racha actual y mejor racha del plan |
| `/api/wallet/status` | GET | Estado de conexion y saldo/budget |
| `/api/wallet/connect` | POST | Guarda conexion NWC (encriptada en DB) |
| `/api/wallet/disconnect` | POST | Elimina conexion NWC |
| `/api/cost` | GET | Resume tokens y costo del plan |
| `/api/debug` | GET/POST | Enable/disable/status del inspector LLM |
| `/api/debug/snapshot` | GET | Snapshot de trazas |

> **Streaming**: Los endpoints `/api/plan/build` y `/api/plan/simulate` retornan `ReadableStream` para progreso en vivo. En el cliente se consumen con `useChat()` o fetch + `ReadableStream` reader.

---

## Stack Técnico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Next.js (App Router) | 15.x |
| Deploy | Vercel | — |
| Frontend | React + TypeScript | 19.x |
| DB | PostgreSQL (Neon serverless) + drizzle-orm | — |
| Validation | Zod (`.strict()` obligatorio) | 3.x |
| Fechas | Luxon (NUNCA Date nativo) | 3.x |
| Pagos | @getalby/sdk (NWC) | 3.x |
| LLM | Vercel AI SDK (`ai` + `@ai-sdk/openai`) | 3.x / 6.x |
| Animaciones | framer-motion | 12.x |
| Tests | Vitest + Playwright | 2.x |
| ~~Desktop~~ | ~~Electron~~ | **ELIMINADO** |
| ~~DB local~~ | ~~better-sqlite3~~ | **ELIMINADO** |

---

## Estructura de Carpetas (Next.js 15)

> Arquitectura: `app/` = páginas y API routes Next.js, `components/` = UI React, `src/lib/` = lógica server-only, `src/shared/` = tipos y schemas compartidos, `src/i18n/` = traducciones.

```
app/                           # Next.js App Router
├── layout.tsx                 # Root layout (providers, i18n, fonts)
├── page.tsx                   # Landing / Dashboard
├── globals.css                # Estilos globales
├── intake/page.tsx            # Intake Express
├── plan/
│   ├── page.tsx               # Vista del plan
│   └── [planId]/page.tsx      # Plan específico
├── settings/page.tsx          # Configuración (API key, wallet)
└── api/                       # API Route Handlers (serverless)
    ├── intake/route.ts
    ├── plan/build/route.ts    # Streaming response
    ├── plan/list/route.ts
    ├── plan/simulate/route.ts # Streaming response
    ├── plan/export-ics/route.ts
    ├── profile/route.ts
    ├── profile/latest/route.ts
    ├── progress/list/route.ts
    ├── progress/toggle/route.ts
    ├── streak/route.ts
    ├── wallet/status/route.ts
    ├── wallet/connect/route.ts
    ├── wallet/disconnect/route.ts
    ├── cost/route.ts
    └── debug/route.ts

components/                    # Componentes React (client-side)
├── Dashboard.tsx
├── IntakeExpress.tsx
├── debug/DebugTokenStream.tsx
└── ui/                        # Componentes UI reutilizables

src/
├── lib/                       # Lógica server-only
│   ├── db/
│   │   ├── connection.ts      # Drizzle + Neon/postgres-js init
│   │   ├── schema.ts          # Drizzle table definitions (PostgreSQL)
│   │   └── db-helpers.ts      # CRUD helpers
│   ├── skills/
│   │   ├── skill-interface.ts
│   │   ├── plan-intake.ts
│   │   └── plan-builder.ts
│   ├── runtime/types.ts       # LLMMessage, AgentRuntime, SkillContext, SkillResult
│   ├── providers/
│   │   └── provider-factory.ts
│   ├── payments/              # NWC provider
│   └── auth/                  # API key encryption, auth helpers
├── shared/                    # Código compartido client↔server
│   ├── schemas/
│   │   ├── index.ts
│   │   ├── perfil.ts          # Schema Zod completo del perfil
│   │   ├── rutina-base.ts
│   │   └── manifiesto.ts
│   └── types/
│       └── lap-api.ts         # Request/response types
├── i18n/
│   ├── index.ts               # t(key, params?) — traducción con interpolación
│   └── locales/
│       └── es-AR.json         # Español rioplatense (voseo)
└── config/                    # Configuración de la app

public/                        # Assets estáticos (favicons, OG images)

tests/
├── i18n.test.ts
├── plan-intake.test.ts
├── plan-builder.test.ts
├── provider-factory.test.ts
├── schemas.test.ts
├── api/                       # Tests de API routes
├── e2e/                       # Playwright E2E
├── fixtures/
└── qa-chaos/
```

---

## Base de Datos (PostgreSQL — Neon serverless)

**Ubicación**: PostgreSQL cloud en Neon (o Supabase). Connection string en `DATABASE_URL` env var.

### Tablas existentes (Drizzle schema en `src/lib/db/schema.ts`)

| Tabla | Propósito |
|-------|-----------|
| `profiles` | Datos del perfil (JSONB validado por Zod) |
| `plans` | Planes creados (con slug único y manifest JSONB) |
| `plan_progress` | Progreso de tareas/hábitos/hitos (fecha, tipo, completado, notas JSONB) |
| `settings` | Key-value config (lastProfileId, locale, timezone, etc.) |
| `user_settings` | API keys encriptadas per-user, wallet NWC strings |
| `analytics_events` | Telemetría privacy-first |
| `cost_tracking` | Seguimiento de costos LLM por operación |

### Notas de migración SQLite → PostgreSQL
- `integer` primary keys → `serial` o `uuid`
- `text` JSON fields → `jsonb` (permite queries nativas sobre JSON)
- `boolean` (0/1 en SQLite) → `boolean` nativo de PostgreSQL
- No hay pragmas — PostgreSQL maneja WAL, FK, y concurrencia de forma nativa
- Connection pooling automático con Neon serverless driver

### Notas sobre plan_progress
- `notas` contiene JSONB: `{ hora: "08:00", duracion: 30, categoria: "estudio" }`
- `tipo` puede ser `"tarea"` o `"habito"` — usado para streaks
- `completado` es `boolean` nativo
- `fecha` es ISO date string (YYYY-MM-DD) o `date` de PostgreSQL
- `seedProgressFromEvents()` convierte eventos del LLM a filas individuales con fecha real

---

## i18n Keys disponibles (es-AR.json)

> Source of truth actual: `src/i18n/locales/es-AR.json`. La lista de abajo es orientativa y ya no es exhaustiva.

```
app.name, app.tagline
intake.title, intake.subtitle, intake.questions.{nombre|edad|ubicacion|ocupacion|objetivo}
intake.placeholders.{nombre|edad|ubicacion|ocupacion|objetivo}
intake.buttons.{next|back|finish|skip}, intake.progress, intake.saving, intake.saved, intake.error
dashboard.title, dashboard.empty, dashboard.start, dashboard.greeting
dashboard.today_tasks, dashboard.no_tasks_today, dashboard.completed, dashboard.pending
dashboard.done_count, dashboard.all_done, dashboard.check_in, dashboard.undo
dashboard.minutes, dashboard.plan_name, dashboard.build_plan
dashboard.build_openai, dashboard.build_ollama
dashboard.category.{estudio|ejercicio|trabajo|habito|descanso|otro}
builder.thinking, builder.generating, builder.done, builder.error, builder.retry, builder.preview
settings.apikey_title, settings.apikey_hint, settings.apikey_placeholder, settings.apikey_confirm
ui.thinking, ui.loading, ui.cancel, ui.confirm, ui.close, ui.save
errors.connection_busy, errors.generic, errors.no_api_key, errors.budget_exceeded
```

---

## Reglas INQUEBRANTABLES

1. **i18n**: CERO strings hardcodeadas. Todo via `t('clave')` de `src/i18n/`
2. **Abuela-Proof**: NUNCA mostrar "API", "LLM", "JSON", "Token" en UI
3. **PostgreSQL**: NUNCA JSONs planos ni SQLite para estado mutable. Solo PostgreSQL via Drizzle
4. **Rutas POSIX**: `path.posix` siempre en código server. Cero backslashes
5. **Luxon**: NUNCA `new Date()` para cálculos. Usar zonaHoraria del perfil
6. **Zod `.strict()`**: SIEMPRE en schemas nuevos
7. **Seguridad**: Cero `bash`, cero ejecución OS, Path Traversal bloqueado
8. **API Keys server-side**: API keys via env vars (Vercel) o encriptadas en DB. NUNCA en client-side ni en JSON plano
9. **No Electron**: CERO imports de `electron`, `better-sqlite3`, `ipcRenderer`, `ipcMain`, `contextBridge`, `safeStorage`

---

## Decisiones Técnicas Importantes

### ¿Por qué Next.js y no Vite + Express?
Next.js 15 con App Router provee: React Server Components, API Route Handlers serverless, streaming nativo, deploy a Vercel con zero-config, preview deploys por PR, y integración nativa con Vercel AI SDK. Elimina la necesidad de mantener un servidor Express separado.

### ¿Por qué PostgreSQL (Neon) y no SQLite?
Vercel es serverless — no hay disco persistente. Neon provee PostgreSQL serverless con connection pooling automático, compatible con Drizzle ORM. El schema se migra casi 1:1 desde SQLite.

### ¿Por qué se eliminó Electron?
Para poder deployar en Vercel como web app accesible desde cualquier navegador sin instalación. Electron requiere binarios nativos (better-sqlite3, safeStorage) incompatibles con serverless.

### ¿Por qué el provider factory usa `indexOf` para parsear modelId?
Porque `"ollama:qwen3:8b".split(':')` da 3 partes y pierde `:8b`. Se usa `indexOf(':')` + `slice()` para separar solo en el primer `:`.

### ¿Dónde está la referencia de Lightning/NWC?
En `_referencia_lightning/` (gitignored). Contiene ejemplos funcionales de `@getalby/sdk`:
- `nwc-connect.js` — `new nwc.NWCClient({ nostrWalletConnectUrl })`
- `pay-invoice.js` — `client.payInvoice({ invoice })`
- `create-invoice.js` — `client.makeInvoice({ amount, description })`

### Protocolo de trabajo dual-AI
- **Claude Code / Backend**: DB, API routes, providers, skills, runtime, payments
- **Codex / Copilot / Frontend**: UI React, CSS, componentes, animaciones framer-motion
- No sobreescribir archivos del otro sin leer primero

---

## Cómo Arrancar

```bash
npm install                            # Instalar deps (sin binarios nativos!)
cp .env.example .env.local             # Configurar DATABASE_URL, OPENAI_API_KEY
npm run db:push                        # Crear/actualizar tablas en PostgreSQL
npm run dev                            # Next.js dev server con Turbopack
npm run test                           # Vitest
```

---

## Comandos Útiles

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Next.js dev server (Turbopack) en http://localhost:3000 |
| `npm run build` | Build producción Next.js |
| `npm run start` | Servir build de producción localmente |
| `npm run typecheck` | TypeScript check |
| `npm run test` | Vitest |
| `npm run db:generate` | Drizzle kit generate migrations |
| `npm run db:push` | Drizzle kit push schema a PostgreSQL |
| `npm run db:migrate` | Drizzle kit migrate |
| `npm run lint` | ESLint + Next.js lint rules |
| `vercel` | Deploy preview manual |
| `vercel --prod` | Deploy producción manual |

---

## Prioridades actuales

### Prioridad 0: Migración a Next.js + Vercel (BLOQUEANTE)
- Scaffold Next.js 15 con App Router.
- Migrar schema Drizzle de SQLite a PostgreSQL (Neon).
- Convertir IPC channels a API Route Handlers.
- Migrar componentes React de `src/renderer/` a `app/` + `components/`.
- Eliminar todas las dependencias de Electron.
- Primer deploy funcional a Vercel.

### Prioridad 1: QA post-migración
- Mantener `npm run typecheck` y `npm run test` verdes.
- Verificar que cada feature funcione en Vercel deploy (no solo localhost).
- Adaptar tests que referencien Electron/IPC/SQLite.

### Prioridad 2: Frontera clara entre ruta real, fallback y demo
- Ninguna validacion debe quedar ambigua respecto de si corrio contra backend real o mock/demo.
- El frontend debe mostrar señales visibles de fallback/demo sin tapar errores HTTP.

### Prioridad 3: Pulido visual + accesibilidad
- Refinar jerarquía visual, estados vacíos, errores y cargas.
- Verificar `prefers-reduced-motion`, foco visible, teclado, contraste.
- Mobile-first responsive.

### Prioridad 4: UX de wallet y costos
- Cerrar estados de conexion, error, saldo, budget y costo estimado.
- Copy Abuela-Proof, sin jerga técnica visible.

## Tareas para Codex (Frontend)

> Bloque histórico pre-migración. Las tareas de CSS/streaks/animaciones ya están implementadas. El backlog actual es la migración a Next.js (ver Prioridad 0 arriba).

### Post-migración: Tareas de frontend
- Adaptar componentes de `src/renderer/` a `components/` y `app/` de Next.js
- Reemplazar `window.api.*` por fetch a `/api/*` o Server Actions
- Verificar que CSS, framer-motion, y i18n funcionen en Next.js
- Categorías con color-coding: estudio=azul, ejercicio=verde, trabajo=gris, habito=violeta, descanso=naranja
- CSS Modules o `app/globals.css` — **NO usar Tailwind** (a menos que se decida explícitamente migrar)
- Streaks: adaptar de IPC `streak:get` a fetch `/api/streak`
- Animaciones framer-motion: mantener las existentes, verificar que funcionen con Next.js App Router
