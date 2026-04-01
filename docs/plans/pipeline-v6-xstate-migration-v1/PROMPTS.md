# Prompts de Implementacion - Migracion del motor v6 a XState

> Uso: copiar y pegar cada prompt en un chat nuevo de un agente de codigo.
> Nota: los prompts estan en ingles porque para este tipo de tarea tecnica funcionan mejor asi. Copialos tal cual.

## Prompt 1

```text
Objective:
Extract the real v6 runtime flow into an explicit XState v5 machine model without changing public route behavior yet.

Starting State:
The current flow is split between:
- docs/architecture/PIPELINE_V6_SPEC.md
- src/lib/pipeline/v6/state-machine.ts
- src/lib/pipeline/v6/orchestrator.ts
- src/lib/pipeline/v6/types.ts

Target State:
- A new XState v5 machine exists for the v6 build engine.
- The machine encodes the real states, events, guards, and terminal outcomes.
- No route or SSE integration is changed yet.

Scope:
Only work in:
- package.json
- src/lib/pipeline/v6/xstate/
- src/lib/pipeline/v6/types.ts
- tests/pipeline/

Do Not:
- Do not revert unrelated changes.
- Do not change app/api routes yet.
- Do not change frontend client behavior yet.
- Do not introduce @xstate/react in this step.

Stop and Ask Before:
- changing snapshot schema behavior
- changing SSE event names
- deleting existing orchestrator files

Done When:
- xstate is added as a dependency
- a machine compiles and covers interpret, clarify, plan, check, schedule, critique, revise, package, done, failed, blocked, paused_for_input
- tests document the chosen behavior for resume with empty answers
```

Done when:
- The machine model exists and compiles.

## Prompt 2

```text
Objective:
Replace the imperative flow control inside the v6 orchestrator with an adapter around the new XState machine while preserving the current public contracts.

Starting State:
- An XState v5 machine already exists under src/lib/pipeline/v6/xstate/
- The current public contracts are used by:
  - app/api/plan/build/route.ts
  - app/api/plan/build/resume/route.ts
  - src/lib/client/plan-client.ts
  - scripts/run-plan.mjs

Target State:
- PlanOrchestrator.run(), resume(), getProgress(), getSnapshot(), and getDebugStatus() still exist.
- Their internals are driven by the XState machine.
- Existing SSE payloads and OrchestratorResult shapes remain compatible.

Scope:
Only work in:
- src/lib/pipeline/v6/orchestrator.ts
- src/lib/pipeline/v6/session-snapshot.ts
- src/lib/pipeline/v6/types.ts
- src/lib/pipeline/v6/xstate/
- tests/pipeline/
- tests/plan-build-resume-route.test.ts

Do Not:
- Do not revert unrelated changes.
- Do not redesign the frontend.
- Do not change PlanPackage v5 compatibility.
- Do not move persistence into the machine state model.

Stop and Ask Before:
- removing backward compatibility for schemaVersion 1 snapshots
- changing the meaning of blocked vs failed
- changing publication gate semantics

Done When:
- the orchestrator becomes a thin compatibility adapter
- pause/resume works through serialized machine state
- publication ready/blocked/failed is derived from the machine path or an explicit adapter layer
- transition and route tests pass
```

Done when:
- The orchestrator is compatibility-only and public behavior stays stable.

## Prompt 3

```text
Objective:
Finalize the v6-to-XState migration by aligning docs, cleaning duplicated legacy flow logic, and verifying external parity.

Starting State:
- The runtime already runs through the XState-backed orchestrator adapter.
- Legacy transition logic may still remain in state-machine.ts or duplicated helper code.

Target State:
- There is a single source of truth for the runtime flow.
- The v6 spec matches the real implementation.
- The repo keeps the same build, resume, degraded, and blocked behavior externally.

Scope:
Only work in:
- src/lib/pipeline/v6/state-machine.ts
- src/lib/pipeline/v6/orchestrator.ts
- docs/architecture/PIPELINE_V6_SPEC.md
- tests/pipeline/
- tests/plan-build-resume-route.test.ts

Do Not:
- Do not revert unrelated changes.
- Do not remove compatibility helpers until tests prove they are unused.
- Do not change route URLs or SSE event names.

Stop and Ask Before:
- deleting files entirely
- removing schemaVersion 1 snapshot support
- changing CLI-visible output shape

Done When:
- duplicated transition logic is removed or clearly deprecated
- PIPELINE_V6_SPEC.md matches the runtime behavior
- typecheck, tests, and build pass where applicable
```

Done when:
- The migration is documented, tested, and no longer split across duplicate transition sources.
