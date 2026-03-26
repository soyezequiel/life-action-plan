# Tarea para Codex: Cerrar 2 gaps del Debug Viewer V5

> **Contexto**: El debug viewer en `/debug/flow` ya funciona correctamente con las 12 fases V5. Faltan 2 mejoras puntuales de observabilidad que no rompen nada existente.

---

## Archivos que DEBES leer antes de escribir código

1. `src/lib/flow/pipeline-runtime-data.ts` — Tipos `PipelineRuntimeData`, `PipelineRuntimeRecorder`, función `snapshotWithUpdate`
2. `src/lib/pipeline/v5/runner.ts` — Foco en el loop de repair (líneas ~259-286): `while(true)` con `MAX_REPAIR_CYCLES = 3`, el `break` sin evento cuando `attempt >= MAX_REPAIR_CYCLES`
3. `src/lib/flow/flow-to-graph.ts` — Función `extractRuntimeData()` que arma el `runtimeData` de cada nodo
4. `components/debug/FlowStepNode.tsx` — `RuntimeSummary` para `classify` y `repair`
5. `components/debug/FlowDetailModal.tsx` — `FIELD_LABELS` y `PhaseMeta`
6. `src/lib/domain/domain-knowledge/bank.ts` — Tipo `DomainKnowledgeCard`, campo `generationMeta`

---

## Gap 1: Flag `repairExhausted` cuando el loop agota los 3 ciclos con fallas pendientes

### Problema

Cuando el runner ejecuta 3 ciclos de repair pero siguen existiendo fallas (hard o CoVe), el loop simplemente hace `break` (runner.ts ~línea 270-272) **sin emitir ningún evento al tracker**. El viewer no puede distinguir entre:
- "0 repairs necesarios" → repair queda `skipped` ✅
- "1-3 repairs exitosos, sin fallas residuales" → repair queda `success` ✅
- "3 repairs ejecutados pero fallas persisten" → repair queda `success` ❌ debería verse distinto

### Cambios

#### 1a. Agregar campo `repairExhausted` a `PipelineRuntimeData`

En `src/lib/flow/pipeline-runtime-data.ts`:

- Agregar `repairExhausted: boolean` a la interface `PipelineRuntimeData` (al lado de `repairCycles`)
- Inicializarlo como `false` en `createEmptyPipelineRuntimeData()`
- Agregar método `markRepairExhausted()` a la interface `PipelineRuntimeRecorder`:
  ```typescript
  markRepairExhausted(): PipelineRuntimeData
  ```
- Implementar en `createPipelineRuntimeRecorder()`:
  ```typescript
  markRepairExhausted() {
    snapshot = snapshotWithUpdate(snapshot, (draft) => {
      draft.repairExhausted = true
    })
    return snapshot
  }
  ```

#### 1b. Llamar a `markRepairExhausted()` desde el runner

En `src/lib/pipeline/v5/runner.ts`, el método `runFullPipeline()` ya recibe un `tracker`. El problema es que el loop de repair no tiene acceso al recorder directamente — solo al tracker.

**Solución**: Agregar un nuevo hook al tracker.

En la interface `FlowRunnerV5Tracker` (runner.ts ~línea 89-96), agregar:
```typescript
onRepairExhausted?: (repairCycles: number, remainingFindings: Array<{ severity: string; message: string }>) => void;
```

En el loop de repair (~línea 270), donde dice:
```typescript
if (attempt >= MAX_REPAIR_CYCLES) {
  break;
}
```

Cambiar a:
```typescript
if (attempt >= MAX_REPAIR_CYCLES) {
  tracker.onRepairExhausted?.(
    attempt,
    toRepairTrackerFindings(
      this.context.hardValidate ?? { findings: [] },
      this.context.softValidate ?? { findings: [] },
      this.context.coveVerify ?? { findings: [] },
    ),
  );
  break;
}
```

#### 1c. Conectar el hook en los call sites del recorder

