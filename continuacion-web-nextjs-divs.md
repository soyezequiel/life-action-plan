# Continuacion Web Next.js de LAP

## Contexto

- Estado actual: web app Next.js 15 con App Router
- Entorno local vigente: PostgreSQL local + Ollama local
- Target de deploy: Vercel + PostgreSQL cloud + LLM cloud
- Flujo core a preservar: `intake -> build -> dashboard -> inspector`
- Regla operativa: ejecutar un div por vez y cerrarlo con evidencia automatica y visible

## Divs

### DIV-001 - Source of truth limpio
- Objetivo: alinear `README.md`, `AGENTS.md`, `PLAN_LAP_FINAL.md` y documentos operativos con el estado real del repo
- Incluye: stack actual, scripts reales, rutas reales, entorno local real
- Excluye: cambios de producto
- Cierre: no quedan instrucciones activas que pidan Electron, SQLite o `dev:electron`
- Estado: cerrado el 2026-03-20

### DIV-002 - Limpieza legacy del repo
- Objetivo: remover o aislar residuos que confunden a futuros agentes
- Incluye: directorios vacios legacy, referencias historicas, archivos de apoyo obsoletos, notas de compatibilidad
- Excluye: refactors funcionales
- Cierre: un agente nuevo puede recorrer el repo sin inferir una arquitectura incorrecta
- Estado: cerrado el 2026-03-20

### DIV-003 - Smoke local reproducible
- Objetivo: dejar un flujo local confiable para esta maquina
- Incluye: chequeo de `DATABASE_URL`, PostgreSQL local, Ollama local, `db:push`, `npm run dev`
- Excluye: deploy cloud
- Cierre: el flujo `intake -> build con Ollama -> dashboard -> inspector` se puede repetir sin pasos ocultos
- Estado: cerrado el 2026-03-20

### DIV-004 - Inspector como gate de calidad
- Objetivo: usar el inspector LLM como criterio de aceptacion para operaciones largas
- Incluye: trazas visibles, snapshot consistente, errores visibles, apertura tardia, estado estable bajo HMR
- Excluye: features nuevas del builder
- Cierre: cualquier build o simulate deja una traza visible o un error visible
- Estado: cerrado el 2026-03-20

### DIV-005 - Ruta real vs fallback
- Objetivo: evitar validaciones ambiguas
- Incluye: copy y estados visibles que diferencien backend real, fallback y demo
- Excluye: rediseno general
- Cierre: ninguna corrida puede confundirse con un mock silencioso

### DIV-006 - Vercel readiness
- Objetivo: separar claramente lo que vale para local y lo que vale para deploy
- Incluye: env vars requeridas, proveedor cloud para Vercel, timeouts, `vercel.json`, smoke de build
- Excluye: auth full y multi-tenant
- Cierre: el repo tiene instrucciones y criterio claros para subirlo sin depender de Ollama

### DIV-007 - Polish UX
- Objetivo: consolidar jerarquia visual, accesibilidad y estados de carga
- Incluye: dashboard, intake, settings, feedback de progreso, reduced motion
- Excluye: cambios de arquitectura
- Cierre: el flujo principal queda consistente en desktop y mobile

### DIV-008 - Wallet y costos
- Objetivo: llevar NWC y costos a estado de producto
- Incluye: conexion, desconexion, presupuesto, errores y costo visible por operacion
- Excluye: facturacion avanzada
- Cierre: el usuario entiende si una accion gasto sats, estimo costo o no tuvo costo

## Registro de avance

- 2026-03-20 - Se redefine el plan operativo a web-only. Electron sale del plan vigente y queda solo como antecedente historico.
- 2026-03-20 - DIV-001 cerrado. `README.md`, `AGENTS.md`, `PLAN_LAP_FINAL.md` y documentos operativos quedan alineados con la app web actual.
- 2026-03-20 - DIV-002 cerrado. `CLAUDE.md` se ajusta a la realidad local y de deploy, `CODEX_LOG.md` queda marcado como historico, los iconos pasan a `public/`, se eliminan assets desktop de `build/` y `resources/`, y los errores base de API se centralizan con copy reutilizable.
- 2026-03-20 - Nota operativa: no correr `npm run typecheck` en paralelo con `npm run build` en Next.js 15 porque la regeneracion de `.next/types` puede producir falsos `TS6053`.
- 2026-03-20 - DIV-003 cerrado. `drizzle.config.ts` ya carga `.env.local`, se agregan `npm run doctor:local` y `npm run smoke:local`, el smoke local verifica PostgreSQL, tablas base y Ollama, y la documentacion operativa queda alineada con ese flujo reproducible.
- 2026-03-20 - DIV-004 cerrado. El inspector muestra estado explicito del snapshot, `Limpiar` borra trazas reales del servidor, y el smoke visible confirma apertura tardia, build con traza activa y limpieza efectiva desde UI.
