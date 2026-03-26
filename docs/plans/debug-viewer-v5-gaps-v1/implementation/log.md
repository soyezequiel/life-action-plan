## Sesion 2026-03-26T04:32:01-03:00 - codex

### Tareas completadas
- [x] Tarea 1: extender PipelineRuntimeData y PipelineRuntimeRecorder con `repairExhausted` y `domainCardMeta`
- [x] Tarea 2: emitir `onRepairExhausted` desde el runner V5 cuando se agotan los 3 ciclos
- [x] Tarea 3: conectar hooks en los call sites reales del recorder (`src/lib/domain/plan-generation.ts` y `scripts/lap-runner-v5-real.ts`)
- [x] Tarea 4: propagar ambos campos a `flow-to-graph.ts` y al viewer (`FlowStepNode.tsx`, `FlowDetailModal.tsx`, i18n)
- [x] Tarea 5: agregar `tests/pipeline-v5/debug-viewer-gaps.test.ts`
- [x] Tarea 6: correr validacion automatica y verificacion visual

### Archivos tocados
- `src/lib/flow/pipeline-runtime-data.ts` - snapshot y recorder con `repairExhausted` y `domainCardMeta`
- `src/lib/pipeline/v5/runner.ts` - hook `onRepairExhausted` y emision al cortar por `MAX_REPAIR_CYCLES`
- `src/lib/domain/plan-generation.ts` - persistencia de `markRepairExhausted()` y `setDomainCardMeta()` en el call site real del build API
- `scripts/lap-runner-v5-real.ts` - misma conexion de hooks para el runner real
- `src/lib/flow/flow-to-graph.ts` - inyeccion de `repairExhausted` y `domainCard` en runtimeData
- `components/debug/FlowStepNode.tsx` - warning visual de repair agotado y row extra para domain card
- `components/debug/FlowDetailModal.tsx` - label `domainCard` y merge al output del modal de classify
- `src/i18n/index.ts` - runtime fallbacks nuevos
- `src/i18n/locales/es-AR.json` - keys `debug.flow.repair_exhausted` y `debug.flow.field_domain_card`
- `tests/pipeline-v5/debug-viewer-gaps.test.ts` - 6 tests nuevos para recorder y grafo
- `docs/plans/debug-viewer-v5-gaps-v1/PLAN.md` - gate actualizado a completado
- `docs/plans/debug-viewer-v5-gaps-v1/status.json` - status final `implemented`

### Decisiones tomadas
- La ruta real del call site del build API hoy es `src/lib/domain/plan-generation.ts`, no `src/lib/flow/plan-generation.ts` como sugeria el prompt. Se implemento sobre la ubicacion vigente del repo.
- `FlowDetailModal.tsx` se ajusto solo para mergear `domainCard` en la salida de `classify`, de modo que la label agregada sea visible sin cambiar el resto del renderer.

### Tests ejecutados
- `npm run test -- tests/pipeline-v5/debug-viewer-gaps.test.ts` -> OK
- `npm run test -- tests/flow-to-graph.test.ts` -> OK
- `npm run test -- tests/pipeline-runtime-data.test.ts` -> OK
- `npm run test` -> OK (78 files, 438 tests)
- `npm run build` -> OK

### Evidencia visible
- Verificacion visual aislada con `next start --port 3100` sobre el build local.
- `/debug/flow` mostro `guitarra (MANUAL, 92%)` en `classify`.
- `/debug/flow` mostro `Ciclos agotados - quedan fallas sin resolver` en `repair`.

### Estado final: implemented