Buscar todos los lugares donde se pasa un tracker al runner (buscar `onRepairAttempt` para encontrarlos — probablemente `src/lib/flow/plan-generation.ts` y `scripts/lap-runner-v5-real.ts`). En cada uno, agregar:
```typescript
onRepairExhausted: () => runtimeRecorder.markRepairExhausted(),
```

#### 1d. Mostrar el estado en el viewer

En `src/lib/flow/flow-to-graph.ts`, dentro de `extractRuntimeData()`, en el bloque de `phaseId === 'repair'` (~línea 68), agregar:
```typescript
if (phaseId === 'repair') {
  if (pipelineData.repairExhausted) {
    fallback.repairExhausted = true
  }
  // ...existing repairAttempts logic...
}
```

En `components/debug/FlowStepNode.tsx`, en el `RuntimeSummary` de `repair` (~línea 123), cuando `repairExhausted` es true, mostrar un indicador visual:
```tsx
{Boolean(runtimeData.repairExhausted) && (
  <span className="node-runtime-row node-runtime-warn">
    {t('debug.flow.repair_exhausted')}
  </span>
)}
```

Agregar la key de i18n `debug.flow.repair_exhausted` con valor `"Ciclos agotados — quedan fallas sin resolver"` en el archivo de traducciones correspondiente (buscar dónde están las keys `debug.flow.*`).

---

## Gap 2: Mostrar `domainCard` en el nodo de classify

### Problema

Durante `runClassifyPhase()`, el runner resuelve `domainCard` (puede ser estática `MANUAL`, generada `LLM_ONLY`, o `undefined`). Esta información es clave para debug pero no se persiste en el snapshot ni se muestra en el viewer.

### Cambios

#### 2a. Agregar `domainCardMeta` a `PipelineRuntimeData`

En `src/lib/flow/pipeline-runtime-data.ts`:

- Agregar a `PipelineRuntimeData`:
  ```typescript
  domainCardMeta: {
    domainLabel: string;
    method: string;
    confidence: number;
  } | null;
  ```
- Inicializar como `null` en `createEmptyPipelineRuntimeData()`
- Agregar método a `PipelineRuntimeRecorder`:
  ```typescript
  setDomainCardMeta(meta: PipelineRuntimeData['domainCardMeta']): PipelineRuntimeData
  ```
- Implementar:
  ```typescript
  setDomainCardMeta(meta) {
    snapshot = snapshotWithUpdate(snapshot, (draft) => {
      draft.domainCardMeta = meta
    })
    return snapshot
  }
  ```

#### 2b. Llamar a `setDomainCardMeta()` después de classify

Esto NO va en el runner (no queremos acoplar el runner al recorder). Va en los call sites donde se conecta el tracker.

En cada lugar donde se conecta `onPhaseSuccess` al recorder (buscar `onPhaseSuccess` en `plan-generation.ts` y `lap-runner-v5-real.ts`), agregar lógica después de que classify tenga éxito:

```typescript
onPhaseSuccess: (phase, result) => {
  runtimeRecorder.markPhaseSuccess(phase, io);
  if (phase === 'classify') {
    const ctx = runner.getContext();
    if (ctx.domainCard) {
      runtimeRecorder.setDomainCardMeta({
        domainLabel: ctx.domainCard.domainLabel,
        method: ctx.domainCard.generationMeta.method,
        confidence: ctx.domainCard.generationMeta.confidence,
      });
    }
  }
},
```

**Nota**: `runner.getContext()` ya es público (línea ~247 del runner). `domainCard` ya está en `FlowRunnerV5Context` (línea ~116).

#### 2c. Mostrar en el nodo de classify

En `src/lib/flow/flow-to-graph.ts`, dentro de `extractRuntimeData()`, agregar al final (fuera de los bloques de fase específicos):
```typescript
if (phaseId === 'classify' && pipelineData.domainCardMeta) {
  const base = phaseData ? (phaseData.output as Record<string, unknown>) : fallback
  return {
    ...base,
    domainCard: `${pipelineData.domainCardMeta.domainLabel} (${pipelineData.domainCardMeta.method}, ${(pipelineData.domainCardMeta.confidence * 100).toFixed(0)}%)`,
  }
}
```

