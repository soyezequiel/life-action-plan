# Regularizar el sistema canónico de planes

> **Linear:** SOY-64
> **Status:** `pending`
> **Plan:** `docs/plans/soy-64-regularizar-sistema-planes-v1/PLAN.md`
> **Padre:** SOY-43 — stage 4 de `repo-cleanup-doc-order-v1`

## Contexto
`docs/plans/pipeline-visualizer-v1` es un plan huérfano: existe en el filesystem pero no en `REGISTRY.json`. Puede haber otros planes con metadata incompleta o fuera de la convención de nombres. El registro debe ser la única fuente de verdad.

## Alcance
Resolver el plan huérfano `pipeline-visualizer-v1`. Revisar todas las carpetas de `docs/plans/` que no sigan la convención o tengan metadata incompleta. Asegurar que todo plan activo existe en `REGISTRY.json`.

## Pasos de implementación
1. Listar todos los directorios en `docs/plans/` y comparar contra `REGISTRY.json`
2. Para `pipeline-visualizer-v1`: determinar si está vigente (lifecycle=active) u obsoleto; actualizar su `status.json` y agregarlo al REGISTRY si falta
3. Para cualquier otro plan fuera del registry: clasificar como activo, histórico u obsoleto y actualizar REGISTRY
4. Verificar que todos los `status.json` tienen los campos requeridos (plan_id, series_id, version, status, lifecycle)
5. Corregir campos faltantes o inconsistentes en status.json existentes

## Criterio de cierre
- Todos los directorios en `docs/plans/` tienen entrada en `REGISTRY.json`
- Ningún plan activo fuera del registro
- Todos los `status.json` tienen metadata completa y válida

## No tocar
- Contenido de los PLAN.md existentes (solo metadata)
- Código fuera de `docs/plans/`
