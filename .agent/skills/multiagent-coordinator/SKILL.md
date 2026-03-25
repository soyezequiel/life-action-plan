---
name: multiagent-coordinator
description: Protocolo compartido de coordinación entre Claude Code, Codex y Antigravity. Leer SIEMPRE antes de escribir o leer un plan.
---

# Coordinador Multiagente — Protocolo Central

> **Lee este archivo completo antes de cualquier acción.**
> Este protocolo es la única fuente de verdad compartida entre agentes.

## Quién es quién

| Agente | Rol principal | Carpeta de skills |
|--------|--------------|-------------------|
| Claude Code | Planificación y supervisión | `.claude/skills/` |
| Codex | Implementación | `.agents/skills/` |
| Antigravity | Revisión, verificación, testing | `.agent/skills/` |

## Estructura de archivos del sistema

```
docs/plans/
  {plan-id}/
    plan.md          ← El plan completo (escribe: Claude Code)
    status.json      ← Estado actual del plan (todos leen/escriben)
    implementation/
      log.md         ← Registro de implementación (escribe: Codex / Antigravity)
    review/
      report.md      ← Reporte de revisión (escribe: Antigravity)
    tests/
      report.md      ← Reporte de testing (escribe: Antigravity)
    history/
      {YYYYMMDD-HHMMSS}-{agente}.md  ← Entradas históricas inmutables
```

## Formato de plan-id

`{feature-slug}-v{N}` — todo en kebab-case, sin espacios.
Ejemplos: `auth-login-v1`, `billing-refactor-v2`, `sim-tree-ui-v1`

## Estados posibles (status.json → campo "status")

| Estado | Significado |
|--------|-------------|
| `draft` | Plan en borrador, Claude Code lo está escribiendo |
| `ready` | Plan aprobado, listo para implementar |
| `in-progress` | Un agente está implementando activamente |
| `implemented` | Implementación terminada, falta revisión |
| `needs-review` | Requiere revisión o correcciones antes de continuar |
| `testing` | Antigravity está ejecutando tests |
| `needs-fixes` | La revisión encontró problemas |
| `done` | Completo, testeado y verificado |
| `blocked` | Bloqueado, requiere intervención humana |

## Formato de status.json

```json
{
  "plan_id": "auth-login-v1",
  "status": "ready",
  "created_by": "claude-code",
  "created_at": "2026-03-23T10:00:00-03:00",
  "updated_at": "2026-03-23T10:00:00-03:00",
  "updated_by": "claude-code",
  "assigned_to": null,
  "priority": "high",
  "tags": ["auth", "backend"],
  "blockers": [],
  "notes": ""
}
```

## Regla de no colisión

**Antes de tomar un plan**, verificar que `status` sea `ready` o `needs-fixes`.
Si el status es `in-progress` o `testing`, otro agente ya está trabajando en él.
**Nunca modificar un plan que tenga `assigned_to` con otro agente activo.**

## Protocolo de handoff entre agentes

```
Claude Code escribe plan.md → pone status: "ready"
      ↓
Codex lee status.json → toma el plan → pone status: "in-progress", assigned_to: "codex"
      ↓
Codex termina → escribe implementation/log.md → pone status: "implemented"
      ↓
Antigravity lee → pone status: "testing", assigned_to: "antigravity"
      ↓
Antigravity termina → escribe review/report.md y tests/report.md
      ↓
Si OK → status: "done" | Si hay problemas menores → Antigravity arregla y pone "done" | Si hay problemas graves → status: "needs-fixes"
      ↓
Codex lee needs-fixes → corrige → status: "implemented" (ciclo)

**Si el plan queda `blocked`:** El humano interviene. Una vez destrabado, instruye a un agente a continuar, y el plan debe volver a `in-progress`.
```

## Cómo listar planes por estado

Para ver planes pendientes, ejecutar o leer mentalmente:
```
docs/plans/*/status.json  →  campo "status" == "ready"
```

Para ver planes implementados sin testear:
```
docs/plans/*/status.json  →  campo "status" == "implemented"
```

## Entradas de historial

Cada vez que un agente cambia el status, DEBE agregar una entrada en:
`docs/plans/{plan-id}/history/{YYYYMMDD-HHMMSS}-{agente}.md` (ATENCIÓN: Cero caracteres `:` en el nombre de archivo por compatibilidad con Windows).

Formato mínimo:
```markdown
# {timestamp} — {agente}

**Acción:** {qué hizo}
**Anterior:** {status anterior}
**Nuevo:** {status nuevo}
**Notas:** {observaciones breves}
```
