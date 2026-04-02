# Rediseñar snapshot y pause/resume sobre la máquina

> **Linear:** SOY-82
> **Status:** `pending`
> **Plan:** `docs/plans/soy-82-snapshot-pause-resume-xstate-v1/PLAN.md`
> **Padre:** SOY-46 — stage 6 de `pipeline-v6-xstate-migration-v1`

## Contexto
Los snapshots del pipeline persisten en DB y son usados para resume. La migración a XState implica un nuevo formato de snapshot (`schemaVersion: 2`) que debe mantener compatibilidad de lectura con snapshots existentes (`schemaVersion: 1`).

## Alcance
Definir `schemaVersion: 2` para snapshots XState. Mantener lectura compatible con `schemaVersion: 1`. Validar los flujos completos de pause/resume y el flujo `build → blocked`.

## Pasos de implementación
1. Definir tipo `SnapshotV2` con el estado serializado de XState (`machine.getPersistedSnapshot()`)
2. Crear función de migración: `migrateSnapshot(v1) → v2` para snapshots legacy
3. Actualizar `getSnapshot()` del adaptador (SOY-81) para producir `schemaVersion: 2`
4. Actualizar `resume()` para aceptar ambos schemas: detectar versión y migrar si es necesario
5. Validar flujo: `build → needs_input → resume → complete`
6. Validar flujo: `build → blocked`
7. Verificar con tests que snapshots v1 existentes se leen correctamente

## Criterio de cierre
- Snapshots v1 existentes en DB son legibles sin migración de datos
- Snapshots v2 generados por la máquina XState funcionan con `resume()`
- Ambos flujos críticos validados con tests

## No tocar
- Schema de DB (no se migran datos en este stage)
- Rutas de API
- Archivos fuera de `src/lib/pipeline/v6/xstate/`
