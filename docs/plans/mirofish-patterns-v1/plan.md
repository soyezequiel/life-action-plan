# Plan: Patrones MiroFish para LAP

> **plan-id:** `mirofish-patterns-v1`
> **Alcance:** Incorporar 3 patrones de diseño de MiroFish-Offline al stack existente de LAP (TypeScript/Next.js), sin agregar dependencias externas.

---

## Contexto

MiroFish-Offline es un motor de simulación multi-agente (Python/Flask + Neo4j + OASIS) que genera cientos de agentes con personalidad para simular reacciones sociales. LAP simula la vida de **un** usuario ejecutando un plan personal.

No copiamos código (stacks incompatibles), pero sí adoptamos 3 patrones que mejorarían la calidad de las simulaciones actuales.

## Archivos principales que se tocan

| Archivo | Operación | Razón |
|---------|-----------|-------|
| `src/shared/schemas/simulation-tree.ts` | **Modificar** | Agregar schemas de `SimPersona` y `SimActionLog` |
| `src/shared/schemas/persona-profile.ts` | **Crear** | Schema Zod del perfil de personalidad del usuario simulado |
| `src/lib/flow/agents/persona-builder.ts` | **Crear** | Genera el perfil de personalidad a partir del Perfil de intake |
| `src/lib/flow/agents/user-agent.ts` | **Modificar** | Inyectar el SimPersona en el prompt y adoptar ReACT loop |
| `src/lib/flow/agents/world-agent.ts` | **Modificar** | Disrupciones sensibles a la personalidad del usuario |
| `src/lib/flow/simulation-orchestrator.ts` | **Modificar** | Action log, progress callbacks enriquecidos, persona injection |
| `src/shared/types/flow-api.ts` | **Modificar** | Enriquecer `FlowTaskProgress` con action log entries |
| `tests/persona-builder.test.ts` | **Crear** | Tests del persona builder |
| `tests/react-simulation.test.ts` | **Crear** | Tests del loop ReACT |

---

## Unidad 1: Perfiles de agente ricos (SimPersona)

### Objetivo
Generar un "perfil de personalidad simulado" del usuario antes de correr la simulación. Hoy el user-agent recibe un `buildCompactProfile()` genérico. Queremos un perfil rico tipo MiroFish: personalidad, tendencias, puntos débiles, estilo de reacción.

### 1.1 — Crear schema `SimPersona`

**Archivo:** `src/shared/schemas/persona-profile.ts`

```typescript
import { z } from 'zod'

export const simPersonaSchema = z.object({
  // Identidad derivada del intake
  name: z.string().trim().min(1).max(100),
  age: z.number().int().min(0).max(150),
  occupation: z.string().trim().max(200),

  // Personalidad sintetizada por LLM
  personalityType: z.enum([
    'disciplinado', 'flexible', 'procrastinador',
    'perfeccionista', 'impulsivo', 'constante'
  ]),
  energyPattern: z.enum(['matutino', 'vespertino', 'neutro']),
  stressResponse: z.enum([
    'evita', 'enfrenta', 'posterga', 'se_paraliza', 'busca_ayuda'
  ]),
  motivationStyle: z.enum([
    'intrínseca', 'extrínseca', 'social', 'por_deadline'
  ]),

  // Tendencias de comportamiento (texto libre del LLM)
  strengths: z.array(z.string().trim().max(200)).min(1).max(5),
  weaknesses: z.array(z.string().trim().max(200)).min(1).max(5),
  likelyFailurePoints: z.array(z.string().trim().max(200)).max(5).default([]),

  // Contexto vital resumido
  dependents: z.number().int().min(0).default(0),
  healthConditions: z.array(z.string().trim().max(100)).default([]),
  weekdayFreeHours: z.number().min(0).max(24),
  weekendFreeHours: z.number().min(0).max(24),

  // Narrativa completa (como el "persona" de MiroFish)
  narrative: z.string().trim().min(10).max(1500),

  // Metadata
  generatedWith: z.enum(['llm', 'rules']),
  generatedAt: z.string().trim().min(1)
}).strict()

export type SimPersona = z.infer<typeof simPersonaSchema>
```

### 1.2 — Crear `persona-builder.ts`

**Archivo:** `src/lib/flow/agents/persona-builder.ts`

Este módulo toma el `Perfil` del intake y genera un `SimPersona`. Dos modos:
- **Con LLM:** prompt que sintetiza personalidad a partir de las respuestas del intake
- **Sin LLM (fallback):** mapeo determinista de campos del perfil

```
Input:  Perfil (de intake) + GoalDraft[]
Output: SimPersona
```

**Prompt del LLM (concepto):**
```
Sos un psicólogo conductual especializado en productividad personal.
Basándote en el perfil y las metas de esta persona, generá un perfil
de personalidad simulado que prediga cómo va a reaccionar a:
- Disrupciones inesperadas
- Momentos de baja motivación
- Presión de plazos
- Conflictos entre metas

Perfil del usuario:
{compact profile data}

Metas:
{goals data}

Respondé SOLO JSON válido con el schema SimPersona.
```

