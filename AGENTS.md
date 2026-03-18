# Contexto para Agentes IA (Codex, Copilot, Cursor, Aider, Claude Code)

> **Leé este archivo COMPLETO antes de escribir una sola línea de código.**
> Source of truth arquitectónica: `PLAN_LAP_FINAL.md`

---

## Qué es LAP

**Life Action Plan** — App desktop Electron + React + TypeScript para crear, simular y ejecutar planes de acción personales con asistencia de LLM. Hackathon La Crypta FOUNDATIONS (Marzo 2026). Pagos Lightning via NWC.

---

## Estado Actual del Proyecto (2026-03-18)

### Completado (Fase 0: pasos 0.1–0.4)

| Paso | Descripción | Estado |
|------|-------------|--------|
| 0.1 | Boilerplate electron-vite (react-ts) | ✅ |
| 0.2 | SQLite nativo compilado (prebuilt Electron 33) | ✅ |
| 0.3 | App.tsx shell vacío (Dashboard placeholder) | ✅ |
| 0.4 | Schemas Zod `.strict()` + Drizzle DB layer | ✅ |

### Pendiente (siguiente en orden)

| Paso | Descripción | Responsable |
|------|-------------|-------------|
| 0.5 | **Intake Express** — 5 preguntas rápidas en React | Frontend (UI) |
| 0.6 | **Provider LLM Base** — `openai-provider.ts` con Vercel AI SDK | Backend |
| 0.7 | **Plan Builder Core** — Skill que genera plan a 1 mes vía LLM → SQLite | Backend |
| 1.1 | Check-in de tareas (botones Dashboard → tRPC) | Full-stack |
| 1.2 | Tracking de hábitos y rachas | Full-stack |
| 2.1 | Provider Lightning (NWC con `@getalby/sdk`) | Backend |

---

## Stack Técnico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Desktop | Electron | 33.x (pinneado — prebuilt binaries) |
| Bundler | electron-vite | 5.x |
| Frontend | React + TypeScript | 19.x |
| DB | better-sqlite3 + drizzle-orm | WAL mode |
| Validation | Zod (`.strict()` obligatorio) | 3.x |
| Fechas | Luxon (NUNCA Date nativo) | 3.x |
| Pagos | @getalby/sdk (NWC) | 3.x |
| LLM (futuro) | Vercel AI SDK (`ai` + `@ai-sdk/openai`) | 3.x |

---

## Estructura de Carpetas

```
src/
├── main/                  # Electron main process
│   ├── index.ts           # Entry point — crea BrowserWindow, inicia DB
│   └── db/
│       ├── connection.ts  # better-sqlite3 init (WAL, integrity check)
│       ├── schema.ts      # Drizzle table definitions (6 tablas)
│       └── db-helpers.ts  # CRUD helpers (profiles, plans, progress, settings, analytics)
├── preload/
│   ├── index.ts           # contextBridge — expone API segura al renderer
│   └── index.d.ts         # Tipos Window.electron / Window.api
├── renderer/
│   ├── index.html         # HTML con CSP
│   └── src/
│       ├── main.tsx       # ReactDOM entry
│       ├── App.tsx        # Shell vacío (TU TRABAJO — Dashboard "Hoy")
│       ├── components/    # (vacío — para crear)
│       ├── lib/           # (vacío — hooks, utils UI)
│       ├── assets/        # (vacío — CSS, SVGs)
│       └── env.d.ts
├── shared/                # Código compartido main↔renderer
│   ├── schemas/
│   │   ├── index.ts       # Barrel exports
│   │   ├── perfil.ts      # Schema Zod completo del perfil (170+ campos)
│   │   ├── rutina-base.ts # Schema de bloques horarios
│   │   └── manifiesto.ts  # Schema del manifest del plan
│   └── types/             # (vacío — tipos IPC compartidos)
├── providers/             # (vacío — para openai-provider.ts, paso 0.6)
├── payments/              # (vacío — para nwc-provider.ts, paso 2.1)
├── skills/                # (vacío — para plan-intake.ts, plan-builder.ts)
├── runtime/               # (vacío — para agent-runtime.ts)
├── auth/                  # (vacío — para token-store.ts con safeStorage)
├── utils/                 # (vacío — para token-tracker.ts, path-slugifier.ts)
├── config/                # (vacío — para lap-config.ts)
├── notifications/         # (vacío — para tray-service.ts)
└── i18n/                  # (vacío — para t(), locale detection)
    └── locales/           # (vacío — para es-AR.json, en-US.json)
```

