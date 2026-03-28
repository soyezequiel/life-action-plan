# Fix: Eliminar Fallbacks Silenciosos del Pipeline V6

## Contexto

El pipeline V6 tiene un defecto critico de diseno: cuando las llamadas LLM fallan (timeout, auth invalido, modelo no disponible), **cada agente silenciosamente retorna datos fabricados** y el pipeline termina con status `completed`, score 100/100 y 7 iteraciones — identico a un run exitoso. No hay forma de distinguir un plan generado por IA de uno 100% sintetico.

Evidencia directa: ejecutar `--provider=codex` cuando los tokens de Codex estan vencidos produce "Fundamentos" y "Desarrollo" como fases — strings hardcodeados en el fallback de `executePlan()` linea 592. El pipeline completa en 2.4 segundos (vs ~55s de un run real con Ollama).

## Objetivo

1. **Nunca mas los fallbacks deben simular exito** — cuando un agente usa fallback, el resultado DEBE indicar degradacion visible en el output (SSE, scratchpad, PlanPackage y CLI)
2. **Verificar disponibilidad del runtime ANTES de ejecutar** — si no hay tokens validos o el LLM no responde, informar al usuario antes de consumir tiempo
3. **El scratchpad y el reasoningTrace deben incluir informacion diagnostica completa** — que error exacto ocurrio, en que agente, con que provider

## Archivos a modificar

### 1. Nuevo tipo: `AgentExecutionOutcome` — tracking de fallbacks

**Archivo:** `src/lib/pipeline/v6/types.ts`

Agregar un schema y tipo para representar el resultado de cada ejecucion de agente, distinguiendo LLM real de fallback:

```typescript
export const AgentExecutionOutcomeSchema = z.object({
  agent: V6AgentNameSchema,
  phase: OrchestratorPhaseSchema,
  source: z.enum(['llm', 'fallback', 'deterministic']),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  durationMs: z.number().int().min(0),
}).strict();
export type AgentExecutionOutcome = z.infer<typeof AgentExecutionOutcomeSchema>;
```

- `source: 'llm'` = el agente ejecuto con el LLM exitosamente
- `source: 'fallback'` = el agente fallo y uso datos fabricados
- `source: 'deterministic'` = el agente es puro (ej: scheduler MILP, packager)

Agregar al `OrchestratorResult`:

En `src/lib/pipeline/v6/orchestrator.ts` linea 41-48, agregar al interface `OrchestratorResult`:
```typescript
export interface OrchestratorResult {
  status: 'completed' | 'needs_input' | 'failed';
  package: PlanPackage | null;
  pendingQuestions: ClarificationRound | null;
  scratchpad: ReasoningEntry[];
  tokensUsed: number;
  iterations: number;
  // NUEVOS:
  agentOutcomes: AgentExecutionOutcome[];
  degraded: boolean; // true si ALGUN agente uso fallback
}
```

Agregar `agentOutcomes` al `PlanPackageSchema` en `types.ts` linea 192-204:
```typescript
export const PlanPackageSchema = z.object({
  // ... campos existentes ...
  agentOutcomes: z.array(AgentExecutionOutcomeSchema).optional(),
  degraded: z.boolean().optional(),
});
```

### 2. El orchestrator debe trackear outcomes — NO silenciar errores

**Archivo:** `src/lib/pipeline/v6/orchestrator.ts`

**2a.** Agregar un array `private agentOutcomes: AgentExecutionOutcome[] = []` al constructor de `PlanOrchestrator`.

**2b.** Cambiar el metodo `executeLoop()` (linea 326-377).

El loop actual en linea 340-352:
```typescript
try {
  result = await this.executePhase(this.state.phase);
} catch (error) {
  this.recordEntry(this.state.phase, this.phaseToAgent(this.state.phase), {
    action: `Error in ${this.state.phase}`,
    reasoning: error instanceof Error ? error.message : 'Unknown error',
    result: 'Phase failed, moving to package',
  });
  this.state.phase = 'package';
  continue;
}
```

