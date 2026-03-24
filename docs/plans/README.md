# docs/plans — Planes de Implementación Multiagente

Esta carpeta contiene todos los planes de implementación del proyecto LAP.
Cada plan tiene su propia subcarpeta con estructura estandarizada.

## Estructura de cada plan

```
{plan-id}/
  plan.md              ← El plan completo con tareas y pasos
  status.json          ← Estado actual (todos los agentes lo leen/escriben)
  implementation/
    log.md             ← Registro de lo que Codex implementó
  review/
    report.md          ← Reporte de revisión de Antigravity
  tests/
    report.md          ← Reporte de testing de Antigravity
  history/
    {ts}-{agente}.md   ← Entradas inmutables de historial
```

## Estados de un plan

| Estado | Quién lo pone | Significado |
|--------|--------------|-------------|
| `draft` | Claude Code | Escribiendo el plan |
| `ready` | Claude Code | Listo para implementar |
| `in-progress` | Codex | Siendo implementado |
| `implemented` | Codex | Implementado, falta revisión |
| `needs-review` | Codex | Necesita revisión antes de continuar |
| `testing` | Antigravity | Siendo testeado |
| `needs-fixes` | Antigravity | Hay errores a corregir |
| `done` | Antigravity | Completo y verificado ✅ |
| `blocked` | Cualquiera | Bloqueado, requiere humano |

## Convención de nombres de plan-id

`{feature-slug}-v{N}` — kebab-case.
- Correcto: `auth-login-v1`, `sim-tree-ui-v2`
- Incorrecto: `AuthLogin`, `auth login`

## Para ver el estado de todos los planes

Decile a cualquier agente: **"qué planes están pendientes"**
o **"mostrame el estado de todos los planes"**

Los agentes usarán la skill `plan-status` para leer todos los `status.json`.
