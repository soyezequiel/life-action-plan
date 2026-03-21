# Pulso — Life Action Plan

**Pulso** (anteriormente LAP) es una web app de planificacion personal que usa asistencia de LLM para crear, simular y ejecutar planes de accion estructurados.

Construida con Next.js 15, React 19, TypeScript, PostgreSQL y Drizzle ORM.

## Funcionalidades

- **Intake guiado** — onboarding conversacional que captura objetivos, restricciones y prioridades
- **Generacion de plan con IA** — el LLM construye un plan por fases con hitos y dependencias
- **Chequeo de realidad** — compara horas necesarias vs. disponibles y expone trade-offs
- **Simulacion de plan** — simulacion iterativa semana a semana para detectar conflictos antes de que ocurran
- **Dashboard de ejecucion diaria** — tareas, seguimiento de progreso, rachas y re-planificacion on-demand
- **Exportacion de calendario** — exportacion `.ics` para integracion con calendarios externos
- **Pagos Lightning** — pago por build opcional via Nostr Wallet Connect (NWC)
- **LLM multi-proveedor** — soporta OpenAI, OpenRouter u Ollama local para desarrollo
- **Inspector LLM** — panel de debug integrado con trazas, stream de tokens y snapshots

## Stack

| Capa | Tecnologia |
|------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| UI | React 19, CSS Modules, Framer Motion |
| Lenguaje | TypeScript (strict) |
| Base de datos | PostgreSQL + Drizzle ORM |
| Validacion | Zod (`.strict()` en schemas nuevos) |
| Auth | Tokens de sesion (JWT via `jose`), hash de passwords con Argon2 |
| IA | Vercel AI SDK + `@ai-sdk/openai` |
| Pagos | `@getalby/sdk` (Lightning / NWC) |
| Fechas | Luxon |
| Testing | Vitest + Testing Library |

## Inicio rapido

### Requisitos previos

- Node.js 20+
- PostgreSQL (local o cloud)
- *(Opcional)* Ollama para desarrollo local con LLM

### Instalacion

```bash
# Instalar dependencias
npm install

# Crear archivo de entorno local
cp .env.example .env.local
```

Editar `.env.local` con tus valores:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lap
SESSION_SECRET=<string-aleatoria>
OPENAI_API_KEY=<tu-clave>              # o configurar desde la UI de Settings
OLLAMA_BASE_URL=http://localhost:11434  # opcional, solo para dev local
```

### Base de datos

```bash
# Aplicar schema a la base de datos
npm run db:push
```

### Ejecutar

```bash
npm run dev
```

La app arranca en `http://localhost:3000`.

### Verificar entorno

```bash
# Local: verifica conexion a DB + disponibilidad de Ollama
npm run smoke:local

# Pre-deploy: ejecuta build + chequeos de readiness
npm run smoke:deploy
```

## Scripts

| Script | Descripcion |
|--------|-------------|
| `npm run dev` | Servidor de desarrollo (Turbopack) |
| `npm run build` | Build de produccion |
| `npm run start` | Servidor de produccion |
| `npm run typecheck` | Chequeo de tipos sin emitir |
| `npm run test` | Correr suite de tests |
| `npm run lint` | Lint con ESLint |
| `npm run db:generate` | Generar migraciones Drizzle |
| `npm run db:push` | Aplicar schema a la base de datos |
| `npm run db:migrate` | Ejecutar migraciones pendientes |
| `npm run doctor:local` | Verificar salud del entorno local |
| `npm run doctor:deploy` | Verificar readiness de deploy |
| `npm run smoke:local` | DB push + doctor local |
| `npm run smoke:deploy` | Build + doctor deploy |

## Estructura del proyecto

```
app/                    # Next.js App Router
  api/                  # Route Handlers (REST API)
    auth/               # Registro, login, logout, sesion
    plan/               # Build, simulacion, listado, exportacion
    settings/           # Credenciales, API keys, build preview
    wallet/             # NWC connect, disconnect, status
    intake/             # Intake de perfil
    debug/              # Endpoints del inspector LLM
  intake/               # Pagina de intake
  settings/             # Pagina de configuracion

components/             # Componentes React
  settings/             # Secciones del panel de configuracion
  debug/                # UI del inspector LLM

src/lib/                # Librerias server y cliente
  auth/                 # Autenticacion (sesiones, passwords)
  client/               # Utilidades client-side y vault
  db/                   # Schema Drizzle y helpers
  payments/             # Proveedor NWC, wallet, cobros
  providers/            # Abstraccion de proveedores LLM
  runtime/              # Resolver de contexto de ejecucion
  skills/               # Skills de construccion de plan

src/i18n/               # Internacionalizacion (es-AR)
tests/                  # Tests unitarios y de integracion
```

## Entornos

| Entorno | Base de datos | Proveedor LLM | Proposito |
|---------|--------------|---------------|-----------|
| Dev local | PostgreSQL local | Ollama u OpenAI | Desarrollo diario |
| Vercel preview | PostgreSQL cloud | Proveedor cloud | Validacion pre-merge |
| Vercel prod | PostgreSQL cloud | Proveedor cloud | Produccion |

> Ollama solo esta disponible en desarrollo local. Los deploys en Vercel requieren un proveedor LLM cloud.

## Flujo de usuario

1. **Registro / Login** — crear cuenta o autenticarse
2. **Configurar** — elegir proveedor LLM y opcionalmente conectar wallet Lightning
3. **Intake** — responder preguntas guiadas sobre objetivos y restricciones
4. **Build** — la IA genera un plan por fases con chequeo de realidad
5. **Simular** — simulacion iterativa valida el plan
6. **Ejecutar** — dashboard diario con tareas, progreso y rachas

## Contribuir

El proyecto usa documentos internos para decisiones de arquitectura:

- `AGENTS.md` — contexto del proyecto y estado actual
- `PLAN_LAP_FINAL.md` — source of truth arquitectonica

## Licencia

[MIT](LICENSE)
