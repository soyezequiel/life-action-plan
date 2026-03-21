# Progreso del Plan LAP

> Última actualización: 2026-03-21
> Referencia: `PLAN_LAP_FINAL.md`

## Fase 0 — Estabilización post-migración ✅ COMPLETA

| Item | Estado | Evidencia |
|------|--------|-----------|
| Limpiar docs y source of truth | ✅ | Docs legacy eliminados, CLAUDE.md y AGENTS.md actualizados |
| Eliminar residuos legacy | ✅ | Cero imports Electron/SQLite en código fuente |
| Smoke local repetible | ✅ | `smoke:local`, `smoke:deploy`, `doctor:local`, `doctor:deploy` |
| typecheck, test y build | ✅ | Scripts configurados en package.json |

## Fase 1 — Robustez local ⚠️ EN PROGRESO

| Item | Estado | Evidencia |
|------|--------|-----------|
| Mejorar mensajes de error | ✅ | i18n error mapping en `_plan.ts`, `error-utils.ts`, categorización por tipo |
| Endurecer el inspector | ⚠️ Parcial | Componentes debug robustos (5 sub-componentes), pero rutas API `/api/debug` y `/api/debug/snapshot` sin error handling ni validación |
| Ruta real vs fallback explícita | ✅ | `fallbackUsed` flag, UI indicators, execution context con requested vs final |
| Consolidar settings API key/proveedor | ✅ | Sistema de credenciales multi-proveedor con UI unificada en `SettingsPageContent.tsx` |

## Fase 2 — Readiness para Vercel ⚠️ EN PROGRESO

| Item | Estado | Evidencia |
|------|--------|-----------|
| Validar DATABASE_URL cloud | ✅ | SSL auto-detect, localhost rechazado en deploy-doctor |
| Proveedor cloud en preview/prod | ✅ | OpenAI + OpenRouter integrados en provider-factory |
| Bloquear Ollama en Vercel | ✅ | Multi-capa: deployment mode → execution context → fallback disabled |
| Timeouts rutas largas + vercel.json | ✅ | 60s maxDuration en build y simulate |
| doctor:deploy y smoke:deploy | ✅ | Scripts + validaciones en deploy-doctor.mjs |
| E2E smoke intake→build→dashboard cloud | ❌ | Solo unit tests con mocks; falta test E2E real con provider cloud |

## Fase 3 — Productización ⚠️ EN PROGRESO

| Item | Estado | Evidencia |
|------|--------|-----------|
| Wallet y costos flujo entendible | ✅ | NWC/Lightning, budget bar, operation costs, balance display |
| Polish visual dashboard | ✅ | 637 líneas CSS, Framer Motion, responsive con 3+ breakpoints |
| Accesibilidad y mobile | ⚠️ Parcial | Scaffolding a11y (roles, labels, live regions), CSS responsive, sin audit exhaustivo |
| Exportación y simulación UX consistente | ✅ | ICS export + streaming simulate con SSE/progress |

## Fase 4 — Futuro 🔧 EN PROGRESO

| Item | Estado | Evidencia |
|------|--------|-----------|
| Auth más robusta | 🔧 En implementación | Argon2id, JWT sessions, encrypted credential storage — trabajo activo en branch `flujo-y-creacion-cuentas` |
| PWA | ❌ Diferido | Sin manifest ni service worker |
| Analytics privacy-first | ❌ No iniciado | Cero tracking |
| Growth y retention | ❌ No iniciado | Solo streak básico |

## Flujo de producto — implementación vs diseño

> Referencia completa: `FLUJO_HIBRIDO_DRAFT.md`

| Paso | Nombre | Estado | Qué existe hoy | Qué falta |
|------|--------|--------|-----------------|-----------|
| 0 | Gate LLM/Billetera | ⚠️ Parcial | Settings con credenciales y wallet | Gate obligatorio al inicio, estimación de costo pre-billetera |
| 1 | Objetivos | ❌ No existe | Intake fijo con campos hardcodeados | Input libre de objetivos, priorización, análisis por LLM |
| 2 | Intake dinámico | ❌ No existe | IntakeExpress con 6 campos fijos | Preguntas generadas por LLM en bloques, auto-guardado |
| 3 | Plan alto nivel | ⚠️ Parcial | plan-builder genera plan completo de una | Plan estratégico sin tareas diarias, fases + dependencias |
| 4 | Chequeo de realidad | ❌ No existe | — | Presupuesto temporal, trade-offs, detección conflictos |
| 5 | Simulación | ⚠️ Parcial | plan-simulator con streaming SSE | Bucle iterativo con corrección, checkpoints por iteración |
| 6 | Presentación visual | ❌ No existe | Dashboard muestra lista de tareas | Diagramas Gantt/timeline, feedback chat, edición inline |
| 7 | Calendario existente | ❌ No existe | — | Importar .ics, ingreso manual, mapa de disponibilidad |
| 8 | Generación top-down | ❌ No existe | Build genera todo de una | Niveles adaptativos (anual→diario), confirmación por nivel |
| 9 | Ejecución/Dashboard | ✅ Base | Dashboard con tareas, progreso, racha, costos | Re-planificación on-demand, agregar objetivos |
| — | Reanudación | ⚠️ Parcial | Perfil se restaura de DB | Checkpoints granulares, pregunta si algo cambió |

## Resumen

| Fase | Progreso | Bloqueantes |
|------|----------|-------------|
| 0 — Estabilización | 100% | — |
| 1 — Robustez local | ~85% | Inspector debug necesita hardening |
| 2 — Readiness Vercel | ~90% | Falta E2E smoke con cloud (pendiente decisión) |
| 3 — Productización | ~85% | Accesibilidad parcial |
| 4 — Futuro | ~25% | Auth en progreso activo; PWA/analytics/growth diferidos |