---

## Base de Datos (SQLite)

**Ubicación**: `{userData}/lap.sqlite` (en Windows: `AppData/Roaming/lap/lap.sqlite`)

### Tablas existentes (Drizzle schema en `src/main/db/schema.ts`)

| Tabla | Propósito |
|-------|-----------|
| `profiles` | Datos del perfil (JSON validado por Zod) |
| `plans` | Planes creados (con slug único y manifest JSON) |
| `plan_progress` | Progreso de tareas/hábitos/hitos |
| `settings` | Key-value config (locale, timezone, etc.) |
| `analytics_events` | Telemetría local privacy-first |
| `cost_tracking` | Seguimiento de costos LLM por operación |

### Pragmas activos
- `journal_mode = WAL`
- `foreign_keys = ON`
- `busy_timeout = 5000`
- Integrity check en boot

---

## Reglas INQUEBRANTABLES

1. **i18n**: CERO strings hardcodeadas. Todo via `t('clave')` de `src/i18n/`
2. **Abuela-Proof**: NUNCA mostrar "API", "LLM", "JSON", "Token" en UI
3. **SQLite**: NUNCA JSONs planos para estado mutable. Solo SQLite WAL
4. **Rutas POSIX**: `path.posix` siempre. Cero backslashes
5. **Luxon**: NUNCA `new Date()` para cálculos. Usar zonaHoraria del perfil
6. **Zod `.strict()`**: SIEMPRE en schemas nuevos
7. **Seguridad**: Cero `bash`, cero ejecución OS, Path Traversal bloqueado
8. **safeStorage**: API keys via `electron.safeStorage`, NUNCA en JSON plano

---

## Decisiones Técnicas Importantes

### ¿Por qué Electron 33 y no 39?
El sistema no tiene VS Build Tools con workload C++ instalado. Electron 39 no tiene prebuilt binaries para better-sqlite3 → node-gyp falla. Electron 33 sí tiene prebuilts. Si se instala el workload "Desktop development with C++" en VS2022, se puede upgradear.

### ¿Por qué electron-vite y no webpack?
`externalizeDepsPlugin()` en el main process evita que Vite intente bundlear módulos nativos C++ (better-sqlite3). Esto está configurado en `electron.vite.config.ts`.

### ¿Dónde está la referencia de Lightning/NWC?
En `_referencia_lightning/` (gitignored). Contiene ejemplos funcionales de `@getalby/sdk`:
- `nwc-connect.js` — `new nwc.NWCClient({ nostrWalletConnectUrl })`
- `pay-invoice.js` — `client.payInvoice({ invoice })`
- `create-invoice.js` — `client.makeInvoice({ amount, description })`

### Protocolo de trabajo dual-AI
- **Claude Code / Backend**: DB, main process, providers, skills, runtime, payments, scripts de build
- **Codex / Copilot / Frontend**: UI React, CSS, componentes, animaciones framer-motion
- No sobreescribir archivos del otro sin leer primero

---

## Cómo Arrancar

```bash
npm install --ignore-scripts          # Instalar deps sin compilar nativos
cd node_modules/better-sqlite3 && npx prebuild-install --runtime electron --target 33.4.0 --arch x64  # Binario nativo
cd ../.. && node node_modules/electron/install.js   # Binario Electron
npm run dev                            # Abre la ventana Electron
```

---

## Comandos Útiles

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | electron-vite dev (HMR + Electron) |
| `npm run build` | Build producción |
| `npm run build:win` | Build + empaquetado Windows |
| `npm run build:mac` | Build + empaquetado macOS |
| `npm run typecheck` | TypeScript check (node + web) |
| `npm run test` | Vitest |
| `npm run db:generate` | Drizzle kit generate migrations |
| `npm run db:migrate` | Drizzle kit migrate |
