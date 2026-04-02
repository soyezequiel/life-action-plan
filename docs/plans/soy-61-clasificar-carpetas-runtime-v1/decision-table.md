# Decision Table

| Carpeta | Categoria | Usado por | Decision | Accion |
| --- | --- | --- | --- | --- |
| `components/mockups/` | `historical-legacy` | Ningun import activo actual | `delete-candidate` | Mantener ausente; no reintroducir en rutas activas. |
| `components/plan-viewer/` | `runtime` | `app/plan/page.tsx` | `keep` | Conservar como UI de producto vigente. |
| `components/pipeline-visualizer/` | `runtime` | `app/debug/v6-visualizer/page.tsx`, `app/flow/v6-visualizer/page.tsx`, `components/workspace/views/IntakeView.tsx`, `src/lib/client/topology-layout.ts` | `keep` | Conservar como dependencia activa del flujo y del visor. |
| `app/debug/` | `runtime-internal` | Rutas de debug internas | `keep` | Mantener fuera del camino principal del producto, pero sin borrar. |
| `docs/maqueta/` | `historical-doc` | Referencia documental, no runtime | `archive` | Conservar solo como historia o material visual; no exponer como camino principal. |
| `docs/prompts/` | `tooling` | Flujos de trabajo de agentes y prompts operativos | `keep` | Mantener indexado como soporte interno. |
| `src/lib/skills/` | `tooling` | Skills vendorizadas para agentes | `keep` | Mantener como tooling interno, no como producto. |

## Borrados seguros

- `components/mockups/` es un candidato seguro de borrado desde la perspectiva de imports activos; en el estado actual ya no aparece en el arbol activo.

## Renames requeridos

- Ninguno en este stage. Los renames de naming de producto quedan para stages posteriores.
