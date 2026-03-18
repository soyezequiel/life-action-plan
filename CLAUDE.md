# Instrucciones para Claude Code (LAP Project)

Este es el archivo principal de contexto para Claude Code. 

## Contexto del Proyecto
Estás desarrollando **LAP (Life Action Plan)**, una aplicación standalone en Node.js/TypeScript con UI Desktop (Electron + React).

## Reglas Críticas (Source of Truth)
EL ÚNICO document de referencia valido es `PLAN_LAP_FINAL.md`. Debes consultarlo antes de cualquier decisión de arquitectura.

1. **i18n-Ready Obligatorio**: NUNCA hardcodees strings en español u otro idioma en la UI o en los mensajes de consola dirigidos al usuario. TODO debe pasar por `t('clave')` definido en `src/i18n/`.
2. **Cero Jerga Técnica ("Abuela-Proof")**: La interfaz nunca debe mencionar "LLM", "API", "JSON", "Tokens". Modela la interacción en lenguaje empático.
3. **SQLite vs JSON**: El progreso dinámico y memoria del estado se guarda en `better-sqlite3` (WAL mode) usando `drizzle-orm`, NUNCA en JSONs planos, para evitar bloqueos del file system en Windows.
4. **Rutas POSIX**: Usa siempre `path.posix` para asegurar interoperabilidad Windows/Mac. Todas las barras deben ser `/`.
5. **Aislamiento**: Eres un asistente programador. Al crear los *Skills* de la aplicación (los agentes internos de LAP), esos agentes internos tienen el motor restringido. ¡No confundas tus propias capacidades (Claude Code) con las limitaciones de seguridad que debes programar para el bot de LAP!
6. **Timezones Estrictas**: Usar `luxon` para cualquier cálculo de fechas respetando `profile.datosPersonales.ubicacion.zonaHoraria`. No utilices la timezone del Date local de la computadora.

## Estructura Inicial
- El código fuente debe ir en `src/`.
- Las dependencias y empaquetado deben ser compatibles con `electron-builder` para Windows y macOS.