Debe cambiarse para registrar el outcome:
```typescript
const phaseStart = Date.now();
try {
  result = await this.executePhase(this.state.phase);
  // executePhase ahora debe retornar { result, source } — ver punto 2c
} catch (error) {
  const elapsed = Date.now() - phaseStart;
  const errorMsg = error instanceof Error ? error.message : 'Unknown error';
  this.agentOutcomes.push({
    agent: this.phaseToAgent(this.state.phase),
    phase: this.state.phase,
    source: 'fallback',
    errorCode: error instanceof Error ? error.constructor.name : 'UNKNOWN',
    errorMessage: errorMsg,
    durationMs: elapsed,
  });
  this.recordEntry(this.state.phase, this.phaseToAgent(this.state.phase), {
    action: `FALLBACK in ${this.state.phase}`,
    reasoning: `Agent failed: ${errorMsg}`,
    result: 'Used fallback data — result is NOT from LLM',
  });
  this.state.phase = 'package';
  continue;
}
```

**2c.** Cada metodo `executeXxx()` debe cambiar su patron de try/catch para registrar outcomes.

El patron actual en TODOS los agentes del orchestrator es:
```typescript
if (agent) {
  try {
    return await agent.execute(input, this.runtime);
  } catch {
    return agent.fallback(input);
  }
}
```

Debe cambiarse a (ejemplo `executeInterpret`, linea 479-501):
```typescript
private async executeInterpret(): Promise<GoalInterpretation> {
  this.lastAction = 'Interpreting goal';
  const agent = await this.getAgent<{ goalText: string }, GoalInterpretation>('goal-interpreter');
  const input = { goalText: this.context.goalText };
  const start = Date.now();

  if (agent) {
    try {
      const result = await agent.execute(input, this.runtime);
      this.agentOutcomes.push({
        agent: 'goal-interpreter', phase: 'interpret',
        source: 'llm', errorCode: null, errorMessage: null,
        durationMs: Date.now() - start,
      });
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.agentOutcomes.push({
        agent: 'goal-interpreter', phase: 'interpret',
        source: 'fallback', errorCode: 'AGENT_EXECUTE_FAILED',
        errorMessage: errorMsg, durationMs: Date.now() - start,
      });
      this.recordEntry('interpret', 'goal-interpreter', {
        action: 'FALLBACK: goal-interpreter',
        reasoning: `LLM call failed: ${errorMsg}`,
        result: 'Using heuristic fallback — NOT from LLM',
      });
      return agent.fallback(input);
    }
  }

  this.agentOutcomes.push({
    agent: 'goal-interpreter', phase: 'interpret',
    source: 'fallback', errorCode: 'AGENT_NOT_FOUND',
    errorMessage: 'Agent not registered', durationMs: Date.now() - start,
  });
  return { /* fallback inline existente */ };
}
```

**Aplicar el mismo patron a:** `executeClarify`, `executePlan`, `executeCheck`, `executeSchedule`, `executeCritique`, `executeRevise`, `executePackage`.

**EXCEPCION para `executeSchedule`**: el scheduler MILP es deterministico (no usa LLM para el core). Cuando el MILP solver corre exitosamente, `source` debe ser `'deterministic'`, no `'llm'`. Solo la parte de `explainTradeoffs` usa LLM.

**EXCEPCION para `executePackage`**: el packager es puro (deterministico). `source` siempre debe ser `'deterministic'`.

**2d.** Fix critico en `executePlan()` linea 584-599:

El `runtime.chat()` en `generateStrategy()` (linea 163 de `strategy.ts`) esta FUERA del try/catch interno. Si la llamada HTTP falla, la excepcion sube hasta `executePlan()` y cae en el catch de linea 590, que retorna el fallback generico.

En `src/lib/pipeline/shared/strategy.ts` linea 163, el `runtime.chat()` debe moverse DENTRO del try:
```typescript
// ANTES (roto):
const response = await runtime.chat([{ role: 'user', content: prompt }]);
try {
  // parse response...
} catch {
  return fallback;
}

// DESPUES (correcto):
try {
  const response = await runtime.chat([{ role: 'user', content: prompt }]);
  // parse response...
} catch (error) {
  // Ahora captura tanto errores de red como errores de parsing
  // IMPORTANTE: re-throw con contexto para que el orchestrator lo registre
  throw new Error(`generateStrategy failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
}
```

NOTA: ahora `generateStrategy` hace throw en vez de retornar fallback silencioso. El catch de `executePlan()` en el orchestrator es quien maneja el fallback Y lo registra como `AgentExecutionOutcome`.

**2e.** `buildFinalResult()` (linea 1092-1098) debe incluir los outcomes y el flag `degraded`:
```typescript
private buildFinalResult(): OrchestratorResult {
  const hasFallbacks = this.agentOutcomes.some(o => o.source === 'fallback');
  return {
    status: this.state.phase === 'done' ? 'completed' : 'failed',
    package: this.context.finalPackage ? {
      ...this.withLatestReasoningTrace(this.context.finalPackage),
      agentOutcomes: this.agentOutcomes,
      degraded: hasFallbacks,
    } : null,
    pendingQuestions: null,
    scratchpad: this.scratchpad.getAll(),
    tokensUsed: this.scratchpad.totalTokens(),
    iterations: this.state.iteration,
    agentOutcomes: this.agentOutcomes,
    degraded: hasFallbacks,
  };
}
```

### 3. Verificacion pre-ejecucion del runtime

**Archivo:** `app/api/plan/build/route.ts`

Despues de crear el `runtime` (linea 138-142), y ANTES de enviar el primer SSE phase event (linea 144), agregar una verificacion rapida:

```typescript
const runtime = getProvider(execution.runtime.modelId, {
  apiKey: execution.runtime.apiKey,
  baseURL: execution.runtime.baseURL,
  thinkingMode,
  authMode: execution.runtime.authMode, // <-- ASEGURAR que authMode se pase
});

