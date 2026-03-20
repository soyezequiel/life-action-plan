# Instrucciones para Claude Code (LAP Project)

## Carga Determinística
Leé `AGENTS.md` — contiene el estado actual del proyecto, estructura de carpetas, stack, DB, y decisiones técnicas.
Source of truth arquitectónica: `PLAN_LAP_FINAL.md`.

## Contexto de Migración
El proyecto migró de **Electron + SQLite** a **Next.js 15 (App Router) + PostgreSQL (Neon) + Vercel**.
Electron fue **eliminado completamente**. No existen `src/main/`, `src/preload/`, ni IPC channels.

## Reglas Críticas
1. **i18n-Ready Obligatorio**: NUNCA hardcodees strings. TODO via `t('clave')` de `src/i18n/`.
2. **Cero Jerga Técnica ("Abuela-Proof")**: La UI nunca menciona "LLM", "API", "JSON", "Tokens".
3. **PostgreSQL + Drizzle**: Estado mutable en PostgreSQL (Neon) + `drizzle-orm`. NUNCA JSONs planos ni SQLite.
4. **Rutas POSIX**: `path.posix` en código server. Cero backslashes.
5. **Aislamiento**: No confundas tus capacidades (Claude Code) con las restricciones de seguridad del runtime de LAP.
6. **Timezones Estrictas**: `luxon` con `profile.datosPersonales.ubicacion.zonaHoraria`. NUNCA `new Date()`.
7. **Zod `.strict()`**: Obligatorio en todo schema nuevo.
8. **API Keys server-side**: Via env vars de Vercel o encriptadas en DB con `aes-256-gcm`. NUNCA en client-side.
9. **No Electron**: CERO imports de `electron`, `better-sqlite3`, `ipcRenderer`, `ipcMain`, `contextBridge`, `safeStorage`. Si los ves en código existente, eliminalos.
10. **Next.js patterns**: Usar App Router (no Pages Router). Server Components por defecto, `'use client'` solo donde se necesite interactividad.
