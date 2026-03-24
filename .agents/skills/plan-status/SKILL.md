---
name: plan-status
description: Sub-skill utilitaria. Listar, filtrar y reportar el estado de planes en docs/plans/. Todos los agentes pueden usar esta skill.
---

# Plan Status — Consulta de Estado

> Esta es una sub-skill ligera. Solo lee, nunca escribe.
> Para el protocolo completo: `.agent/skills/multiagent-coordinator/SKILL.md`

## Uso

Llamar cuando el usuario pregunta sobre el estado de los planes:
- "qué planes están pendientes"
- "qué planes ya fueron implementados pero no testeados"
- "cuál es el estado del plan X"
- "qué hay en progreso"

## Proceso

### 1. Leer todos los status.json

Ruta: `docs/plans/*/status.json`

### 2. Agrupar por estado y mostrar tabla

```
=== PLANES POR ESTADO ===

READY (listos para implementar):
  • auth-login-v1        [high]  tags: auth, backend

IN-PROGRESS:
  • sim-tree-ui-v1      [high]  assigned_to: codex

IMPLEMENTED (sin revisar):
  • settings-oauth-v1   [low]

NEEDS-FIXES:
  • wallet-connect-v1   [medium]

DONE:
  • intake-flow-v1

BLOCKED:
  • export-ics-v2
```

### 3. Responder según la pregunta

| Pregunta | Filtro |
|----------|--------|
| "pendientes" | `status == "ready"` |
| "implementados sin testear" | `status == "implemented"` |
| "en progreso" | `status == "in-progress"` |
| "con errores" | `status == "needs-fixes"` |
| "terminados" | `status == "done"` |
| "bloqueados" | `status == "blocked"` |

## Salidas

Solo texto / tabla al usuario. No modifica ningún archivo.
