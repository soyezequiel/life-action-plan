# LAP (Life Action Plan)

Web app de planificacion personal construida con Next.js 15, React 19, TypeScript, Drizzle y PostgreSQL.

Estado operativo actual:
- Desarrollo local: `Next.js + PostgreSQL local + Ollama local`
- Target de deploy: `Vercel + PostgreSQL cloud + LLM cloud`
- Electron ya no forma parte del producto

## Antes de tocar codigo

Lee primero:
1. [AGENTS.md](F:/proyectos/planificador-vida/AGENTS.md)
2. [PLAN_LAP_FINAL.md](F:/proyectos/planificador-vida/PLAN_LAP_FINAL.md)

## Reglas base

- Cero imports de `electron`, `better-sqlite3`, `ipcRenderer`, `ipcMain`, `contextBridge` o `safeStorage`
- Toda string de UI via `t('clave')`
- Estado mutable solo en PostgreSQL via Drizzle
- Fechas con `luxon`, no `new Date()` para logica de negocio
- API keys solo server-side
- En local, Ollama se usa desde el servidor Next.js; en Vercel hay que usar un proveedor cloud

## Stack actual

- `next@15`
- `react@19`
- `typescript`
- `drizzle-orm`
- `postgres`
- `zod`
- `luxon`
- `framer-motion`
- `ai` + `@ai-sdk/openai`
- `@getalby/sdk`
- `vitest`

## Arranque local

1. Instala dependencias:

```bash
npm install
```

2. Crea variables locales:

```bash
cp .env.example .env.local
```

3. Configura `DATABASE_URL` en `.env.local`.
   Ejemplo con PostgreSQL local:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lap
```

4. Si vas a usar el asistente local, asegurate de tener Ollama arriba:

```bash
ollama serve
```

5. Prepara el entorno local y verifica DB + Ollama:

```bash
npm run smoke:local
```

6. Arranca la app:

```bash
npm run dev
```

## Scripts utiles

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

## Flujo local esperado

1. Crear perfil en `/intake`
2. Volver al dashboard
3. Generar plan con `Armar con asistente local`
4. Ver tareas del dia
5. Marcar progreso
6. Abrir el Inspector LLM si hace falta diagnostico

## Estructura real del repo

- `app/`: paginas y API routes
- `components/`: UI React
- `src/lib/`: logica server y cliente compartida
- `src/shared/`: tipos y schemas
- `src/i18n/`: traducciones
- `tests/`: unit tests

## Documentos operativos vigentes

- [AGENTS.md](F:/proyectos/planificador-vida/AGENTS.md)
- [PLAN_LAP_FINAL.md](F:/proyectos/planificador-vida/PLAN_LAP_FINAL.md)
- [continuacion-web-nextjs-divs.md](F:/proyectos/planificador-vida/continuacion-web-nextjs-divs.md)
- [matriz-smoke-web.md](F:/proyectos/planificador-vida/matriz-smoke-web.md)
