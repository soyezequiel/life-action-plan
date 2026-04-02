# Plan: Limpieza de repo y orden documental

> **Objetivo**: reducir residuos y ambiguedades del repo sin romper el runtime actual, dejando una frontera explicita entre producto, material historico y soporte documental.
> **Base de analisis**: `docs/architecture/REGISTRY.json`, `docs/plans/REGISTRY.json`, `docs/README.md`, `README.md`, `package.json`, `next.config.ts`, `vercel.json`, `docs/progress/PROGRESS.md`, `docs/deployment/VERCEL.md`.
> **Criterio rector**: eliminar o mover solo lo que hoy agrega deuda operativa, y conservar lo historico unicamente cuando tenga indice, ownership y motivo de existir.

## Diagnostico actual

El repo hoy funciona como mezcla de tres capas que no estan bien separadas:

1. **Producto vivo**
   Next.js 15, App Router, pipeline `v6`, Postgres, rutas API activas y flujo browser-based.

2. **Material legacy o transicional**
   Naming `v5`, componentes `Mockup*`, scripts antiguos, rutas de debug/demo y documentos historicos que siguen visibles como si fueran parte del camino principal.

3. **Documentacion y activos de trabajo interno**
   mockups pesados, workspace de Obsidian, prompts viejos, planes fuera del registro y paquetes de skills vendorizados dentro de `src/lib/skills`.

El problema no es solo estetico. Hoy hay drift entre source of truth, naming visible, scripts expuestos y readiness real para Vercel.

## Hallazgos que motivan este plan

### Estado real relevado el 2026-04-02

El analisis actual del repo muestra que una parte del diagnostico original ya fue absorbida por cambios posteriores y por subplanes separados:

- `app/plan/page.tsx` ya monta `components/plan-viewer/PlanificadorPage.tsx`, no `PlanMockupPage`
- `app/settings/page.tsx` ya monta `components/workspace/WorkspaceOrchestrator`, no `SettingsMockupPage`
- `app/auth/page.tsx` hoy solo redirige a `/auth/signin`
- `components/Dashboard.tsx` y `components/IntakeExpress.tsx` ya montan `WorkspaceOrchestrator`
- `package.json` ya no expone `lap:run:v5-real`, `lap:run:v5-example` ni `pulse:input`
- `docs/README.md` ya refleja el arbol real de `docs/`

Eso no cierra SOY-43. Cambia la forma correcta de implementarlo: este plan pasa a ser un **plan orquestador** que debe apoyarse en subplanes concretos y cerrar solo la deuda que sigue viva.

### 1. La frontera producto vs mockup no es explicita

- `app/plan/page.tsx` monta `components/plan-viewer/PlanMockupPage.tsx`
- `app/settings/page.tsx` monta `components/settings/SettingsMockupPage.tsx`
- `app/auth/page.tsx` monta `components/mockups/AuthScreen.tsx`
- `components/Dashboard.tsx` e `components/IntakeExpress.tsx` son re-exports de `components/mockups/*`

Esto no prueba que la UI este rota, pero si que el repo comunica una historia equivocada: lo que deberia ser producto se ve como maqueta y lo que es maqueta vive dentro del arbol principal.

### 2. Hay deuda viva de V5 en runtime, tests y copys

- sigue existiendo la ruta `app/plan/v5/page.tsx`
- la navegacion principal apunta a `/plan/v5`
- `src/lib/client/use-plan-v5.ts` y varios componentes siguen siendo el contrato cliente del visor persistido
- `src/i18n/locales/es-AR.json` y tests mencionan `scripts/lap-runner-v5-real.ts`
- `package.json` publica scripts `lap:run`, `lap:run:v5-real`, `lap:run:v5-example` y `pulse:input`, pero esos archivos no existen en `scripts/`

Esto convierte el naming legacy en deuda funcional real.

### Deuda real que sigue abierta al 2026-04-02

