# Contexto para Agentes IA (Codex, Copilot, Cursor, Aider, Claude Code)

> **Leé este archivo COMPLETO antes de escribir una sola línea de código.**
> Source of truth arquitectónica: `PLAN_LAP_FINAL.md`

---

## Qué es LAP

**Life Action Plan** — App browser-first con React + TypeScript y backend local compartido para crear, simular y ejecutar planes de acción personales con asistencia de LLM. Electron queda como shell opcional de escritorio. Hackathon La Crypta FOUNDATIONS (Marzo 2026). Pagos Lightning via NWC.

---

## Estado Actual del Proyecto (2026-03-19)

### Completado

| Paso | Descripción | Estado |
|------|-------------|--------|
| 0.1 | Boilerplate electron-vite (react-ts) | ✅ |
| 0.2 | SQLite nativo compilado (prebuilt Electron 33) | ✅ |
| 0.3 | App.tsx shell vacío (Dashboard placeholder) | ✅ |
| 0.4 | Schemas Zod `.strict()` + Drizzle DB layer | ✅ |
| 0.5 | Intake Express — 5 preguntas con labels i18n, IPC save, React form | ✅ |
| 0.6 | Provider LLM — `provider-factory.ts` con Vercel AI SDK (OpenAI + Ollama) | ✅ |
| 0.7 | Plan Builder Core — skill que genera plan a 1 mes vía LLM → SQLite | ✅ |
| 1.1 | Check-in de tareas — Dashboard con botones ¡Listo!/Deshacer → IPC toggle → SQLite | ✅ |
| 1.2 | Tracking de hábitos y rachas | ✅ |
| 1.4 | Exportación `.ics` | ✅ |
| — | Session restore — `profile:latest` IPC, guarda `lastProfileId` en settings | ✅ |
| — | API key screen — reemplaza `prompt()` nativo con pantalla i18n Abuela-Proof | ✅ |
| — | Simulación de plan con progreso en vivo | ✅ |
| — | Inspector LLM / debug panel con tracing | ✅ |
| — | Cost summary y tracking base por operación | ✅ |
| — | Wallet status + conexión NWC con secure storage desktop | ✅ |
| — | Ollama fallback automático | ✅ |
| — | Backend local compartido en `src/server/` | ✅ |
| — | Cliente browser-first compartido + `AppServicesProvider` | ✅ |
| — | Mock API reducida a fallback/demo explícito | ✅ |
| — | Migración browser-first — `npm run dev` web, backend local compartido, Electron secundario | ✅ |
| — | Tests — 93 tests actuales | ✅ |

### Pendiente Real Desde El Estado Browser-First

| Paso | Descripción | Responsable | Notas |
|------|-------------|-------------|-------|
| 3.1 | Pulido visual browser-first + accesibilidad real | Frontend | Ya hay UI funcional, pero falta refinar jerarquía visual, motion, estados vacíos y `prefers-reduced-motion` |
| 3.2 | QA matrix browser/Electron con smoke reproducible | Full-stack | Cada feature crítica debe validarse en web y shell desktop con evidencia observable |
| 3.3 | Provider Lightning productizado | Backend | La base NWC existe, pero falta cerrar UX, errores, budget y cobro real por operación |
| 3.4 | Endurecimiento del inspector LLM y observabilidad | Full-stack | El debug panel existe; falta volverlo criterio de aceptación para features largas y rutas de error |
| 3.5 | Remoción de últimos placeholders / modo demo explícito | Full-stack | Ninguna ruta real debe esconderse detrás del mock sin señal visible |

### Actualizacion Browser-First (2026-03-19)

- `npm run dev` es el entrypoint principal y levanta la app web con backend local.
- `npm run dev:electron` existe para validar la shell desktop y las integraciones nativas.
- El renderer no debe tomar `window.api` como contrato principal. La capa base es el cliente compartido/browser-first.
- `src/server/` concentra el backend local reutilizable por web y Electron.
- `src/main/` y `src/preload/` deben mantenerse finos: adaptadores de desktop, no centro de la logica de negocio.

### Protocolo de Ejecucion Para IDEs Agenticos

- No continuar una unidad si no produce feedback verificable.
- Cada unidad debe cerrar con una evidencia automática y una visible.
- Si el cambio toca `src/server/`, `src/main/`, `src/preload/`, contratos compartidos o transporte, reiniciar en limpio; HMR no alcanza.
- Diferenciar siempre validación en ruta real vs fallback/demo.
- Persistir el progreso de continuación en un plan atomizado y actualizarlo al cerrar cada unidad.
- Documento operativo vigente para esa continuación: `continuacion-browser-first-divs.md`.

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

