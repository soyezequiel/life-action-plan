# Prompts para Antigravity - V6 gaps reales

Estos prompts estan pensados para abrirse en chats separados de Antigravity.

Orden recomendado:
1. True resume persistence
2. Planner prompt wiring + domain context
3. Packager contract + reasoning trace
4. Agent registry cleanup

Regla comun para todas las sesiones:
- Work only inside `F:\proyectos\planificador-vida`
- Do not revert unrelated changes
- Ask before running destructive terminal commands
- First produce a short Artifact with:
  - files you plan to touch
  - risk areas
  - validation you will run
- Wait for confirmation after the Artifact before editing

---

## Prompt 1 - True V6 resume persistence

```text
You are working in `F:\proyectos\planificador-vida`.

Goal: implement real pause/resume persistence for the V6 planning flow. The current repo stores only a minimal `v6State` snapshot and then recreates a fresh orchestrator on resume, which means resume is not a true continuation of the previous run.

What exists now:
- `app/api/plan/build/route.ts`
- `app/api/plan/build/resume/route.ts`
- `src/lib/pipeline/v6/orchestrator.ts`
- `src/lib/pipeline/v6/state-machine.ts`
- `src/lib/pipeline/v6/types.ts`
- `src/lib/db/interactive-sessions.ts`
- `src/lib/domain/plan-v5-activation.ts`

Current problem:
- `build` stores a minimal `runtimeSnapshot.v6State`
- `resume` rebuilds a new orchestrator, calls `run(goalText, ...)`, and only then applies `resume(answers)`
- this loses the actual `OrchestratorState`, `OrchestratorContext`, and the exact pause point

Implement this deliverable:
1. Persist the actual V6 runtime snapshot needed for a true resume:
   - serialized `OrchestratorState`
   - serialized `OrchestratorContext`
   - serialized scratchpad entries if they are not already fully represented in state/context
2. Add the smallest clean restoration path in `PlanOrchestrator` so a paused instance can be reconstructed safely.
3. Update `app/api/plan/build/route.ts` to save the full paused V6 snapshot when `result.status === 'needs_input'`.
4. Update `app/api/plan/build/resume/route.ts` to restore the paused orchestrator and call a real `resume(answers)` path directly, without re-running `run()` from the beginning.
5. Keep the existing SSE contract intact unless a minimal change is absolutely required.
6. Do not change database schema unless you discover it is strictly necessary. Prefer using the existing `interactiveSessions.runtimeSnapshot` JSONB.
7. Respect repo rules:
   - use Luxon for business-time logic
   - avoid `new Date()` in this flow
   - if you touch `app/api/` or shared contracts, run `npm run build`

Constraints:
- Only make changes directly required for this deliverable.
- Do not add new dependencies.
- Do not refactor unrelated V5 code.
- Do not revert unrelated work already present in the repo.

Done when:
- a paused V6 session resumes from the saved orchestrator snapshot instead of restarting the whole loop
- `build` and `resume` share a consistent snapshot format
- V6 completion still persists the final plan correctly
- `npm run build` passes

Verification:
- run `npm run build`
- if feasible, verify one visible V6 flow that pauses for clarification and resumes to completion
```

---

## Prompt 2 - Planner prompt wiring + domain context