- `src/i18n/locales/es-AR.json` y tests activos siguen mencionando `scripts/lap-runner-v5-real.ts`
- `app/plan/v5/page.tsx` sigue existiendo como alias/redirect de la superficie persistida
- `docs/architecture/PIPELINE_V6_SPEC.md` y varios planes activos todavia documentan `/plan/v5` como salida canonica
- `docs/plans/pipeline-visualizer-v1/` ya fue normalizado en `docs/plans/REGISTRY.json`
- siguen existiendo otros planes legacy en `docs/plans/` que conviene revisar contra el registro
- `docs/deployment/VERCEL.md` afirma que `postbuild` ejecuta `db:push` "cuando corresponda", pero `scripts/vercel-prepare.mjs` solo ejecuta DB si hay flags explicitas
- `next.config.ts` corre `deploy-doctor` solo en ciertos entornos y tolera su fallo; ademas el build ignora errores de TypeScript y ESLint

### 3. El sistema de planes tiene al menos un plan huerfano

- `docs/plans/pipeline-visualizer-v1/plan.md` existia fuera de la convencion canonica y ya fue registrado
- su `status.json` no incluye `series_id`, `version`, `lifecycle`, `latest_in_series` ni `canonical_plan_file`
- el plan no figura en `docs/plans/REGISTRY.json`

El repositorio ya tiene un sistema canonico de planes; dejar excepciones le quita credibilidad.

### 4. El indice documental no representa el arbol real

`docs/README.md` solo documenta parcialmente `docs/`, pero hoy tambien existen:

- `docs/deployment/`
- `docs/qa/`
- `docs/assets/`
- `docs/maqueta/`
- `docs/.obsidian/`
- `docs/mapa-mental-proyecto.md`
- `docs/mapa-mental-proyecto.canvas`

La documentacion no esta mal por cantidad sino por falta de taxonomia y ownership.

### 5. Hay demasiado peso versionado en mockups y tooling de autor

- `docs/maqueta/` ocupa aproximadamente 14 MB
- `docs/.obsidian/` esta versionado aunque es estado de editor
- `src/lib/skills/` versiona skills completos y un `Archive.zip`

Nada de eso es necesariamente invalido, pero hoy no esta justificado ni indexado como parte del producto.

### 6. La narrativa de readiness para Vercel no coincide con la realidad operativa

Hallazgos de `doctor:deploy`:

- `DATABASE_URL` local
- falta `SESSION_SECRET`
- falta `API_KEY_ENCRYPTION_SECRET`
- falta `NEXTAUTH_URL`

Hallazgos de estructura:

- el repo tiene remoto git pero no esta linkeado con `.vercel/`
- `README.md` afirma que `npm run vercel-build` ejecuta migraciones automaticas, pero el script hoy es `npm run build`
- `docs/deployment/VERCEL.md` mezcla requisitos actuales con flujo Codex session y no deja un contrato minimo unico para preview/produccion

## Objetivos de limpieza

1. Dejar un arbol donde lo operativo del producto tenga nombres de producto, no de mockup.
2. Sacar del camino principal lo historico o experimental sin perder trazabilidad.
3. Ordenar `docs/` con un indice fiel al arbol real y una politica simple de que se conserva, que se mueve y que se elimina.
4. Eliminar scripts, referencias y planes huerfanos que ya no representan el estado del repo.
5. Dejar Vercel como target documentado de forma consistente con el codigo y los checks actuales.

## No objetivos

- Reescribir el pipeline `v6`
- borrar historia util solo por reducir tamaño
- redisenar la UI completa
- cambiar el modelo de datos o la estrategia de providers en esta etapa

## Plan de implementacion

### Etapa 1. Inventario y clasificacion canonica

**Objetivo**: decidir por cada area si queda como runtime, como referencia historica o si se elimina.

**Tareas**:
- clasificar `components/mockups/`, `components/plan-viewer/`, `components/pipeline-visualizer/`, `app/debug/`, `docs/maqueta/`, `docs/prompts/`, `src/lib/skills/`
- marcar cada item como `runtime`, `historical-doc`, `tooling`, `delete`
- fijar una regla simple: nada de editor-state, demo o mockup puede seguir en la ruta principal sin una justificacion explicita

**Salida esperada**:
- tabla de decision por carpeta
- lista cerrada de borrados seguros
- lista cerrada de moves/renames necesarios

### Etapa 2. Separar producto vivo de mockups y demos

**Objetivo**: que las rutas activas de la app ya no dependan de nombres o carpetas de maqueta.