**Fallback sin LLM:**
```typescript
function buildPersonaFromRules(profile: Perfil, goals: GoalDraft[]): SimPersona {
  const p = profile.participantes[0]!
  return {
    name: p.datosPersonales.nombre,
    age: p.datosPersonales.edad,
    occupation: p.datosPersonales.narrativaPersonal || 'no especificada',
    personalityType: 'flexible', // default conservador
    energyPattern: p.patronesEnergia.cronotipo,
    stressResponse: 'enfrenta',
    motivationStyle: 'intrínseca',
    strengths: ['Tiene objetivos claros'],
    weaknesses: ['Horas disponibles limitadas'],
    likelyFailurePoints: [],
    dependents: p.dependientes.length,
    healthConditions: p.condicionesSalud.map(c => c.condicion),
    weekdayFreeHours: p.calendario.horasLibresEstimadas.diasLaborales,
    weekendFreeHours: p.calendario.horasLibresEstimadas.diasDescanso,
    narrative: `${p.datosPersonales.nombre}, ${p.datosPersonales.edad} años...`,
    generatedWith: 'rules',
    generatedAt: DateTime.utc().toISO()!
  }
}
```

### 1.3 — Inyectar SimPersona en el orchestrator

**Archivo:** `src/lib/flow/simulation-orchestrator.ts`

- Agregar `persona?: SimPersona` a `SimulationOrchestratorInput`
- Antes del loop de nodos, si no hay persona, generarla con `persona-builder`
- Pasar la persona a `runWorldAgent()` y `runUserAgent()`

### 1.4 — Guardar SimPersona en SimTree

**Archivo:** `src/shared/schemas/simulation-tree.ts`

Agregar al `simTreeSchema`:
```typescript
persona: simPersonaSchema.nullable().default(null)
```

### Validación U1
- [ ] `npm run typecheck` pasa
- [ ] `npm run test` — test de persona-builder genera un SimPersona válido tanto con LLM como con fallback
- [ ] El persona aparece en el SimTree guardado en DB

---

## Unidad 2: ReACT loop para simulación

### Objetivo
Que el user-agent no genere su respuesta en un solo shot, sino que siga un loop Reason-Act-Observe (como el ReportAgent de MiroFish). Cada iteración produce una `SimActionLogEntry` que se guarda en el nodo.

### 2.1 — Crear schema `SimActionLogEntry`

**Archivo:** `src/shared/schemas/simulation-tree.ts` (agregar)

```typescript
export const simActionLogEntrySchema = z.object({
  step: z.number().int().min(1),
  timestamp: z.string().trim().min(1),
  phase: z.enum(['reason', 'act', 'observe']),
  agentRole: z.enum(['mundo', 'yo', 'orchestrator']),
  content: z.string().trim().min(1).max(2000),
  toolUsed: z.string().trim().max(100).nullable().default(null),
  durationMs: z.number().int().min(0).default(0)
}).strict()

export type SimActionLogEntry = z.infer<typeof simActionLogEntrySchema>
```

Agregar a `simNodeSchema`:
```typescript
actionLog: z.array(simActionLogEntrySchema).default([])
```

### 2.2 — Refactorizar user-agent con ReACT

**Archivo:** `src/lib/flow/agents/user-agent.ts`

Cambio principal: en vez de un solo `runtime.chat()`, hacer hasta N iteraciones (max 3):

```
Iteración 1 — REASON:
  "¿Qué disrupciones tengo? ¿Cómo afectan mis metas según mi personalidad?"
  → Log: { phase: 'reason', content: thinking }

Iteración 2 — ACT:
  "Decido: absorber la primera, reprogramar la segunda..."
  → Log: { phase: 'act', content: decisions }

Iteración 3 — OBSERVE:
  "Después de aplicar mis decisiones, me quedan X horas, calidad Y%"
  → Log: { phase: 'observe', content: analysis }
```

El LLM recibe el historial de las iteraciones previas como mensajes adicionales.

**Formato de prompt multiturno:**
```typescript
const messages: LLMMessage[] = [
  { role: 'system', content: systemPromptWithPersona },
  { role: 'user', content: 'REASON: Analizá las disrupciones...' }
]

// Iteration 1: get reasoning
const reasoning = await runtime.chat(messages)
actionLog.push({ step: 1, phase: 'reason', content: reasoning.content, ... })

messages.push({ role: 'assistant', content: reasoning.content })
messages.push({ role: 'user', content: 'ACT: Ahora decidí respuestas concretas...' })

// Iteration 2: get actions
const actions = await runtime.chat(messages)
actionLog.push({ step: 2, phase: 'act', content: actions.content, ... })

messages.push({ role: 'assistant', content: actions.content })
messages.push({ role: 'user', content: 'OBSERVE: Calculá el resultado final en JSON...' })

// Iteration 3: get final structured output
const observation = await runtime.chat(messages)
actionLog.push({ step: 3, phase: 'observe', content: observation.content, ... })
```

