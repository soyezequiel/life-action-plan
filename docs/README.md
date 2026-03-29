# docs/ — Documentacion del proyecto LAP

> Indice para que cualquier agente (Claude Code, Codex, Antigravity, Cursor, Windsurf) encuentre lo que necesita.

## Estructura

```text
docs/
  architecture/          Registro y specs de arquitectura
  plans/                 Sistema canonico de planes de implementacion
  progress/              Tracking de progreso y planes de continuacion
  prompts/               Prompts de tarea para agentes especificos
    antigravity/          Tareas delegadas a Antigravity
    codex/                Tareas delegadas a Codex
```

## architecture/

| Archivo | Descripcion |
|---------|-------------|
| `REGISTRY.json` | Registro canonico para resolver documentos vigentes por serie y lifecycle |
| `PLAN_LAP_FINAL.md` | Resumen consolidado temprano. Obsoleto; no usar como source of truth |
| `FLUJO_HIBRIDO_DRAFT.md` | Spec detallada del flujo E2E del producto |
| `PLAN_SETTINGS_AUTH.md` | Plan de settings y autenticacion |
| `PIPELINE_V5_SPEC.md` | Spec del contrato y modelo historico del pipeline v5 |
| `FRONTEND_V5_SPEC.md` | Spec de la interfaz del visor y experiencia v5 |
| `PIPELINE_V6_SPEC.md` | Spec operativa del runtime de build v6 vigente |

## plans/

| Archivo | Descripcion |
|---------|-------------|
| `README.md` | Convenciones del sistema de planes y regla para resolver el ultimo plan |
| `REGISTRY.json` | Registro canonico de planes de implementacion |
| `{series-id}-v{N}/PLAN.md` | Documento principal del plan |
| `{series-id}-v{N}/status.json` | Estado y lifecycle maquina-legibles del plan |

## progress/

| Archivo | Descripcion |
|---------|-------------|
| `PROGRESS.md` | Estado de avance por fase |
| `continuacion-web-nextjs-divs.md` | Divisiones atomicas de la migracion web |
| `plan-credenciales-cobro-por-recurso-divs.md` | Plan de credenciales y cobro por recurso |

## prompts/

Prompts de tarea especificos para cada IDE agentico. Cada agente busca en su subcarpeta.

| Subcarpeta | Agente | Archivos |
|------------|--------|----------|
| `antigravity/` | Antigravity | `ANTIGRAVITY_PROMPT.md`, `ANTIGRAVITY_SIMTREE.md` |
| `codex/` | Codex | `CODEX_FLOW_FIXES.md`, `CODEX_FLOW_REVIEW.md`, `CODEX_SIMULATION_PLAN.md`, `CODEX_SIMTREE_UI_TESTS.md` |
| (raiz) | General | `PROMPT_BETATESTER.md` |

## Archivos que permanecen en la raiz del repo

| Archivo | Razon |
|---------|-------|
| `CLAUDE.md` | Claude Code lo carga por convencion desde la raiz |
| `AGENTS.md` | Contexto general referenciado por todos los agentes |
| `.cursorrules` | Cursor lo carga por convencion desde la raiz |
| `.windsurfrules` | Windsurf lo carga por convencion desde la raiz |
| `README.md` | Estandar Git |