**Tareas**:
- renombrar componentes activos `*Mockup*` a nombres de producto cuando realmente sean la UI vigente
- mover a un namespace no operativo las maquetas reales que solo sirven como referencia visual
- revisar `app/auth`, `app/plan`, `app/settings`, `components/Dashboard.tsx`, `components/IntakeExpress.tsx`
- decidir si `/plan/v5` sigue siendo ruta publica de producto o pasa a una nomenclatura neutral
- dejar demos como `app/debug/logo-animation` fuera del camino principal o claramente etiquetadas como internas

**Criterio de cierre**:
- ninguna ruta de producto importa componentes llamados `Mockup*`
- ningun copy de usuario final sugiere rutas o scripts que ya no existen

### Etapa 3. Limpiar scripts, referencias rotas y deuda nominal de V5

**Objetivo**: eliminar comandos y referencias que prometen piezas inexistentes.

**Tareas**:
- revisar `package.json` y eliminar o reparar scripts que apuntan a archivos ausentes
- corregir i18n, tests y docs que siguen mencionando `lap-runner-v5-*`
- decidir si `plan-v5` sigue siendo nombre tecnico aceptado o si corresponde migrarlo a un nombre semantico
- consolidar scripts duplicados o ambiguos como `patch_orchestrator.mjs`, `patch_orchestrator.ts` y `patch_orchestratorV2.mjs`

**Criterio de cierre**:
- `package.json` no expone comandos muertos
- no quedan referencias a scripts inexistentes en UI, tests o docs operativas

### Etapa 4. Higiene del sistema de planes

**Objetivo**: que `docs/plans/` vuelva a ser canonico de verdad.

**Tareas**:
- registrar o archivar el resto de planes legacy que sigan fuera de `REGISTRY.json`
- revisar carpetas con nombres fuera de la convencion o metadata incompleta
- asegurar que todo plan vigente este en `REGISTRY.json`
- mover planes no elegibles a `historical`, `superseded` u `obsolete` segun corresponda

**Criterio de cierre**:
- sin planes activos fuera del registro
- sin `plan.md` lowercase en carpetas canonicas

### Etapa 5. Reordenar documentacion por dominio

**Objetivo**: que `docs/README.md` explique el arbol real y que cada carpeta tenga una razon clara de existir.

**Tareas**:
- actualizar `docs/README.md` para reflejar `architecture`, `plans`, `progress`, `deployment`, `qa`, `assets`, `maqueta`, `prompts`
- crear una politica de archivo para `docs/maqueta/` y `docs/assets/`
- sacar `docs/.obsidian/` del repo si no es indispensable
- revisar `docs/progress/PROGRESS.md` para que no siga apuntando a `docs/architecture/PLAN_LAP_FINAL.md`, hoy obsoleto
- distinguir documentos operativos de documentos historicos o de exploracion

**Criterio de cierre**:
- el indice de `docs/` coincide con el arbol real
- cada carpeta documental tiene owner, proposito y regla de permanencia

### Etapa 6. Endurecer readiness de Vercel y narrativa de deploy

**Objetivo**: que el repo documente y valide el deploy real, no uno idealizado.

**Tareas**:
- unificar `README.md`, `docs/deployment/VERCEL.md`, `scripts/deploy-doctor.mjs`, `next.config.ts` y `package.json`
- documentar el contrato minimo para preview/produccion: base cloud, provider cloud, secretos de auth y encriptacion
- decidir si el repo debe quedar linkeado a Vercel o solo documentado para `vercel link`
- revisar si la logica de build en `next.config.ts` debe seguir atrapando fallos del doctor y continuar
- asegurar que preview/prod no presenten opciones locales incompatibles con Vercel

**Criterio de cierre**:
- `doctor:deploy` falla solo por configuracion ausente, no por contradicciones del repo
- la documentacion de deploy no promete pasos que el codigo no hace

### Etapa 7. Validacion final

**Objetivo**: cerrar la limpieza con evidencia automatica y visible.

**Validaciones minimas**:
- `npm run typecheck`
- `npm run test`
- `npm run doctor:deploy`
- `npm run build` o evidencia equivalente si el build requiere timeout mayor
- smoke visible de rutas principales: `/`, `/intake`, `/plan`, `/settings`, `/auth/signin`

## Plan ejecutable por subagentes

La implementacion de `SOY-43` ya esta descompuesta en subtareas hijas de Linear. La forma pragmatica de ejecutarla es usar un subagente por issue y tratar `docs/plans/repo-cleanup-doc-order-v1/PLAN.md` como coordinador, no como lugar para hacer toda la limpieza manualmente desde un solo agente.

