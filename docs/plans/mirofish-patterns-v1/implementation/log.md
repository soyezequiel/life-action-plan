## Sesión 2026-03-23T14:32 — antigravity

### Tareas completadas
- [x] U1.1: Crear schema `SimPersona` (`persona-profile.ts`)
- [x] U1.2: Crear `persona-builder.ts` (LLM + fallback rules)
- [x] U1.3: Inyectar SimPersona en el orchestrator
- [x] U1.4: Agregar `persona` a SimTree schema
- [x] U2.1: Crear schema `SimActionLogEntry`
- [x] U2.2: Refactorizar user-agent con ReACT loop (3 pasos: reason → act → observe)
- [x] U2.3: Guardar actionLog en nodo simulado
- [x] U2.4: Fallback sin LLM genera actionLog mínimo
- [x] U3.1: Enriquecer `FlowTaskProgress` con `reactPhase` y `nodeLabel`
- [x] U3.2: Emitir progreso desde ReACT loop via `onProgress`
- [x] U3.3: Propagar progreso en orchestrator

### Archivos tocados
- `src/shared/schemas/persona-profile.ts` — **CREADO** — Schema Zod del SimPersona
- `src/lib/flow/agents/persona-builder.ts` — **CREADO** — Builder LLM + rules
- `src/shared/schemas/simulation-tree.ts` — Agregado `simActionLogEntrySchema`, `actionLog` en SimNode, `persona` en SimTree, import de persona-profile
- `src/lib/flow/simulation-tree-builder.ts` — Agregado `actionLog: []` a todos los nodos, `persona: null` al tree
- `src/lib/flow/agents/user-agent.ts` — **REESCRITO** — ReACT loop (3 iteraciones LLM), SimPersona en prompt, onProgress callbacks, actionLog output
- `src/lib/flow/agents/world-agent.ts` — Agregado `persona` en input y prompt (disrupciones sensibles a personalidad)
- `src/lib/flow/simulation-orchestrator.ts` — Genera persona antes del loop, la pasa a todos los agentes, recolecta actionLog
- `src/shared/types/flow-api.ts` — Agregados `reactPhase`, `nodeLabel`, export de `SimActionLogEntry`

### Decisiones tomadas
- El ReACT loop usa 3 llamadas LLM separadas (reason, act, observe) en vez de un solo shot. Esto triplica los LLM calls pero produce output explicable y debuggeable.
- Timeout de cada paso: 8 segundos. Si falla en cualquier paso, cae al fallback heurístico conservando el log parcial.
- La persona se genera una sola vez por simulación (no por nodo), para eficiencia.
- Se usa `simPersonaSchema.omit({ generatedWith, generatedAt })` al parsear respuesta LLM para evitar que el LLM tenga que generar metadata.

### Tests ejecutados
- `npm run typecheck` → 0 errores en source code (59 errores pre-existentes en tests con mocks desactualizados)
- `tests/simulation-tree-schema.test.ts` → 6/6 PASS

### Estado final: implemented