// === PRE-FLIGHT CHECK ===
try {
  const preflight = await runtime.chat([{
    role: 'user',
    content: 'Respond with exactly: OK',
  }]);
  if (!preflight.content.includes('OK')) {
    send({
      type: 'result',
      result: {
        success: false,
        error: `El modelo respondio pero no de la forma esperada. Respuesta: "${preflight.content.slice(0, 100)}". Verifica que el modelo ${execution.runtime.modelId} este disponible.`,
      },
    });
    return;
  }
} catch (preflightError) {
  const msg = preflightError instanceof Error ? preflightError.message : String(preflightError);
  send({
    type: 'result',
    result: {
      success: false,
      error: `No se pudo conectar con el modelo (${execution.runtime.modelId}). Error: ${msg}. ` +
        (execution.runtime.authMode === 'codex-oauth'
          ? 'Verifica que tu sesion de Codex este activa: ejecuta "codex" en la terminal para re-autenticar.'
          : 'Verifica tu API key o que Ollama este corriendo.'),
    },
  });
  return;
}

send({ type: 'v6:phase', data: { phase: 'interpret', iteration: 0 } });
```

**NOTA sobre `authMode`:** Asegurar que `execution.runtime.authMode` se pase al `getProvider`. Revisar `build-execution.ts` linea 78-84: actualmente el `BuildRuntimeConfig` YA incluye `authMode?: BuildRuntimeAuthMode`, pero en `route.ts` linea 138 no se pasa `authMode` al `getProvider`. Agregar: `authMode: execution.runtime.authMode`.

### 4. SSE events de degradacion

**Archivo:** `app/api/plan/build/route.ts`

Despues de `orchestrator.run()` (linea 165), antes de enviar `v6:complete`, agregar evento de degradacion si aplica:

```typescript
const result = await orchestrator.run(goalText, { ... });

// Informar degradacion via SSE
if (result.degraded) {
  const fallbackAgents = result.agentOutcomes
    .filter(o => o.source === 'fallback')
    .map(o => `${o.agent}: ${o.errorMessage ?? 'unknown'}`)
    .join('; ');
  send({
    type: 'v6:degraded',
    data: {
      message: `El plan se genero con datos parcialmente sinteticos porque ${result.agentOutcomes.filter(o => o.source === 'fallback').length} agente(s) no pudieron conectarse al LLM.`,
      failedAgents: fallbackAgents,
      agentOutcomes: result.agentOutcomes,
    },
  });
}
```

Tambien incluir `degraded` y `agentOutcomes` en el `v6:complete` event (linea 237-247):
```typescript
send({
  type: 'v6:complete',
  data: {
    planId: persistedPlan.planId,
    score: result.package.qualityScore,
    iterations: result.iterations,
    package: result.package,
    reasoningTrace,
    scratchpad: result.scratchpad,
    degraded: result.degraded,
    agentOutcomes: result.agentOutcomes,
  },
});
```

### 5. Agentes individuales: NO retornar fallback silencioso

Cada agente debe hacer throw cuando su llamada LLM falla, en vez de retornar el fallback internamente. El orchestrator es quien decide si usar fallback y lo registra.

**Archivos a modificar:**

**5a.** `src/lib/pipeline/v6/agents/goal-interpreter.ts` linea 145-155:
```typescript
// ANTES:
try {
  const response = await runtime.chat([...]);
  // ...parse...
} catch {
  return goalInterpreterAgent.fallback(input); // SILENCIOSO
}

