# Endurecer readiness y narrativa de deploy en Vercel

> **Linear:** SOY-66
> **Status:** `pending`
> **Plan:** `docs/plans/soy-66-endurecer-deploy-vercel-v1/PLAN.md`
> **Padre:** SOY-43 — stage 6 de `repo-cleanup-doc-order-v1`

## Contexto
La narrativa de deploy está dispersa entre `README.md`, `docs/deployment/VERCEL.md`, `scripts/deploy-doctor.mjs`, `next.config.ts` y `package.json`. Preview y producción pueden mostrar opciones solo válidas en local (Ollama, variables de entorno locales). Hay que unificar el contrato mínimo de deploy.

## Alcance
Unificar la documentación de deploy. Documentar el contrato mínimo para preview y producción en Vercel. Asegurar que preview/prod no presentan opciones incompatibles con el entorno cloud.

## Pasos de implementación
1. Leer `README.md`, `docs/deployment/VERCEL.md`, `scripts/deploy-doctor.mjs`, `next.config.ts` y `package.json` para identificar inconsistencias
2. Definir el contrato mínimo de deploy: variables de entorno requeridas, servicios externos, pasos de configuración
3. Actualizar `docs/deployment/VERCEL.md` como fuente de verdad del deploy
4. Sincronizar `README.md` para que referencie `VERCEL.md` sin duplicar contenido
5. Revisar `next.config.ts`: identificar opciones que solo aplican en local y documentarlas con comentario `// local-only`
6. Actualizar `scripts/deploy-doctor.mjs` si tiene checks que asumen entorno local

## Criterio de cierre
- `docs/deployment/VERCEL.md` tiene el contrato mínimo completo de deploy
- `README.md` referencia VERCEL.md sin duplicar
- Ningún archivo de config presenta opciones local-only como si fueran para producción sin aclaración

## No tocar
- Lógica de `next.config.ts` (solo agregar comentarios si es necesario)
- Variables de entorno (no modificar valores, solo documentar cuáles son requeridas)