## IPC Channels (7 handlers)

| Channel | Dirección | Qué hace |
|---------|-----------|----------|
| `intake:save` | renderer→main | Guarda perfil Zod-valid + setea `lastProfileId` |
| `plan:build` | renderer→main | Genera plan vía LLM, seedea progress en SQLite |
| `profile:get` | renderer→main | Devuelve perfil por ID |
| `profile:latest` | renderer→main | Devuelve último profileId de settings (session restore) |
| `plan:list` | renderer→main | Lista planes del perfil |
| `progress:list` | renderer→main | Tareas del plan para una fecha |
| `progress:toggle` | renderer→main | Toggle completado de una tarea |

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
| LLM | Vercel AI SDK (`ai` + `@ai-sdk/openai`) | 3.x / 6.x |
| Tests | Vitest | 2.x |

---

## Estructura de Carpetas

> Nota de vigencia: el bloque de abajo conserva parte de la estructura original Electron-first. Para trabajar sobre el repo actual, pensá la arquitectura así: `src/renderer` = app principal browser-first, `src/server` = backend local compartido, `src/main`/`src/preload` = shell Electron y extras nativos.

```
src/
├── main/                  # Electron main process
│   ├── index.ts           # Entry point — crea BrowserWindow, inicia DB, registra IPC
│   ├── ipc-handlers.ts    # 7 IPC handlers (intake, plan, profile, progress)
│   └── db/
│       ├── connection.ts  # better-sqlite3 init (WAL, integrity check)
│       ├── schema.ts      # Drizzle table definitions (6 tablas)
│       └── db-helpers.ts  # CRUD helpers (profiles, plans, progress, settings, analytics)
├── preload/
│   ├── index.ts           # contextBridge — expone window.api (7 métodos)
│   └── index.d.ts         # Tipos LapAPI para Window.api
├── renderer/
│   ├── index.html         # HTML con CSP
│   └── src/
│       ├── main.tsx       # ReactDOM entry (instala mock API si no hay Electron)
│       ├── App.tsx        # View state machine (dashboard → intake → apikey → building → plan)
│       ├── mock-api.ts    # Mock completo para dev en browser sin Electron
│       ├── components/
│       │   ├── Dashboard.tsx      # Lista de tareas del día con check-in, contador, build buttons
│       │   └── IntakeExpress.tsx  # 5-step form con labels i18n
│       ├── lib/           # (vacío — hooks, utils UI)
│       ├── assets/        # (vacío — CSS, SVGs)
│       └── env.d.ts
├── shared/                # Código compartido main↔renderer
│   ├── schemas/
│   │   ├── index.ts       # Barrel exports
│   │   ├── perfil.ts      # Schema Zod completo del perfil (170+ campos)
│   │   ├── rutina-base.ts # Schema de bloques horarios
│   │   └── manifiesto.ts  # Schema del manifest del plan
│   └── types/
│       └── ipc.ts         # IntakeExpressData, PlanBuildResult, ProgressRow, etc.
├── providers/
│   └── provider-factory.ts # getProvider("openai:gpt-4o-mini" | "ollama:qwen3:8b", config)
├── skills/
│   ├── skill-interface.ts  # Skill { name, tier, getSystemPrompt(), run() }
│   ├── plan-intake.ts      # Intake Express: 5 respuestas → perfil Zod-valid con defaults
│   └── plan-builder.ts     # Plan Builder: perfil → LLM → JSON eventos → SQLite
├── runtime/
│   └── types.ts            # LLMMessage, AgentRuntime, SkillContext, SkillResult
├── i18n/
│   ├── index.ts            # t(key, params?) — traducción con interpolación
│   └── locales/
│       └── es-AR.json      # Español rioplatense (voseo) — ALL keys used by UI
├── payments/              # (vacío — para nwc-provider.ts, paso 2.1)
├── auth/                  # (vacío — para token-store.ts con safeStorage)
├── utils/                 # (vacío — para token-tracker.ts, ics-generator.ts)
├── config/                # (vacío — para lap-config.ts)
└── notifications/         # (vacío — para tray-service.ts)

tests/
├── i18n.test.ts            # 9 tests — traducciones, interpolación, keys faltantes
├── plan-intake.test.ts     # 10 tests — generación perfil, Zod validation, edge cases
├── plan-builder.test.ts    # 7 tests — system prompt, voseo, categorías, jargon
├── provider-factory.test.ts # 6 tests — OpenAI, Ollama, parseo modelId con ":"
├── schemas.test.ts         # 4 tests — strict mode, rangos, campos extra
├── e2e/                   # (vacío)
├── fixtures/              # (vacío)
└── qa-chaos/              # (vacío)
```