La última iteración (OBSERVE) produce el JSON estructurado que ya existe (`UserAgentOutput`).

### 2.3 — Guardar actionLog en el nodo simulado

**Archivo:** `src/lib/flow/simulation-orchestrator.ts`

En `simulateOneNode()`, recoger el `actionLog` del user-agent y del world-agent, y guardarlo en el nodo:

```typescript
const simulatedNode: SimNode = {
  ...node,
  actionLog: [...worldActionLog, ...userActionLog],
  // ... resto igual
}
```

### 2.4 — Fallback sin LLM

Si no hay runtime (modo heurístico), generar un actionLog determinista mínimo:
```typescript
actionLog: [{
  step: 1, phase: 'observe', agentRole: 'yo',
  content: `Fallback: ${actualHours}h reales de ${node.plannedHours}h planificadas.`,
  toolUsed: null, durationMs: 0, timestamp: nowIso()
}]
```

### Validación U2
- [ ] `npm run typecheck` pasa
- [ ] `npm run test` — test de ReACT loop produce 3 entries de action log
- [ ] El action log aparece en los nodos del SimTree
- [ ] Fallback sin LLM produce 1 entry mínima

---

## Unidad 3: Progress callbacks enriquecidos

### Objetivo
Emitir progreso más granular durante la simulación, inspirado en el `progress_callback("stage", percent, "message", current=N, total=M)` de MiroFish.

### 3.1 — Enriquecer `FlowTaskProgress`

**Archivo:** `src/shared/types/flow-api.ts`

Agregar campos opcionales:
```typescript
export interface FlowTaskProgress {
  // ... campos existentes ...

  // Nuevos (inspirados en MiroFish)
  actionLogEntry?: SimActionLogEntry        // última entry del action log en vivo
  personaSnapshot?: {                       // durante generación de persona
    personalityType?: string
    narrative?: string
  }
  nodeLabel?: string                        // label del nodo siendo simulado
  reactPhase?: 'reason' | 'act' | 'observe' // fase actual del ReACT loop
}
```

### 3.2 — Emitir progreso desde el ReACT loop

**Archivo:** `src/lib/flow/agents/user-agent.ts`

El `runUserAgent()` ahora acepta un callback `onProgress` opcional:

```typescript
export interface UserAgentInput {
  // ... campos existentes ...
  persona?: SimPersona
  onProgress?: (progress: Partial<FlowTaskProgress>) => void
}
```

Cada iteración del ReACT emite:
```typescript
onProgress?.({
  reactPhase: 'reason',
  message: 'Analizando disrupciones...',
  actionLogEntry: lastEntry
})
```

### 3.3 — Propagar progreso en el orchestrator

**Archivo:** `src/lib/flow/simulation-orchestrator.ts`

Pasar un `onProgress` wrapeado a cada agente:
```typescript
const userProgress = (partial: Partial<FlowTaskProgress>) => {
  onProgress({
    workflowId,
    step: 'simulation-tree',
    stage: partial.reactPhase ?? 'user-agent',
    current: batchIndex + 1,
    total: targetNodeIds.length,
    message: partial.message ?? '',
    agentRole: 'yo',
    nodeLabel: node.label,
    ...partial
  })
}
```

### 3.4 — El frontend consume los nuevos campos

> **Nota:** Esta unidad NO incluye cambios de UI. Solo asegura que los datos estén disponibles en el SSE stream. La UI se implementa en un plan separado.

### Validación U3
- [ ] `npm run typecheck` pasa
- [ ] `npm run build` pasa (toca API routes y shared types)
- [ ] Los eventos SSE emitidos durante `simulate` incluyen `reactPhase` y `nodeLabel`
- [ ] El SimTree final tiene `actionLog` poblado en los nodos simulados

---

## Orden de ejecución

```
U1 (SimPersona) → U2 (ReACT loop) → U3 (Progress callbacks)
```

U2 depende de U1 porque el ReACT loop usa el SimPersona en el prompt.
U3 depende de U2 porque emite las action log entries por SSE.

## Estimación

| Unidad | Esfuerzo | Riesgo |
|--------|----------|--------|
| U1: SimPersona | ~3h | Bajo — solo schema + builder + inyección |
| U2: ReACT loop | ~5h | Medio — refactor del user-agent, hay que manejar timeouts/errores en multiturno |
| U3: Progress callbacks | ~2h | Bajo — agregar campos y emitir |
| **Total** | **~10h** | |

## Dependencias nuevas

**Ninguna.** Todo se implementa con el stack actual: Zod, Luxon, OpenAI SDK (ya existente).

## Reglas aplicables

- ✅ Zod `.strict()` en schemas nuevos
- ✅ No hardcodear strings de UI (los mensajes de progreso ya vienen del backend)
- ✅ Luxon para timestamps
- ✅ Fallback sin LLM para todos los paths
- ✅ `npm run build` al final (toca `api/`, `src/lib/`, schemas compartidos)