En `components/debug/FlowStepNode.tsx`, en el `RuntimeSummary` de `classify` (~línea 41), agregar debajo del span de signals:
```tsx
{typeof runtimeData.domainCard === 'string' && (
  <span className="node-runtime-row" style={{ fontSize: '0.75rem', color: '#9d9a97' }}>
    {runtimeData.domainCard}
  </span>
)}
```

En `components/debug/FlowDetailModal.tsx`, agregar a `FIELD_LABELS`:
```typescript
domainCard: 'debug.flow.field_domain_card',
```

Agregar la key de i18n `debug.flow.field_domain_card` con valor `"Conocimiento de dominio"`.

---

## Tests

### Test file: `tests/pipeline-v5/debug-viewer-gaps.test.ts`

#### Test 1: `repairExhausted` se setea cuando el loop agota ciclos
- Crear un `PipelineRuntimeRecorder` con `createPipelineRuntimeRecorder()`
- Llamar `startRun()`, luego `recordRepairAttempt()` 3 veces, luego `markRepairExhausted()`
- Verificar que `getSnapshot().repairExhausted === true`

#### Test 2: `repairExhausted` es false cuando no se agotaron ciclos
- Crear un recorder, llamar `startRun()`, luego `markPhaseSkipped('repair')`
- Verificar que `getSnapshot().repairExhausted === false`

#### Test 3: `domainCardMeta` se persiste correctamente
- Crear un recorder, llamar `startRun()`
- Llamar `setDomainCardMeta({ domainLabel: 'running', method: 'MANUAL', confidence: 0.92 })`
- Verificar que `getSnapshot().domainCardMeta` tenga los valores correctos

#### Test 4: `domainCardMeta` es null por defecto
- Crear un recorder, llamar `startRun()`
- Verificar que `getSnapshot().domainCardMeta === null`

#### Test 5: `extractRuntimeData` incluye `domainCard` en classify
- Importar `generateGraphData` de `flow-to-graph.ts`
- Crear un `PipelineRuntimeData` con `domainCardMeta` seteado y `phases.classify` con output
- Verificar que el nodo de classify tenga `runtimeData.domainCard` como string

#### Test 6: `extractRuntimeData` incluye `repairExhausted` en repair
- Crear un `PipelineRuntimeData` con `repairExhausted: true` y `repairAttempts` no vacío
- Verificar que el nodo de repair tenga `runtimeData.repairExhausted === true`

---

## Criterios de aceptación

- [ ] `PipelineRuntimeData` tiene `repairExhausted: boolean` y `domainCardMeta: {...} | null`
- [ ] `PipelineRuntimeRecorder` tiene `markRepairExhausted()` y `setDomainCardMeta()`
- [ ] `FlowRunnerV5Tracker` tiene `onRepairExhausted` hook
- [ ] El runner llama a `onRepairExhausted` cuando `attempt >= MAX_REPAIR_CYCLES` con fallas pendientes
- [ ] Los call sites (plan-generation.ts, lap-runner-v5-real.ts) conectan ambos hooks
- [ ] El nodo de classify muestra domainCard (label + method + confidence)
- [ ] El nodo de repair muestra "Ciclos agotados" cuando `repairExhausted === true`
- [ ] Keys de i18n agregadas (`debug.flow.repair_exhausted`, `debug.flow.field_domain_card`)
- [ ] `tests/pipeline-v5/debug-viewer-gaps.test.ts` con 6 tests en verde
- [ ] `npm run test` pasa
- [ ] `npm run build` pasa
- [ ] NO se rompen tests existentes
- [ ] `schemaVersion` en `PipelineRuntimeData` se mantiene en `2` (son campos aditivos, no breaking change)
