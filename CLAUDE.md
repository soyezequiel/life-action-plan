# Instrucciones para Claude Code (LAP Project)

## Carga Deterministica

Lee `AGENTS.md` para estado actual del proyecto, estructura de carpetas, stack, DB y decisiones tecnicas.
Source of truth arquitectonica: `PLAN_LAP_FINAL.md`.

## Contexto actual

El proyecto migro de `Electron + SQLite` a `Next.js 15 + PostgreSQL + Vercel`.

Realidad operativa:
- Desarrollo local: `Next.js + PostgreSQL por DATABASE_URL + Ollama local opcional`
- Produccion objetivo: `Vercel + PostgreSQL cloud + proveedor LLM cloud`
- Electron fue eliminado completamente
- No existen `src/main/`, `src/preload` ni IPC como parte del runtime vigente

## Reglas criticas

1. i18n obligatorio: no hardcodear strings de UI
2. Abuela-proof: la UI no debe exponer `LLM`, `API`, `JSON` ni `Tokens`
3. PostgreSQL + Drizzle: estado mutable en PostgreSQL via `DATABASE_URL`
4. Rutas POSIX en codigo server
5. Timezones con `luxon`, no `new Date()` para logica de negocio
6. Zod `.strict()` en schemas nuevos
7. API keys solo server-side o encriptadas en DB
8. No Electron: cero imports de `electron`, `better-sqlite3`, `ipcRenderer`, `ipcMain`, `contextBridge`, `safeStorage`
9. Next.js patterns: App Router, Server Components por defecto, `'use client'` solo donde haga falta

## Notas de entorno

- No asumir Neon como unico entorno de desarrollo; en local puede haber PostgreSQL local
- No asumir Ollama en Vercel; sirve para dev local, no como estrategia de deploy
- Si el cambio toca `app/api/`, `src/lib/db/` o contratos compartidos, validar con `npm run build`
