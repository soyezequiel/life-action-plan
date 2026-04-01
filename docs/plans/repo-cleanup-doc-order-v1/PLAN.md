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

### 3. El sistema de planes tiene al menos un plan huerfano

- `docs/plans/pipeline-visualizer-v1/plan.md` existe fuera de la convencion canónica
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
- regularizar o archivar `docs/plans/pipeline-visualizer-v1`
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

## Prioridad sugerida

1. Etapa 3
2. Etapa 2
3. Etapa 4
4. Etapa 5
5. Etapa 6
6. Etapa 7

La razon es simple: primero conviene sacar comandos muertos y naming enganoso, despues mover el arbol, y recien al final reescribir indices y docs.

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