// DESPUES:
const response = await runtime.chat([...]);
// ...parse... (si el parse falla, dejar que tire - el orchestrator maneja)
```

El `catch` interno del agente que llama `runtime.chat()` DEBE re-throw, no retornar fallback. El fallback lo invoca el orchestrator y lo registra.

**Aplicar a:**
- `goal-interpreter.ts` — remover el try/catch alrededor de `runtime.chat()`, dejar que el error suba
- `clarifier-agent.ts` — idem
- `critic-agent.ts` — idem (linea 232-236: `runtime.chat` no tiene try/catch propio, ya esta bien pero `extractFirstJsonObject` + `parseAndNormalize` deben tirar si el JSON es invalido)
- `feasibility-checker.ts` — `generateLlmSuggestions` ya tiene try/catch propio (linea 335-347); eso esta bien porque las suggestions son opcionales, el core es deterministico
- `domain-expert.ts` — idem, el `resolveCard` ya tiene try/catch para la parte de generacion, y lo que retorna es un warning, no un fallback silencioso

**5b.** `src/lib/pipeline/shared/strategy.ts` — ya cubierto en punto 2d.

### 6. Frontend: mostrar advertencia de degradacion

**Archivo:** `components/flow/PlanFlow.tsx` (o donde se manejan los SSE callbacks)

Cuando se recibe `v6:degraded`, mostrar un banner de advertencia al usuario:
- Texto: "Este plan fue generado parcialmente con datos de respaldo porque no se pudo conectar con el modelo de IA. Los resultados pueden ser genericos."
- Color: amarillo/naranja (warning)
- Incluir la lista de agentes que fallaron

**Archivo:** `src/lib/client/plan-client.ts`

Agregar el callback `onDegraded` a `PlanStreamCallbacks`:
```typescript
export interface PlanStreamCallbacks {
  // ...existentes...
  onDegraded?: (data: { message: string; failedAgents: string; agentOutcomes: unknown[] }) => void;
}
```

Y procesarlo en el parser de SSE events.

### 7. CLI script: mostrar degradacion en el reporte

**Archivo:** `scripts/run-plan.mjs`

Cuando el resultado incluya `degraded: true`, mostrar en stderr y en el reporte markdown:

```markdown
## ⚠️ ADVERTENCIA: Plan degradado

Este plan fue generado parcialmente con datos de respaldo.
Los siguientes agentes NO pudieron conectarse al LLM:

| Agente | Error | Duracion |
|--------|-------|----------|
| goal-interpreter | CODEX_AUTH_REFRESH_FAILED:401 | 234ms |
| clarifier | CODEX_AUTH_REFRESH_FAILED:401 | 198ms |
| ...
```

## Reglas de implementacion

1. **NO cambiar las firmas de `V6Agent.fallback`** — los fallbacks siguen existiendo como safety net, pero el orchestrator es quien decide invocarlos y los registra.
2. **`generateStrategy` en `shared/strategy.ts` debe hacer THROW, no retornar fallback** — el catch del orchestrator lo maneja.
3. **Zod `.strict()` en todos los schemas nuevos** — sin excepciones.
4. **NO hardcodear strings de UI** — usar `i18n` para mensajes al usuario.
5. **NO crear archivos nuevos innecesarios** — los cambios van en los archivos existentes excepto si se necesita un nuevo tipo.
6. **Tests:** actualizar los tests existentes en `tests/pipeline/` que verifican el resultado del orchestrator para incluir los nuevos campos `agentOutcomes` y `degraded`.

## Verificacion

Despues de aplicar los cambios:
1. `npm run build` debe pasar sin errores
2. `npm test` debe pasar
3. Ejecutar `node scripts/run-plan.mjs "Aprender guitarra" --provider=codex` con tokens vencidos:
   - Debe fallar ANTES de ejecutar el pipeline (preflight check)
   - El error debe decir explicitamente que la sesion de Codex esta vencida
4. Ejecutar con `--provider=ollama` (Ollama apagado):
   - Debe fallar en el preflight check con mensaje claro
5. Ejecutar con `--provider=ollama` (Ollama prendido):
   - Debe completar exitosamente con `degraded: false`
   - `agentOutcomes` debe mostrar `source: 'llm'` para interpret, clarify, plan, check, critique
   - `source: 'deterministic'` para schedule y package
