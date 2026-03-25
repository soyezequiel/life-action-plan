---
name: plan-writer
description: Usar para crear planes de implementación precisos que otro agente pueda ejecutar sin ambigüedad. Solo Claude Code debe usar este skill.
---

# Plan Writer — Skill de Planificación

> Antes de usar esta skill, leer el protocolo central:
> `.agent/skills/multiagent-coordinator/SKILL.md`

## Cuándo usar esta skill

- Cuando el usuario pide planificar una nueva funcionalidad
- Cuando una feature o fix es suficientemente compleja para documentar antes de implementar
- Cuando se quiere que Codex o Antigravity implementen algo específico

## Entradas esperadas

- Descripción de la feature o fix a implementar
- Contexto del proyecto (leer `AGENTS.md` y `CLAUDE.md`)
- Prioridad (alta / media / baja)
- Tags opcionales (módulo, área)

## Proceso paso a paso

### Paso 1: Definir el plan-id

Formato: `{feature-slug}-v{N}` en kebab-case.
Verificar que `docs/plans/{plan-id}/` no exista todavía.

### Paso 2: Mapear archivos afectados

ANTES de escribir tareas, debés explorar el repositorio para encontrar los archivos exactos.
- Usá comandos como `ls`, lectura de archivos, o tus herramientas de código para confirmar que las rutas existen.
- NO inventes nombres de archivos ni asumas una estructura ("src/utils", etc) sin haberlo verificado.
- Revisá la documentación de arquitectura en `AGENTS.md`.

### Paso 3: Escribir `docs/plans/{plan-id}/plan.md`

Usar este template exacto:

```markdown
# {Feature Name} — Plan de Implementación

> **Para el agente implementador:** Leer primero `.agent/skills/multiagent-coordinator/SKILL.md`.
> Usar la skill `plan-executor` (Codex) o `plan-reviewer` (Antigravity) según corresponda.

**Plan ID:** {plan-id}
**Goal:** {Una oración describiendo qué se construye}
**Arquitectura:** {2-3 oraciones sobre el enfoque técnico}
**Stack relevante:** {tecnologías / librerías clave}
**Prioridad:** {high | medium | low}
**Tags:** [{tag1}, {tag2}]

---

## Archivos involucrados

| Acción | Ruta | Responsabilidad |
|--------|------|-----------------|
| Crear | `path/to/file.ts` | Descripción |
| Modificar | `path/to/existing.ts` | Descripción |
| Test | `tests/path/test.ts` | Descripción |

---

## Tareas

### Tarea 1: {Nombre}

**Archivos:**
- Crear: `ruta/exacta.ts`
- Modificar: `ruta/existente.ts`

- [ ] **Paso 1.1:** {Acción concreta y pequeña}
  ```typescript
  // Código exacto si aplica
  ```
  Verificación: `npm run typecheck` — esperado: sin errores

- [ ] **Paso 1.2:** {Siguiente acción}
  Verificación: `npm run test` — esperado: tests pasan

- [ ] **Paso 1.3:** Registrar en implementation/log.md y actualizar status.json

### Tarea 2: {Nombre}

### Tarea N: Tests y Verificación
(TODO PLAN DEBE INCLUIR ESTA TAREA FINAL)
- [ ] Escribir/actualizar tests unitarios en `tests/...`
- [ ] Correr tests y `npm run typecheck`.
...
```

### Paso 4: Crear `docs/plans/{plan-id}/status.json`

```json
{
  "plan_id": "{plan-id}",
  "status": "ready",
  "created_by": "claude-code",
  "created_at": "{ISO timestamp}",
  "updated_at": "{ISO timestamp}",
  "updated_by": "claude-code",
  "assigned_to": null,
  "priority": "high",
  "tags": [],
  "blockers": [],
  "notes": ""
}
```

### Paso 5: Registrar en historial

Crear `docs/plans/{plan-id}/history/{YYYYMMDD-HHMMSS}-claude-code.md`:
(OBLATORIO: El nombre del archivo NO debe contener caracteres `:` porque es incompatible con Windows. Usá un timestamp plano).

```markdown
# {YYYYMMDD-HHMMSS} — claude-code
**Acción:** Plan creado
**Anterior:** (ninguno)
**Nuevo:** ready
**Notas:** Plan de {feature} listo para implementar.
```

### Paso 6: Confirmar al usuario

Reportar:
- Ruta del plan: `docs/plans/{plan-id}/plan.md`
- Número de tareas
- Archivos involucrados
- Próximo paso sugerido: "Decile a Codex: implementa el plan `{plan-id}`"

## Salidas

- `docs/plans/{plan-id}/plan.md` — el plan completo
- `docs/plans/{plan-id}/status.json` — estado inicial `ready`
- `docs/plans/{plan-id}/history/` — entrada de creación

## Reglas

- Paths exactos y reales del proyecto, sin inventar.
- Cada paso es una acción atómica (2-5 minutos).
- Incluir el comando de verificación en cada paso.
- No hardcodear strings de UI (regla i18n del proyecto).
- Si hay dudas sobre el scope, preguntar antes de escribir el plan.
