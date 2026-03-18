# Instrucciones para Claude Code (LAP Project)

## Carga Determinística
Leé `AGENTS.md` — contiene el estado actual del proyecto, estructura de carpetas, stack, DB, y decisiones técnicas.
Source of truth arquitectónica: `PLAN_LAP_FINAL.md`.

## Reglas Críticas
1. **i18n-Ready Obligatorio**: NUNCA hardcodees strings. TODO via `t('clave')` de `src/i18n/`.
2. **Cero Jerga Técnica ("Abuela-Proof")**: La UI nunca menciona "LLM", "API", "JSON", "Tokens".
3. **SQLite vs JSON**: Estado mutable en `better-sqlite3` WAL mode + `drizzle-orm`, NUNCA JSONs planos.
4. **Rutas POSIX**: `path.posix` siempre. Cero backslashes.
5. **Aislamiento**: No confundas tus capacidades (Claude Code) con las restricciones de seguridad del runtime de LAP.
6. **Timezones Estrictas**: `luxon` con `profile.datosPersonales.ubicacion.zonaHoraria`. NUNCA `new Date()`.
7. **Zod `.strict()`**: Obligatorio en todo schema nuevo.
8. **safeStorage**: API keys via `electron.safeStorage`, NUNCA en JSON plano.