### Regla de seleccion de modelo

- Usar como source of truth el modelo indicado en la **etiqueta** de Linear
- Si la descripcion del issue menciona otro modelo, tratarlo como drift editorial
- Mantener el nivel de razonamiento indicado en la descripcion del issue, salvo limitacion del runner

### Mapa de delegacion

| Linear | Stage | Objetivo | Modelo por etiqueta | Razonamiento | Depende de |
| --- | --- | --- | --- | --- | --- |
| `SOY-61` | 1 | Clasificar carpetas runtime/historico/tooling/delete | `Gemini 3 Pro` | alto | - |
| `SOY-62` | 2 | Separar producto vivo de mockups y demos | `GPT 5.4 Mini` | bajo | `SOY-61` |
| `SOY-63` | 3 | Eliminar scripts muertos y deuda nominal v5 | `Sonnet 4.6` | bajo | - |
| `SOY-64` | 4 | Regularizar el sistema canonico de planes | `GPT 5.4 Mini` | bajo | `SOY-61` |
| `SOY-65` | 5 | Reordenar docs por dominio | `Haiku 4.5` | bajo | `SOY-64` |
| `SOY-66` | 6 | Endurecer deploy/readiness Vercel | `GPT 5.4 Mini` | medio | `SOY-63` |

### Orden y paralelismo recomendados

1. Lanzar `SOY-61` y `SOY-63` en paralelo
2. Cuando cierre `SOY-61`, lanzar `SOY-62` y `SOY-64`
3. Cuando cierre `SOY-64`, lanzar `SOY-65`
4. Cuando cierre `SOY-63`, lanzar `SOY-66`
5. Cerrar `SOY-43` solo despues de una pasada final de validacion automatica y smoke visible

### Entregables por subagente

- `SOY-61`: `docs/plans/soy-61-clasificar-carpetas-runtime-v1/decision-table.md`
- `SOY-62`: renames y moves mecanicos sin tocar logica de negocio
- `SOY-63`: scripts/documentacion/tests/i18n sin referencias muertas a v5
- `SOY-64`: `docs/plans/REGISTRY.json` y `status.json` consistentes
- `SOY-65`: `docs/README.md` y `docs/progress/PROGRESS.md` alineados con el arbol real
- `SOY-66`: `docs/deployment/VERCEL.md` como contrato unico y `README.md` sincronizado

## Prompts operativos para subagentes

Los bloques siguientes estan preparados para pegarse en un agente de codigo. Mantienen el alcance chico, stop conditions explicitas y criterio de cierre observable.

### Prompt 1 - SOY-61

```text
Objective:
Execute SOY-61 for F:\proyectos\planificador-vida: classify runtime, historical-doc, tooling, and delete candidates for repo cleanup.

Starting State:
- Parent issue: SOY-43
- Canonical parent plan: docs/plans/repo-cleanup-doc-order-v1/PLAN.md
- Child plan: docs/plans/soy-61-clasificar-carpetas-runtime-v1/PLAN.md
- Architecture source of truth: docs/architecture/REGISTRY.json
- Plans source of truth: docs/plans/REGISTRY.json

Target State:
- docs/plans/soy-61-clasificar-carpetas-runtime-v1/decision-table.md exists
- Each target folder is classified with rationale, active consumers, and recommended action
- Safe deletes and required renames are explicitly listed

Scope:
Only inspect and update:
- docs/plans/soy-61-clasificar-carpetas-runtime-v1/
- app/
- components/
- src/lib/
- docs/

Do Not:
- Do not delete or move files
- Do not edit product code
- Do not add dependencies
- Do not revert unrelated changes

Stop and Ask Before:
- changing public routes
- marking a folder as deletable when active imports are ambiguous
- archiving large documentation folders

Done When:
- decision-table.md is created
- components/mockups, components/plan-viewer, components/pipeline-visualizer, app/debug, docs/maqueta, docs/prompts, and src/lib/skills are all classified
- no code outside the SOY-61 plan folder is modified
```

### Prompt 2 - SOY-62