```text
You are working in `F:\proyectos\planificador-vida`.

Goal: make the V6 planning path actually use the structured prompt stack that already exists in the repo, and make planning consume domain context in a real way.

What already exists:
- `src/lib/pipeline/v6/orchestrator.ts`
- `src/lib/pipeline/v6/prompts/strategy-reasoning.ts`
- `src/lib/pipeline/v6/prompts/critic-reasoning.ts`
- `src/lib/pipeline/v6/agents/domain-expert.ts`
- `src/lib/pipeline/v6/agents/critic-agent.ts`
- `src/lib/pipeline/v5/strategy.ts`

Current problem:
- `buildStrategyPrompt()` exists but `executePlan()` and `executeRevise()` are still using `generateStrategy()` with only basic inputs
- `critic-reasoning.ts` exists but revise still builds ad-hoc text
- `domain-expert` exists but is not meaningfully integrated into the planning path

Implement this deliverable:
1. Wire the V6 planning flow so `executePlan()` uses the structured strategy prompt path.
2. Wire the revise flow so `executeRevise()` uses the existing critic formatting utility instead of ad-hoc prompt text.
3. Reuse V5 strategy generation instead of replacing it, but add the smallest adapter needed so V6 can pass richer planning context:
   - interpretation
   - clarification answers
   - domain context
   - previous critic findings during revise
4. Integrate `domain-expert` only where it materially improves planning context. Keep it minimal and deterministic:
   - if domain context is already available, do not duplicate work
   - if no specialized domain can be inferred, fall back cleanly
5. Preserve current V6 phase semantics and do not add a new public phase unless absolutely required.

Constraints:
- Do not reimplement the planner from scratch.
- Do not remove the existing V5 strategy engine.
- Do not change unrelated route handlers or UI.
- Do not add dependencies.
- Do not revert unrelated changes.

Done when:
- `buildStrategyPrompt()` is actually used by the V6 plan path
- revise uses the existing critic formatting utility
- domain context is actually fed into planning instead of being mostly inert
- the final code path remains small, understandable, and buildable
- `npm run build` passes

Verification:
- run `npm run build`
- summarize exactly which runtime path now uses the new prompt wiring
```

---

## Prompt 3 - Packager contract + reasoning trace consistency

```text
You are working in `F:\proyectos\planificador-vida`.

Goal: fix the contract drift between the V6 orchestrator and the V6 packager, and make reasoning trace plumbing consistent from package generation through persistence.

Files to inspect first:
- `src/lib/pipeline/v6/orchestrator.ts`
- `src/lib/pipeline/v6/agents/packager-agent.ts`
- `src/lib/pipeline/v6/types.ts`
- `src/lib/domain/plan-v5-activation.ts`
- `src/lib/db/db-helpers.ts`
- `app/api/plan/build/route.ts`
- `app/api/plan/build/resume/route.ts`

Current problem:
- the packager expects `scratchpad`
- the orchestrator currently passes `scratchpadSummary`
- reasoning trace is partially present across packager output and persistence, but the contract is not clean end to end

Implement this deliverable:
1. Align the packager input contract and the orchestrator call site.
2. Ensure the packager receives the real scratchpad entries it needs.
3. Make reasoning trace handling consistent across:
   - final package generation
   - route completion payloads
   - plan persistence in DB
4. Keep the public behavior stable unless a small correction is required.
5. Add or update focused tests if there is already a natural test location for this contract.

Constraints:
- Keep this session limited to the packaging/trace contract.
- Do not change unrelated planner logic.
- Do not add schema changes unless strictly necessary.
- Do not revert unrelated changes.

Done when:
- there is no mismatch between packager input type and orchestrator usage
- reasoning trace is passed in a consistent shape end to end
- V6 completion still returns and persists the final plan correctly
- relevant validation passes

Verification:
- run `npm run test` if the touched area has tests
- run `npm run build` if you touch shared contracts, DB helpers, or API routes
```

---

## Prompt 4 - Agent registry cleanup and warning removal

```text
You are working in `F:\proyectos\planificador-vida`.

Goal: remove the fragile optional-loading path in the V6 agent registry and eliminate the current Next.js critical dependency warning, while preserving graceful runtime behavior.

Relevant files:
- `src/lib/pipeline/v6/agent-registry.ts`
- `src/lib/pipeline/v6/orchestrator.ts`
- `src/lib/pipeline/v6/agents/*`

Current issue:
- the registry currently uses `createRequire(import.meta.url)` and optional module loading
- this produces a Next.js warning about a critical dependency request expression
- most of the V6 agents now exist in the repo, so the registry can likely be simplified

Implement this deliverable:
1. Remove or minimize the dynamic require-based registry path that triggers the warning.
2. Keep graceful behavior if a V6 agent is unavailable, but prefer a simpler static import path where possible.
3. Preserve the orchestrator fallback behavior.
4. Avoid broad refactors outside the V6 registry/loading area.

Constraints:
- Do not change unrelated planner logic.
- Do not change route behavior unless needed for the warning fix.
- Do not add dependencies.
- Do not revert unrelated changes.

Done when:
- the V6 agent registry no longer uses the warning-producing pattern, or the warning is otherwise eliminated with a cleaner implementation
- agent resolution still works for the existing V6 flow
- `npm run build` passes

Verification:
- run `npm run build`
- report whether the previous critical dependency warning is gone
```

