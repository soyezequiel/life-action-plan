---
name: plan-reviewer
description: Usar para revisar, testear y verificar que una implementación coincide con su plan. Rol principal de Antigravity.
---

# Plan Reviewer — Skill de Revisión y Testing

> Antes de usar esta skill, leer el protocolo central:
> `.agent/skills/multiagent-coordinator/SKILL.md`

## Cuándo usar esta skill

- El usuario dice "verificá la implementación del plan X"
- El usuario dice "testeá el plan X"
- El usuario dice "auditá si lo implementado coincide con el plan X"
- El usuario dice "qué diferencia hay entre lo planificado y lo implementado en X"
- Cuando `status.json` tiene `status == "implemented"` o `status == "needs-review"`

## Paso 0: Descubrir qué revisar (si no se especificó)

Leer todos `docs/plans/*/status.json`.
Filtrar los que tienen `status == "implemented"`.
Mostrar lista al usuario o proceder con el primero si hay instrucción genérica.

## Paso 1: Tomar el plan para revisión

1. Verificar que `status` sea `implemented` o `needs-review`.
2. Actualizar `status.json`:
   ```json
   { "status": "testing", "assigned_to": "antigravity", "updated_at": "..." }
   ```
3. Registrar en historial.

## Paso 2: Leer el plan y el log

- Leer `docs/plans/{plan-id}/plan.md` completo.
- Leer `docs/plans/{plan-id}/implementation/log.md`.
- Leer cualquier `docs/plans/{plan-id}/review/report.md` previo.

## Paso 3: Verificación cruzada plan vs implementación

Para cada tarea del plan:

### 3a. Verificar archivos
- ¿Existen los archivos que el plan indica crear?
- ¿Se modificaron los archivos que el plan indica modificar?
- ¿Hay archivos modificados que el plan NO menciona? (scope creep)

### 3b. Verificar comportamiento
- ¿El código hace lo que la tarea describe?
- ¿Los tipos/interfaces coinciden con lo especificado?
- ¿Las funciones tienen los nombres y firmas indicados en el plan?

### 3c. Ejecutar verificaciones del plan
- Correr cada comando de verificación listado en el plan.
- Documentar resultado real vs resultado esperado.

### 3d. Ejecutar tests del proyecto
```
npm run typecheck
npm run test
npm run lint
```

Documentar cualquier fallo.

### 3e. Verificar reglas del proyecto (AGENTS.md)
- i18n: ¿hay strings hardcodeados en la UI?
- PostgreSQL: ¿se usa correctamente Drizzle?
- Luxon: ¿se usa `new Date()` para lógica de negocio?
- Zod `.strict()` en schemas nuevos
- Sin imports de Electron

### 3f. Corrección de Errores Menores
- Si encontrás errores triviales (typos, imports faltando, variables sin usar, un string sin traducir con i18n), **NO marques como fallido**. En vez de eso, arreglá el código vos mismo inmediatamente, registrá el arreglo en el reporte bajo "Tweak", y dejá que el plan pase. Regresar un plan por una coma es una pérdida de tiempo.

## Paso 4: Escribir el reporte de revisión

Crear/Actualizar `docs/plans/{plan-id}/review/report.md`:

```markdown
# Reporte de Revisión — {plan-id}
**Revisado por:** antigravity
**Fecha:** {timestamp}
**Status previo:** implemented

## Resumen

✅ Implementación aprobada | ⚠️ Necesita correcciones | ❌ Rechazada

## Verificaciones ejecutadas

| Verificación | Comando | Resultado |
|-------------|---------|-----------|
| TypeScript | `npm run typecheck` | ✅ OK / ❌ {error} |
| Tests | `npm run test` | ✅ {N} pasando / ❌ {N} fallando |
| Lint | `npm run lint` | ✅ OK / ⚠️ warnings |

## Comparación plan vs implementación

### Tarea 1: {nombre}
- ✅ Archivos creados/modificados correctamente
- ✅ Comportamiento coincide con el plan
- ⚠️ {desvío encontrado, si hay}

## Hallazgos

### Problemas críticos (bloquean aprobación)
1. {descripción} — Archivo: `path/to/file.ts` Línea: {N}

### Advertencias (no bloquean pero requieren atención)
1. {descripción}

### Recomendaciones
1. {sugerencia de mejora opcional}

## Decisión final

**APROBADO** → Status: done
**NECESITA CORRECCIONES** → Status: needs-fixes
```

## Paso 5: Escribir el reporte de testing

Crear `docs/plans/{plan-id}/tests/report.md`:

```markdown
# Reporte de Tests — {plan-id}
**Testeado por:** antigravity
**Fecha:** {timestamp}

## Tests ejecutados

| Test | Resultado | Notas |
|------|-----------|-------|
| `npm run test` | ✅ / ❌ | {detalles} |
| `npm run typecheck` | ✅ / ❌ | {detalles} |
| `npm run build` | ✅ / ❌ | Solo si tocó API routes o DB |

## Cobertura de casos

- [ ] Caso feliz: {descripción}
- [ ] Caso borde: {descripción}
- [ ] Caso de error: {descripción}

## Tests faltantes sugeridos

1. {test que debería existir pero no existe}
```

## Paso 6: Actualizar status.json

Si aprobado:
```json
{ "status": "done", "assigned_to": null, "updated_at": "..." }
```

Si necesita correcciones:
```json
{ "status": "needs-fixes", "assigned_to": null, "notes": "Ver review/report.md", "updated_at": "..." }
```

## Entrada esperada del usuario (ejemplos)

- `"verificá la implementación del plan auth-login-v1"`
- `"testeá el plan billing-refactor-v2"`
- `"qué planes ya fueron implementados pero no testeados"`
- `"qué diferencia hay entre lo planificado y lo implementado en sim-tree-ui-v1"`
- `"decime qué falta para dar por terminado el plan X"`

## Salidas

- `docs/plans/{plan-id}/review/report.md`
- `docs/plans/{plan-id}/tests/report.md`
- `docs/plans/{plan-id}/status.json` — `done` o `needs-fixes`
- `docs/plans/{plan-id}/history/{YYYYMMDD-HHMMSS}-antigravity.md`

## Reglas

- No implementar. Solo revisar y reportar.
- Si encontrás un problema evidente, documentarlo con ruta exacta y línea.
- Si hay problemas menores, ARREGLALOS vos en el acto y aprobá con status `done`.
- Solo Antigravity puede poner `status: "done"`.
- Marcá `needs-fixes` SOLO si el código requiere cambios arquitecturales o si falla lógicamente.
