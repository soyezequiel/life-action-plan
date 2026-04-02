# Eliminar scripts muertos y deuda nominal de v5

> **Linear:** SOY-63
> **Status:** `pending`
> **Plan:** `docs/plans/soy-63-eliminar-scripts-muertos-v5-v1/PLAN.md`
> **Padre:** SOY-43 — stage 3 de `repo-cleanup-doc-order-v1`

## Contexto
`package.json` tiene scripts que apuntan a archivos que ya no existen. Referencias a `lap-runner-v5-*` aparecen en i18n, tests y docs pero el runner v5 fue retirado. Esta deuda nominal genera errores confusos y dificulta el onboarding.

## Alcance
Revisar `package.json` y corregir o eliminar scripts rotos. Limpiar referencias a `lap-runner-v5-*` en i18n, tests y docs. Consolidar scripts duplicados o ambiguos.

## Pasos de implementación
1. Ejecutar cada script de `package.json` en modo dry-run o verificar que el archivo target existe
2. Listar scripts que apuntan a archivos inexistentes — eliminar o corregir target
3. Buscar `lap-runner-v5` en todo el repo (`grep -r "lap-runner-v5" .`) y listar ocurrencias
4. Eliminar referencias en archivos i18n que apunten a runner v5
5. Actualizar referencias en tests: si el test testea algo de v5 que no existe, marcar como skip con comentario explicativo
6. Actualizar referencias en docs: reemplazar por la versión vigente o eliminar sección
7. Verificar `npm run typecheck` y `npm run build` sin nuevos errores

## Criterio de cierre
- Cero scripts en `package.json` que apunten a archivos inexistentes
- Cero referencias a `lap-runner-v5-*` en i18n, docs y tests activos
- `npm run build` en verde

## No tocar
- Lógica de producción (`app/`, `src/lib/`)
- Scripts de CI/CD que funcionen correctamente
