# Progreso del Plan LAP

> Ultima actualizacion: 2026-04-02
> Referencias vigentes: `../architecture/REGISTRY.json`, `../plans/REGISTRY.json`

## Fase 0 - Estabilizacion post-migracion

| Item | Estado | Evidencia |
|------|--------|-----------|
| Limpiar docs y source of truth | OK | `AGENTS.md` y los registries canonicos marcan la fuente de verdad |
| Alinear indice de docs y registro de planes | OK | `docs/README.md` y `docs/plans/REGISTRY.json` reflejan la estructura vigente |
| Eliminar residuos legacy | OK | Cero imports Electron/SQLite en codigo fuente |
| Smoke local repetible | OK | `smoke:local`, `smoke:deploy`, `doctor:local`, `doctor:deploy` |
| typecheck, test y build | OK | Scripts configurados en `package.json` |

## Fase 1 - Robustez local

| Item | Estado | Evidencia |
|------|--------|-----------|
| Mejorar mensajes de error | OK | i18n error mapping en `_plan.ts`, `error-utils.ts`, categorizacion por tipo |
| Endurecer el inspector | Parcial | Componentes debug robustos, pero rutas API `/api/debug` y `/api/debug/snapshot` siguen necesitando hardening |
| Ruta real vs fallback explicita | OK | `fallbackUsed` flag, UI indicators, execution context con requested vs final |
| Consolidar settings API key/proveedor | OK | Sistema de credenciales multi-proveedor con UI unificada en `SettingsPageContent.tsx` |
| Arquitectura de Dominio (Etapa 1) | OK | Logica pura extraida a `src/lib/domain/`, servicios desacoplados de infraestructura |
| Middleware de Billing (Etapa 2) | OK | `executeWithBilling` encapsula ciclo de vida, error handling y cobros centralizados |
| Pipeline Runner (Etapa 3) | OK | `FlowRunner` permite ejecucion modular y granular por fase (`--phase`) |

## Fase 2 - Readiness para Vercel

| Item | Estado | Evidencia |
|------|--------|-----------|
| Validar DATABASE_URL cloud | OK | SSL auto-detect, localhost rechazado en deploy-doctor |
| Proveedor cloud en preview/prod | OK | OpenAI + OpenRouter integrados en provider-factory |
| Bloquear Ollama en Vercel | OK | Multi-capa: deployment mode -> execution context -> fallback disabled |
| Timeouts rutas largas + vercel.json | OK | 60s maxDuration en build y simulate |
| doctor:deploy y smoke:deploy | OK | Scripts + validaciones en deploy-doctor.mjs |
| E2E smoke intake->build->dashboard cloud | Pendiente | Solo unit tests con mocks; falta test E2E real con provider cloud |

## Fase 3 - Productizacion

| Item | Estado | Evidencia |
|------|--------|-----------|
| Wallet y costos flujo entendible | OK | NWC/Lightning, budget bar, operation costs, balance display |
| Polish visual dashboard | OK | CSS, Framer Motion, responsive con varios breakpoints |
| Accesibilidad y mobile | Parcial | Scaffolding a11y, CSS responsive, sin audit exhaustivo |
| Exportacion y simulacion UX consistente | OK | ICS export + streaming simulate con SSE/progress |

## Fase 4 - Futuro

| Item | Estado | Evidencia |
|------|--------|-----------|
| Auth mas robusta | En implementacion | Argon2id, JWT sessions, encrypted credential storage |
| PWA | Diferido | Sin manifest ni service worker |
| Analytics privacy-first | No iniciado | Cero tracking |
| Growth y retention | No iniciado | Solo streak basico |

## Flujo de producto - implementacion vs diseno

> Referencia completa: `../architecture/FLUJO_HIBRIDO_DRAFT.md`

| Paso | Nombre | Estado | Que existe hoy | Que falta |
|------|--------|--------|----------------|-----------|
| 0 | Gate LLM/Billetera | Parcial | Settings con credenciales y wallet | Gate obligatorio al inicio, estimacion de costo pre-billetera |
| 1 | Objetivos | No existe | Intake fijo con campos hardcodeados | Input libre de objetivos, priorizacion, analisis por LLM |
| 2 | Intake dinamico | No existe | IntakeExpress con 6 campos fijos | Preguntas generadas por LLM en bloques, auto-guardado |
| 3 | Plan alto nivel | Parcial | plan-builder genera plan completo de una | Plan estrategico sin tareas diarias, fases + dependencias |
| 4 | Chequeo de realidad | No existe | - | Presupuesto temporal, trade-offs, deteccion conflictos |
| 5 | Simulacion | Parcial | plan-simulator con streaming SSE | Bucle iterativo con correccion, checkpoints por iteracion |
| 6 | Presentacion visual | No existe | Dashboard muestra lista de tareas | Diagramas Gantt/timeline, feedback chat, edicion inline |
| 7 | Calendario existente | No existe | - | Importar .ics, ingreso manual, mapa de disponibilidad |
| 8 | Generacion top-down | No existe | Build genera todo de una | Niveles adaptativos, confirmacion por nivel |
| 9 | Ejecucion/Dashboard | OK | Dashboard con tareas, progreso, racha, costos | Re-planificacion on-demand, agregar objetivos |
| - | Reanudacion | Parcial | Perfil se restaura de DB | Checkpoints granulares, preguntar si algo cambio |

## Resumen

| Fase | Progreso | Bloqueantes |
|------|----------|-------------|
| 0 - Estabilizacion | 100% | - |
| 1 - Robustez local | ~85% | Inspector debug necesita hardening |
| 2 - Readiness Vercel | ~90% | Falta E2E smoke con cloud |
| 3 - Productizacion | ~85% | Accesibilidad parcial |
| 4 - Futuro | ~25% | Auth en progreso activo; PWA/analytics/growth diferidos |
