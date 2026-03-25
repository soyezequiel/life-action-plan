---
name: plan-executor
description: Usar para implementar un plan existente en docs/plans/. Sigue el plan paso a paso sin inventar ni agregar scope.
---

# Plan Executor — Skill de Implementación

> Antes de usar esta skill, leer el protocolo central:
> `.agent/skills/multiagent-coordinator/SKILL.md`

## Cuándo usar esta skill

- El usuario dice "implementa el plan X"
- El usuario dice "qué planes están pendientes" → listar → implementar uno
- El usuario dice "continuá con el plan X"

## Paso 0: Listar planes disponibles (si no se especificó uno)

Leer todos los archivos `docs/plans/*/status.json`.
Mostrar tabla:

```
Plan ID              | Status        | Prioridad | Tags
auth-login-v1        | ready         | high      | auth
billing-refactor-v2  | needs-fixes   | medium    | billing
```

Preguntar cuál implementar si no fue especificado.

## Paso 1: Tomar el plan

1. Verificar que `status.json` tenga `status == "ready"` o `status == "needs-fixes"`.
2. Leer `docs/plans/{plan-id}/plan.md` completo.
3. Leer `docs/plans/{plan-id}/review/report.md` si existe (para entender qué corregir).
4. Actualizar `status.json`:
   ```json
   { "status": "in-progress", "assigned_to": "codex", "updated_at": "..." }
   ```
5. Registrar en historial: `docs/plans/{plan-id}/history/{YYYYMMDD-HHMMSS}-codex.md`

## Paso 2: Implementar tarea por tarea

Para cada tarea del plan:
1. Leer los pasos de la tarea.
2. Ejecutar cada paso exactamente como está escrito.
3. Correr la verificación indicada.
4. Si la verificación falla: **NO TE RINDAS INMEDIATAMENTE**.
   - Intentá diagnosticar el error de compilación/lint/test.
   - Usá tus herramientas para arreglarlo al menos 3 veces. (Auto-fix loop).
   - Solo si realmente no podés avanzar después de varios intentos sistemáticos, pará y considerá el plan bloqueado.
5. Marcar el checkbox del paso (`- [ ]` → `- [x]`).

**No agregar funcionalidad no pedida en el plan.**
**No cambiar archivos que el plan no menciona.**

## Paso 3: Escribir el log de implementación

Abrir o crear `docs/plans/{plan-id}/implementation/log.md` y agregar:

```markdown
## Sesión {timestamp} — codex

### Tareas completadas
- [x] Tarea 1: {nombre}
- [x] Tarea 2: {nombre}

### Archivos tocados
- `path/to/file.ts` — {qué se hizo}

### Decisiones tomadas
- {Si algo del plan era ambiguo, qué se decidió y por qué}

### Tests ejecutados
- `npm run typecheck` → OK
- `npm run test` → OK / {N} failing

### Estado final: implemented | needs-fixes
```

## Paso 4: Actualizar status.json

Si todo salió bien:
```json
{ "status": "implemented", "assigned_to": null, "updated_at": "..." }
```

Si hay problemas menores documentados:
```json
{ "status": "needs-review", "assigned_to": null, "updated_at": "..." }
```

## Manejo de bloqueos

Si no podés continuar:
1. Documentar en `status.json`:
   ```json
   { "status": "blocked", "blockers": ["descripción del bloqueo"], "updated_at": "..." }
   ```
2. Escribir en `implementation/log.md` la sección `### Bloqueo` con detalles.
3. Reportar al usuario qué necesitás para continuar.

## Entrada esperada del usuario (ejemplos)

- `"implementa el plan auth-login-v1"`
- `"qué planes están sin implementar"`
- `"continuá con el plan billing-refactor-v2"`
- `"qué planes están listos para implementar"`

## Salidas

- `plan.md` con checkboxes actualizados
- `docs/plans/{plan-id}/implementation/log.md` — registro completo
- `docs/plans/{plan-id}/status.json` — status actualizado
- `docs/plans/{plan-id}/history/{YYYYMMDD-HHMMSS}-codex.md` — entrada de historial

## Reglas

- Seguir el plan literalmente.
- Intentar auto-resolver errores obvios antes de parar.
- Correr `npm run typecheck` y `npm run test` antes de marcar como `implemented`.
- Nunca cambiar status a `done` — eso es rol de Antigravity.
