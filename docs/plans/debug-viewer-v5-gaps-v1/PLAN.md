# Debug Viewer V5 - Cierre de Gaps de Observabilidad

> **Plan ID**: `debug-viewer-v5-gaps-v1`
> **Status**: `implemented`
> **Autor**: Codex
> **Fecha**: 2026-03-26
> **Prompt de referencia**: `docs/prompts/codex/CODEX_DEBUG_VIEWER_GAPS.md`
> **Scope**: cerrar 2 gaps puntuales del viewer de `/debug/flow` sin romper las 12 fases V5 existentes.

---

## Objetivo

Agregar dos mejoras aditivas de observabilidad al debug viewer V5:

1. Diferenciar el caso en que el loop de `repair` agotó los 3 ciclos y todavia quedaron fallas pendientes.
2. Persistir y mostrar la `domainCard` resuelta en `classify`, incluyendo etiqueta de dominio, metodo de generacion y confianza.

El resultado esperado es que el snapshot runtime, el grafo y la UI del viewer reflejen ambos estados de forma visible y testeable.

---

## Alcance

Incluye:

- Extender `PipelineRuntimeData` con `repairExhausted` y `domainCardMeta`.
- Extender `PipelineRuntimeRecorder` con `markRepairExhausted()` y `setDomainCardMeta()`.
- Agregar el hook `onRepairExhausted` al tracker del runner V5.
- Conectar los hooks en los call sites que ya persisten runtime data.
- Exponer ambos datos en `flow-to-graph.ts` para `repair` y `classify`.
- Mostrar el estado en `FlowStepNode.tsx` y registrar las labels necesarias en `FlowDetailModal.tsx`.
- Agregar keys i18n para el warning de repair y el label de domain card.
- Cubrir el cambio con tests unitarios nuevos.

No incluye:

- Cambios breaking del contrato serializado.
- Subir `schemaVersion` de `PipelineRuntimeData`.
- Rediseño del debug viewer.
- Cambios funcionales en la logica de classify o repair fuera de la observabilidad.

---

## Archivos a tocar

- `src/lib/flow/pipeline-runtime-data.ts`
- `src/lib/pipeline/v5/runner.ts`
- `src/lib/flow/plan-generation.ts`
- `scripts/lap-runner-v5-real.ts`
- `src/lib/flow/flow-to-graph.ts`
- `components/debug/FlowStepNode.tsx`
- `components/debug/FlowDetailModal.tsx`
- Archivo de traducciones donde viven las keys `debug.flow.*`
- `tests/pipeline-v5/debug-viewer-gaps.test.ts`

---

## Plan de implementacion

### 1. Extender snapshot y recorder runtime

Actualizar `PipelineRuntimeData` para incluir:

- `repairExhausted: boolean`
- `domainCardMeta: { domainLabel: string; method: string; confidence: number } | null`

Actualizar `createEmptyPipelineRuntimeData()` para inicializar:

- `repairExhausted` en `false`
- `domainCardMeta` en `null`

Agregar al recorder:

- `markRepairExhausted()`
- `setDomainCardMeta(meta)`

La implementacion debe seguir usando `snapshotWithUpdate()` y mantener `schemaVersion` en `2`.

### 2. Emitir agotamiento del loop de repair

Extender `FlowRunnerV5Tracker` con:

```ts
onRepairExhausted?: (
  repairCycles: number,
  remainingFindings: Array<{ severity: string; message: string }>
) => void
```

En `runFullPipeline()`, dentro del loop de repair, reemplazar el `break` silencioso del caso `attempt >= MAX_REPAIR_CYCLES` por:

- Emision de `tracker.onRepairExhausted?.(...)`
- Luego `break`

Los findings deben salir de `toRepairTrackerFindings(...)` con `hardValidate`, `softValidate` y `coveVerify`.

### 3. Persistir metadata de domain card tras classify

Sin acoplar el runner al recorder, aprovechar los call sites donde ya se conecta `onPhaseSuccess`.

Despues de `markPhaseSuccess('classify', ...)`, leer `runner.getContext()` y si `ctx.domainCard` existe, persistir:

