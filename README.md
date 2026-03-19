# LAP (Life Action Plan)

> Aplicacion standalone Node.js/TypeScript browser-first para la gestion personal automatizada y local-first. La interfaz principal corre en web/renderer React y Electron queda como shell opcional de escritorio.

Este repositorio está preparado para ser desarrollado mediante IDEs y agentes basados en inteligencia artificial (Claude Code, Cursor, Aider, Windsurf, Copilot, Antigravity, etc.).

## 🤖 Para Asistentes AI / Agentes

**ANTES de modificar e implementar cualquier feature:**
1. Lee detenidamente el documento **[PLAN_LAP_FINAL.md](./PLAN_LAP_FINAL.md)**. Este archivo contiene la Arquitectura, Reglas de UX ("Abuela-Proof"), y especificaciones técnicas que son estrictamente inamovibles.
2. Sigue las instrucciones dictadas en los archivos de reglas específicos de cada entorno: 
   - `CLAUDE.md` (Para Claude Code)
   - `.cursorrules` (Para Cursor)
   - `.windsurfrules` (Para Windsurf)

Todos estos dictan las mismas reglas base:
- **Cero Jerga, UX "Abuela-Proof"**: Nunca exponer LLM, JSON, Tokens. Mensajes empáticos.
- **i18n Obligatorio**: No strings pegadas en el código fuente. Usar `t('key')` provisto por i18n.
- **SQLite (Drizzle + better-sqlite3)** para toda memoria y estado crítico. Cero JSONs en escritura concurrente.
- **Seguridad y Privacidad absoluta**: Modo Air-Gapped disponible (mDNS local). Cero trackings remotos de O.S. Cero path-traversals.
- **Agnóstico al IDE Agéntico**: Dado el alto costo de Claude Code, el proyecto puede transicionar libremente de desarrollo a otras IAs como Codex/Cursor. Todo el source of truth y documentación está en archivos `.md`.

## Instalación para desarrollo

```bash
npm install
# Luego de instalar, reconstruir SQLite si hace conflicto con el header de NodeJS local.
npm run dev           # Web-first
npm run dev:electron  # Shell Electron
```

Arquitectura actual, en una linea:
- Browser-first por defecto: renderer React + backend local compartido.
- Electron solo agrega capacidades nativas de escritorio y empaquetado.

Este proyecto no depende de comandos bash para su desarrollo y se rige por un esquema estándar `src/` modular en Typecript puro.
