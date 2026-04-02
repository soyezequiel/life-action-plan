# Clasificar carpetas: runtime, histórico, tooling y borrables

> **Linear:** SOY-61
> **Status:** `completed`
> **Plan:** `docs/plans/soy-61-clasificar-carpetas-runtime-v1/PLAN.md`
> **Padre:** SOY-43 — stage 1 de `repo-cleanup-doc-order-v1`

## Contexto
El repo mezcla código de producto vivo con mockups, demos, carpetas históricas y scripts de tooling. Antes de borrar o mover cualquier cosa hay que producir un inventario con decisión explícita por carpeta.

## Alcance
Clasificar: `components/mockups/`, `components/plan-viewer/`, `components/pipeline-visualizer/`, `app/debug/`, `docs/maqueta/`, `docs/prompts/`, `src/lib/skills/`. Producir tabla de decisión: mantener / archivar / borrar. Listar borrados seguros y renames requeridos.

## Pasos de implementación
1. Leer el contenido de cada carpeta listada y determinar si es: runtime activo, histórico/referencia, tooling interno, o borrable sin impacto
2. Para cada carpeta, buscar referencias en `app/`, `components/`, `src/lib/` para confirmar si está en uso
3. Producir tabla de decisión en `docs/plans/soy-61-clasificar-carpetas-runtime-v1/decision-table.md`:
   - Columnas: carpeta | categoría | usado por | decisión | acción
4. Listar borrados seguros (ningún import activo apunta ahí)
5. Listar renames requeridos (nombre no refleja su categoría real)
6. No borrar ni mover nada en este stage — solo documentar

## Criterio de cierre
- `decision-table.md` creada con todas las carpetas clasificadas
- Lista de borrados seguros documentada
- Lista de renames requeridos documentada
- Cero cambios en archivos de código

## Resultado

La tabla de decisión ya quedó escrita en `docs/plans/soy-61-clasificar-carpetas-runtime-v1/decision-table.md`.
El inventario no requiere cambios de código en este stage.

## No tocar
- Ningún archivo fuera de `docs/plans/soy-61-clasificar-carpetas-runtime-v1/` en este stage