```text
Objective:
Execute SOY-62 for F:\proyectos\planificador-vida: remove mockup naming from active product routes and move real mockups out of the operational path.

Starting State:
- Parent issue: SOY-43
- Depends on SOY-61 decision-table.md
- Child plan: docs/plans/soy-62-separar-producto-mockups-v1/PLAN.md

Target State:
- No active product route mounts components named Mockup*
- Runtime naming reflects product, not prototype
- Imports are updated without changing behavior

Scope:
Only work in:
- app/auth/
- app/plan/
- app/settings/
- components/
- docs/plans/soy-62-separar-producto-mockups-v1/

Do Not:
- Do not change business logic
- Do not touch app/api/
- Do not add dependencies
- Do not revert unrelated changes

Stop and Ask Before:
- deleting files
- moving shared components with unclear consumers
- changing route semantics or URLs

Done When:
- typecheck passes
- build passes
- active routes no longer import Mockup* components
```

### Prompt 3 - SOY-63

```text
Objective:
Execute SOY-63 for F:\proyectos\planificador-vida: remove dead scripts and stale v5 naming references.

Starting State:
- Parent issue: SOY-43
- Child plan: docs/plans/soy-63-eliminar-scripts-muertos-v5-v1/PLAN.md

Target State:
- package.json exposes no scripts pointing to missing files
- Active docs, tests, and i18n no longer reference lap-runner-v5-* when the runner does not exist
- Ambiguous duplicate scripts are either consolidated or documented for follow-up

Scope:
Only work in:
- package.json
- scripts/
- src/i18n/
- tests/
- docs/
- docs/plans/soy-63-eliminar-scripts-muertos-v5-v1/

Do Not:
- Do not change production runtime logic unless required by a broken script reference
- Do not add dependencies
- Do not revert unrelated changes

Stop and Ask Before:
- deleting scripts that may still be used outside package.json
- changing test intent instead of removing stale references
- touching external CI/CD configuration

Done When:
- typecheck passes
- build passes
- no active references remain to missing lap-runner-v5 scripts
```

### Prompt 4 - SOY-64

```text
Objective:
Execute SOY-64 for F:\proyectos\planificador-vida: regularize the canonical plan system so every active plan is represented in the registry with complete metadata.

Starting State:
- Parent issue: SOY-43
- Depends on SOY-61 for classification context
- Child plan: docs/plans/soy-64-regularizar-sistema-planes-v1/PLAN.md

Target State:
- docs/plans/REGISTRY.json matches the filesystem for active plans
- status.json files have complete metadata
- pipeline-visualizer-v1 is either registered correctly or marked non-active with justification

Scope:
Only work in:
- docs/plans/

Do Not:
- Do not edit plan content except metadata files
- Do not touch runtime code
- Do not revert unrelated changes

Stop and Ask Before:
- changing lifecycle of a plan whose status is not inferable from repo context
- deleting historical plan folders

Done When:
- no active plan remains outside REGISTRY.json
- all touched status.json files are complete and internally consistent
```

### Prompt 5 - SOY-65

```text
Objective:
Execute SOY-65 for F:\proyectos\planificador-vida: reorder documentation by domain and align the docs index with the real tree.

Starting State:
- Parent issue: SOY-43
- Depends on SOY-64
- Child plan: docs/plans/soy-65-reordenar-docs-dominio-v1/PLAN.md

Target State:
- docs/README.md reflects the real docs tree
- archive policy for docs/maqueta and docs/assets is documented
- docs/progress/PROGRESS.md no longer points to obsolete references as if they were current

Scope:
Only work in:
- docs/README.md
- docs/progress/PROGRESS.md
- docs/deployment/
- docs/plans/soy-65-reordenar-docs-dominio-v1/
- .gitignore if docs/.obsidian handling requires it

Do Not:
- Do not rewrite technical content beyond structural cleanup
- Do not touch app/ or src/
- Do not revert unrelated changes

Stop and Ask Before:
- removing docs/.obsidian from version control
- moving large doc folders

Done When:
- docs index matches the real tree
- archive policy is explicit
- stale references in PROGRESS.md are corrected
```

### Prompt 6 - SOY-66

