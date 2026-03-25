# docs/ — Documentacion del proyecto LAP

> Indice para que cualquier agente (Claude Code, Codex, Antigravity, Cursor, Windsurf) encuentre lo que necesita.

## Estructura

```text
docs/
  architecture/          Source of truth, specs de arquitectura
  progress/              Tracking de progreso y planes de continuacion
  prompts/               Prompts de tarea para agentes especificos
    antigravity/          Tareas delegadas a Antigravity
    codex/                Tareas delegadas a Codex
```

## architecture/

| Archivo | Descripcion |
|---------|-------------|
| `PLAN_LAP_FINAL.md` | Source of truth arquitectonica del proyecto |
| `FLUJO_HIBRIDO_DRAFT.md` | Spec detallada del flujo E2E del producto |
| `PLAN_SETTINGS_AUTH.md` | Plan de settings y autenticacion |

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
