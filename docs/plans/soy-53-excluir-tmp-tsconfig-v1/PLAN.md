# Excluir tmp/ del tsconfig de typecheck

> **Linear:** SOY-53
> **Status:** `pending`
> **Plan:** `docs/plans/soy-53-excluir-tmp-tsconfig-v1/PLAN.md`
> **Padre:** SOY-41 — sub-task de `fix-typecheck-stale-tests-v1`

## Contexto
`tsconfig.typecheck.json` incluye la carpeta `tmp/` que contiene scripts de debug que no son parte del build. Esto genera 13 errores de typecheck irrelevantes que dificultan ver los errores reales.

## Alcance
Agregar `tmp` al array `exclude` de `tsconfig.typecheck.json`. Validar que el conteo de errores baja en 13.

## Pasos de implementación
1. Leer `tsconfig.typecheck.json` y verificar el array `exclude` actual
2. Agregar `"tmp"` al array `exclude`
3. Ejecutar `npm run typecheck` y verificar que el número de errores baja exactamente en 13

## Criterio de cierre
- `tsconfig.typecheck.json` tiene `"tmp"` en `exclude`
- `npm run typecheck` muestra 13 errores menos que antes

## No tocar
- Cualquier otro campo de `tsconfig.typecheck.json`
- Scripts dentro de `tmp/` (solo excluirlos, no borrarlos)
