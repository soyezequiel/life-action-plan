# Reordenar la documentación por dominio

> **Linear:** SOY-65
> **Status:** `pending`
> **Plan:** `docs/plans/soy-65-reordenar-docs-dominio-v1/PLAN.md`
> **Padre:** SOY-43 — stage 5 de `repo-cleanup-doc-order-v1`

## Contexto
`docs/README.md` no refleja el árbol real de documentación. Carpetas como `docs/maqueta/` y `docs/assets/` no tienen política de archivo clara. `docs/.obsidian/` puede estar en el repo por error. `docs/progress/PROGRESS.md` tiene referencias obsoletas.

## Alcance
Actualizar `docs/README.md` para reflejar el árbol real. Definir política de archivo para `docs/maqueta/` y `docs/assets/`. Evaluar si `docs/.obsidian/` debe salir del repo. Corregir referencias obsoletas en `PROGRESS.md`.

## Pasos de implementación
1. Leer el árbol actual de `docs/` y comparar con `docs/README.md`
2. Actualizar `docs/README.md` para que refleje la estructura real con descripción de cada subdirectorio
3. Definir política de archivo en el README: qué va en `maqueta/` (prototipos históricos, no tocar), qué va en `assets/` (recursos de documentación)
4. Evaluar `docs/.obsidian/`: si no es necesario para el repo, agregar a `.gitignore` y documentar por qué
5. Leer `docs/progress/PROGRESS.md` y corregir/eliminar referencias a versiones o herramientas retiradas
6. Verificar que `npm run build` no se ve afectado (docs no afectan build)

## Criterio de cierre
- `docs/README.md` refleja el árbol real de `docs/`
- Política de archivo documentada para `maqueta/` y `assets/`
- `PROGRESS.md` sin referencias obsoletas

## No tocar
- Contenido técnico de los documentos (solo estructura y referencias)
- Código fuera de `docs/`