```text
Objective:
Execute SOY-66 for F:\proyectos\planificador-vida: harden Vercel readiness and unify deploy documentation.

Starting State:
- Parent issue: SOY-43
- Depends on SOY-63
- Child plan: docs/plans/soy-66-endurecer-deploy-vercel-v1/PLAN.md
- Current deploy docs are split across README.md, docs/deployment/VERCEL.md, scripts/deploy-doctor.mjs, next.config.ts, and package.json

Target State:
- docs/deployment/VERCEL.md is the single deploy contract
- README.md references that contract without duplicating it
- local-only assumptions are clearly marked
- deploy-doctor expectations match the documented contract

Scope:
Only work in:
- README.md
- docs/deployment/VERCEL.md
- scripts/deploy-doctor.mjs
- next.config.ts
- package.json
- docs/plans/soy-66-endurecer-deploy-vercel-v1/

Do Not:
- Do not change deploy secrets or external service accounts
- Do not add dependencies
- Do not revert unrelated changes

Stop and Ask Before:
- changing build behavior
- changing auth or provider runtime semantics
- touching Vercel project linkage

Done When:
- doctor:deploy matches the documented contract
- README.md no longer duplicates deploy guidance
- local-only options are not presented as production defaults
```

## Notas de coordinacion

- `SOY-61` y `SOY-63` son las dos entradas con mejor retorno temprano: una aclara que mover y la otra saca ruido funcional inmediato
- En el estado actual del repo, `app/plan/page.tsx` ya monta `PlanificadorPage` y `app/settings/page.tsx` ya monta `WorkspaceOrchestrator`; la deuda de mockup visible parece concentrarse mas en documentacion/historia y nombres residuales que en esas rutas activas
- `docs/plans/pipeline-visualizer-v1/status.json` ya quedo normalizado respecto del contrato canónico
- `docs/.obsidian/` sigue versionado y `docs/progress/PROGRESS.md` todavia mezcla estado vigente con referencias historicas, por lo que `SOY-65` no deberia tratarse como solo un retoque de README

## Prioridad sugerida

1. Etapa 3
2. Etapa 4
3. Etapa 6
4. Etapa 2
5. Etapa 5
6. Etapa 7

La razon es simple: primero conviene sacar referencias muertas que ya generan deuda visible, despues regularizar el sistema canonico de planes y el contrato de deploy, y recien entonces ajustar naming y documentacion restante.

## Riesgos y mitigaciones

### Riesgo 1. Borrar material que todavia sirve para el frontend

**Mitigacion**:
- clasificar antes de borrar
- mover a `docs/` o a un namespace historico antes de eliminar definitivamente

### Riesgo 2. Romper imports por renames de componentes activos

**Mitigacion**:
- hacer renames mecanicos por etapa
- validar con `typecheck` despues de cada bloque

### Riesgo 3. Perder trazabilidad de decisiones viejas

**Mitigacion**:
- conservar historial en `docs/plans/` y `docs/architecture/`
- eliminar solo lo que no tenga consumidor ni valor documental

### Riesgo 4. Mezclar limpieza documental con refactor funcional

**Mitigacion**:
- mantener el scope: este plan ordena, recorta y renombra; no reescribe la arquitectura del producto

## Criterios de aceptacion

- no quedan scripts rotos expuestos en `package.json`
- no quedan rutas activas montando componentes con naming de mockup
- `docs/README.md` refleja el arbol documental real
- no quedan planes activos fuera del registro canonico
- el contrato de deploy a Vercel queda documentado de forma unica y consistente

## Evidencia relevada para este plan

- `npm run typecheck` en verde
- `npm run doctor:deploy` falla por configuracion real de Vercel pendiente, no por timeouts
- `docs/maqueta/` pesa aproximadamente 14 MB
- existen 252 archivos versionados dentro de `docs/.obsidian`, `docs/maqueta` y `src/lib/skills`

## Anexo: prompt operativo sugerido para ejecutar la Etapa 1

```text
You are working in F:\\proyectos\\planificador-vida.

Goal: execute only Stage 1 of the repo cleanup plan in docs/plans/repo-cleanup-doc-order-v1/PLAN.md.

Scope:
- inspect app/, components/, src/, scripts/, docs/, tests/
- produce a concrete classification table for runtime, historical-doc, tooling, or delete
- do not delete files
- do not change dependencies
- do not touch database schema
- do not revert unrelated changes

Stop and ask before:
- deleting any file
- moving large doc folders
- changing public routes
- altering Vercel or auth configuration

Done when:
- the plan document is updated with a resolved inventory table
- every major folder mentioned in Stage 1 has a classification and rationale
- typecheck still passes if you edited any code or config
```