---

## Base de Datos (SQLite)

**Ubicación**: `{userData}/lap.sqlite` (en Windows: `AppData/Roaming/lap/lap.sqlite`)

### Tablas existentes (Drizzle schema en `src/main/db/schema.ts`)

| Tabla | Propósito |
|-------|-----------|
| `profiles` | Datos del perfil (JSON validado por Zod) |
| `plans` | Planes creados (con slug único y manifest JSON) |
| `plan_progress` | Progreso de tareas/hábitos/hitos (fecha, tipo, completado, notas JSON) |
| `settings` | Key-value config (lastProfileId, locale, timezone, etc.) |
| `analytics_events` | Telemetría local privacy-first |
| `cost_tracking` | Seguimiento de costos LLM por operación |

### Pragmas activos
- `journal_mode = WAL`
- `foreign_keys = ON`
- `busy_timeout = 5000`
- Integrity check en boot

### Notas sobre plan_progress
- `notas` contiene JSON: `{ hora: "08:00", duracion: 30, categoria: "estudio" }`
- `tipo` puede ser `"tarea"` o `"habito"` — usado para streaks en paso 1.2
- `completado` es boolean (0/1 en SQLite)
- `fecha` es ISO date string (YYYY-MM-DD)
- `seedProgressFromEvents()` convierte eventos del LLM a filas individuales con fecha real

---

## i18n Keys disponibles (es-AR.json)

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

### ¿Por qué el provider factory usa `indexOf` para parsear modelId?
Porque `"ollama:qwen3:8b".split(':')` da 3 partes y pierde `:8b`. Se usa `indexOf(':')` + `slice()` para separar solo en el primer `:`.

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
npm run dev                            # Modo web browser-first
npm run dev:electron                   # Abre la shell Electron
npm run dev:browser                    # Alias web (mismo backend local del modo browser-first)
npm run test                           # 36 tests con Vitest
```

---

## Comandos Útiles

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Vite web browser-first |
| `npm run dev:browser` | Alias del modo web browser-first |
| `npm run dev:electron` | electron-vite dev (HMR + Electron) |
| `npm run dev:desktop` | Alias de Electron |
| `npm run build` | Build producción |
| `npm run build:win` | Build + empaquetado Windows |
| `npm run build:mac` | Build + empaquetado macOS |
| `npm run typecheck` | TypeScript check (node + web) |
| `npm run test` | Vitest (36 tests) |
| `npm run db:generate` | Drizzle kit generate migrations |
| `npm run db:migrate` | Drizzle kit migrate |

---

## Tareas para Codex (Frontend)

### Prioridad 1: CSS + Styling (paso 1.3)
La app **funciona** pero no tiene CSS. Necesita:
- Dark theme (fondo oscuro, tipografía clara)
- Cards para las tareas del día con bordes redondeados
- Botones con hover/active states
- Intake form centrado con transiciones entre preguntas
- Mobile-friendly (la ventana Electron puede ser redimensionada)
- Categorías con color-coding: estudio=azul, ejercicio=verde, trabajo=gris, habito=violeta, descanso=naranja
- Usar CSS Modules o un archivo global en `src/renderer/src/assets/`
- **NO usar Tailwind** — CSS plano o CSS Modules

### Prioridad 2: Streaks (paso 1.2)
- Consultar `plan_progress` por hábitos (`tipo = 'habito'`) completados en días consecutivos
- Mostrar racha actual en el Dashboard (ej: "5 días seguidos")
- Agregar keys i18n para streaks en `es-AR.json`
- Nuevo IPC: `streak:get(planId)` → `{ current: number, best: number }`

### Prioridad 3: Micro-animaciones
- `framer-motion` (ya NO está instalado — instalar con `npm install framer-motion`)
- Transición fade entre vistas (intake → building → dashboard)
- Check-in: escala + fade del botón al completar
- Contador animado al cambiar "X de Y listas"