- `domainLabel`
- `generationMeta.method`
- `generationMeta.confidence`

Esto debe hacerse en todos los call sites relevantes del runner V5 que ya registran runtime data.

### 4. Reflejar ambos campos en el grafo

En `extractRuntimeData()`:

- Para `repair`, agregar `repairExhausted` al fallback/runtime data si el snapshot lo trae.
- Para `classify`, inyectar un string `domainCard` con formato:
  `"{domainLabel} ({method}, {confidence%})"`

Esto debe convivir con la data actual de cada fase y no pisar salidas ya visibles.

### 5. Mostrar estados en la UI del viewer

En `FlowStepNode.tsx`:

- `repair`: mostrar una fila warning con `t('debug.flow.repair_exhausted')` cuando `repairExhausted === true`
- `classify`: mostrar una fila adicional con el string `domainCard` si existe

En `FlowDetailModal.tsx`:

- Agregar `domainCard: 'debug.flow.field_domain_card'` a `FIELD_LABELS`

En i18n:

- `debug.flow.repair_exhausted`: `Ciclos agotados - quedan fallas sin resolver`
- `debug.flow.field_domain_card`: `Conocimiento de dominio`

### 6. Tests y validacion

Crear `tests/pipeline-v5/debug-viewer-gaps.test.ts` con cobertura de:

1. `markRepairExhausted()` deja `repairExhausted === true`
2. `repairExhausted` queda `false` cuando `repair` se marca como skipped
3. `setDomainCardMeta()` persiste correctamente los valores
4. `domainCardMeta` inicia en `null`
5. `generateGraphData()` expone `runtimeData.domainCard` en `classify`
6. `generateGraphData()` expone `runtimeData.repairExhausted === true` en `repair`

Validacion final obligatoria:

- `npm run test`
- `npm run build`

Evidencia visible recomendada:

- `/debug/flow` mostrando warning de repair agotado
- `/debug/flow` mostrando domain card en `classify`

---

## Orden recomendado

1. Extender `PipelineRuntimeData` y `PipelineRuntimeRecorder`.
2. Agregar el hook `onRepairExhausted` al tracker y emitirlo desde el runner.
3. Conectar hooks en `plan-generation.ts` y `lap-runner-v5-real.ts`.
4. Exponer campos en `flow-to-graph.ts`.
5. Ajustar `FlowStepNode.tsx`, `FlowDetailModal.tsx` e i18n.
6. Agregar tests.
7. Ejecutar `npm run test` y `npm run build`.

---

## Riesgos y controles

- Riesgo: marcar `repairExhausted` en casos donde no hay fallas residuales.
  Control: emitir el hook solo en el branch donde el loop corta por `MAX_REPAIR_CYCLES`.

- Riesgo: acoplar el runner al recorder.
  Control: persistir `domainCardMeta` solo desde los call sites que ya coordinan tracker y recorder.

- Riesgo: romper snapshots previos.
  Control: cambios aditivos, defaults seguros y `schemaVersion` sin cambios.

- Riesgo: inconsistencias entre summary y modal.
  Control: derivar ambos desde `runtimeData` y cubrir `flow-to-graph.ts` con tests.

---

## Gate de cierre

- [x] `PipelineRuntimeData` incluye `repairExhausted` y `domainCardMeta`
- [x] `PipelineRuntimeRecorder` expone ambos metodos nuevos
- [x] `FlowRunnerV5Tracker` expone `onRepairExhausted`
- [x] El runner emite `onRepairExhausted` cuando agota ciclos con fallas pendientes
- [x] Los call sites conectan `markRepairExhausted()` y `setDomainCardMeta()`
- [x] `classify` muestra la domain card en el viewer
- [x] `repair` muestra el warning de ciclos agotados
- [x] Las keys i18n nuevas existen
- [x] `tests/pipeline-v5/debug-viewer-gaps.test.ts` cubre los 6 casos
- [x] `npm run test` pasa
- [x] `npm run build` pasa
- [x] `schemaVersion` permanece en `2`
