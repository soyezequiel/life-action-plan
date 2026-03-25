# Plan: Exportación completa del flujo de simulación

> **plan-id:** `sim-export-v1`
> **Autor:** Antigravity
> **Fecha:** 2026-03-23

Lee `AGENTS.md` antes de empezar.

---

## Objetivo

Permitir exportar **todo el flujo de simulación jerárquica** como un bundle JSON autocontenido, para análisis externo con herramientas como Excel, notebooks, Jupyter, Mermaid, Neo4j u obsidian.

El bundle debe ser descargable desde la UI y desde la API, y debe contener suficiente contexto para que alguien sin acceso a LAP pueda reconstruir y entender cada decisión del sistema.

---

## Qué se exporta

El bundle JSON tiene esta estructura raíz:

```jsonc
{
  "version": "1.0",
  "exportedAt": "2026-03-23T18:00:00Z",
  "workflow": {
    "id": "...",
    "currentStep": "simulation",
    "status": "in_progress"
  },
  "profile": { /* Perfil completo del participante (sanitizado) */ },
  "persona": { /* SimPersona: personalidad simulada */ },
  "goals": [ /* GoalDraft[] con prioridades y horizontes */ ],
  "strategy": { /* StrategicPlanDraft: fases, milestones, conflictos */ },
  "realityCheck": { /* RealityCheckResult: horas, warnings */ },
  "simulationTree": {
    "meta": { /* id, version, totalSimulations, estimatedLlmCostSats */ },
    "globalFindings": [ /* SimFinding[] */ ],
    "nodes": {
      "plan-xxx": { /* SimNode completo con disruptions, responses, actionLog, goalBreakdown */ },
      "year-1": { /* ... */ },
      "month-1": { /* ... */ }
      // ... todos los nodos existentes del árbol
    },
    "edges": [
      // Array derivado de parentId para grafos: { source: "year-1", target: "month-1" }
    ]
  },
  "agentLogs": [
    // Todas las entradas de actionLog consolidadas, ordenadas cronológicamente
    {
      "nodeId": "month-1",
      "nodeLabel": "marzo 2026",
      "step": 1,
      "phase": "reason",
      "agentRole": "yo",
      "content": "Razonando sobre las disrupciones...",
      "durationMs": 1200,
      "timestamp": "2026-03-23T18:00:01Z"
    }
  ],
  "prompts": [
    // Los system prompts que se usarían para cada nodo simulado (reconstruidos)
    {
      "nodeId": "month-1",
      "agentRole": "mundo",
      "systemPrompt": "Sos el simulador de entorno de LAP...",
      "userPrompt": "Generá las disrupciones para el periodo..."
    }
  ],
  "timeline": [
    // Vista plana cronológica de todos los nodos con datos de simulación
    { "nodeId": "month-1", "label": "marzo 2026", "start": "2026-03-01", "end": "2026-04-01", "plannedHours": 43.5, "actualHours": 38.2, "quality": 82, "disruptionCount": 2 }
  ],
  "summary": {
    "totalNodes": 15,
    "simulatedNodes": 12,
    "totalFindings": 8,
    "criticalFindings": 1,
    "averageQuality": 78,
    "totalPlannedHours": 520,
    "totalActualHours": 445,
    "completionRatio": 0.856,
    "llmCallsUsed": 24,
    "estimatedCostSats": 150
  }
}
```

---

## Reglas

1. **i18n:** No hardcodear strings de UI. Las claves de export van bajo `simulation.tree.export.*` en `es-AR.json`.
2. **Sanitización:** El perfil exportado usa SOLO datos de `datosPersonales`, `patronesEnergia`, `calendario.horasLibresEstimadas`, y `patronesConocidos`. NO exportar datos sensibles como ubicación exacta, claves, walletId, o datos de salud detallados (solo condición general, sin `impactoFuncional`).
3. **Zod `.strict()`** para el schema de validación del export bundle.
4. **Luxon** para todas las fechas en el bundle (formato ISO 8601 UTC).
5. **Sin dependencia de DB:** El export se construye enteramente a partir de `FlowSession.state` + `SimTree` cargados en memoria. No hace queries adicionales.

---

## Grupo 1 — Schema del Export Bundle

### 1.1 Crear schema de exportación

**Archivo nuevo:** `src/shared/schemas/simulation-export.ts`

```ts
import { z } from 'zod'

export const simExportEdgeSchema = z.object({
  source: z.string().trim().min(1),
  target: z.string().trim().min(1)
}).strict()

export const simExportAgentLogSchema = z.object({
  nodeId: z.string().trim().min(1),
  nodeLabel: z.string().trim().min(1).max(100),
  step: z.number().int().min(1),
  phase: z.enum(['reason', 'act', 'observe']),
  agentRole: z.enum(['mundo', 'yo', 'orchestrator']),
  content: z.string().trim().min(1).max(2000),
  toolUsed: z.string().trim().max(100).nullable().default(null),
  durationMs: z.number().int().min(0),
  timestamp: z.string().trim().min(1)
}).strict()

export const simExportPromptSchema = z.object({
  nodeId: z.string().trim().min(1),
  agentRole: z.enum(['mundo', 'yo']),
  systemPrompt: z.string().trim().min(1),
  userPrompt: z.string().trim().min(1)
}).strict()

export const simExportTimelineEntrySchema = z.object({
  nodeId: z.string().trim().min(1),
  label: z.string().trim().min(1).max(100),
  granularity: z.string().trim().min(1),
  start: z.string().trim().min(1),
  end: z.string().trim().min(1),
  plannedHours: z.number().min(0),
  actualHours: z.number().min(0).nullable().default(null),
  quality: z.number().min(0).max(100).nullable().default(null),
  disruptionCount: z.number().int().min(0).default(0),
  status: z.string().trim().min(1)
}).strict()

export const simExportSummarySchema = z.object({
  totalNodes: z.number().int().min(0),
  simulatedNodes: z.number().int().min(0),
  totalFindings: z.number().int().min(0),
  criticalFindings: z.number().int().min(0),
  averageQuality: z.number().min(0).max(100).nullable(),
  totalPlannedHours: z.number().min(0),
  totalActualHours: z.number().min(0),
  completionRatio: z.number().min(0).max(1),
  llmCallsUsed: z.number().int().min(0),
  estimatedCostSats: z.number().int().min(0)
}).strict()

export const simExportBundleSchema = z.object({
  version: z.literal('1.0'),
  exportedAt: z.string().trim().min(1),
  workflow: z.object({
    id: z.string().trim().min(1),
    currentStep: z.string().trim().min(1),
    status: z.string().trim().min(1)
  }).strict(),
  profile: z.record(z.string(), z.unknown()).nullable().default(null),
  persona: z.record(z.string(), z.unknown()).nullable().default(null),
  goals: z.array(z.record(z.string(), z.unknown())).default([]),
  strategy: z.record(z.string(), z.unknown()).nullable().default(null),
  realityCheck: z.record(z.string(), z.unknown()).nullable().default(null),
  simulationTree: z.object({
    meta: z.object({
      id: z.string().trim().min(1),
      version: z.number().int().min(1),
      totalSimulations: z.number().int().min(0),
      estimatedLlmCostSats: z.number().int().min(0),
      createdAt: z.string().trim().min(1),
      updatedAt: z.string().trim().min(1)
    }).strict(),
    globalFindings: z.array(z.record(z.string(), z.unknown())).default([]),
    nodes: z.record(z.string(), z.record(z.string(), z.unknown())),
    edges: z.array(simExportEdgeSchema).default([])
  }).strict(),
  agentLogs: z.array(simExportAgentLogSchema).default([]),
  prompts: z.array(simExportPromptSchema).default([]),
  timeline: z.array(simExportTimelineEntrySchema).default([]),
  summary: simExportSummarySchema
}).strict()

export type SimExportBundle = z.infer<typeof simExportBundleSchema>
```

**Test:** `tests/simulation-export-schema.test.ts`
- Bundle con todos los campos parsea
- `.strict()` rechaza campos extra
- Bundle mínimo (sin nodos simulados) parsea
- `version` solo acepta `'1.0'`

---

## Grupo 2 — Builder del Export Bundle

### 2.1 Crear el builder

**Archivo nuevo:** `src/lib/flow/simulation-export-builder.ts`

```ts
import { DateTime } from 'luxon'
import type { FlowSession } from '../../shared/schemas/flow'
import type { SimTree } from '../../shared/schemas/simulation-tree'
import type { SimExportBundle } from '../../shared/schemas/simulation-export'

export interface SimExportInput {
  session: FlowSession
  tree: SimTree
}

export function buildSimulationExportBundle(input: SimExportInput): SimExportBundle
```

**Lógica:**

1. **Sanitizar perfil:** Reconstruir un perfil reducido que incluya solamente:
   - `datosPersonales`: nombre, edad, narrativaPersonal (ocupación)
   - `patronesEnergia`: cronotipo
   - `horasLibresEstimadas`
   - `patronesConocidos.tendencias`
   - Nada de ubicación exacta, condiciones detalladas de salud, claves

2. **Extraer edges:** Recorrer `tree.nodes`, generar `{ source: node.parentId, target: node.id }` para cada nodo con parentId.

3. **Consolidar agentLogs:** Recorrer todos los nodos, extraer `actionLog[]`, agregar `nodeId` y `nodeLabel` a cada entry, ordenar por `timestamp`.

4. **Reconstruir prompts:** Para cada nodo con `simulatedWith === 'dual-agent'`, llamar a funciones puras de building de prompt (extraídas como helpers de `world-agent.ts` y `user-agent.ts`) para reconstruir el system prompt y user prompt que se usaron. Esto evita almacenar prompts en la DB.

5. **Generar timeline:** Vista plana de todos los nodos ordenados por `period.start`, con métricas clave.

6. **Calcular summary:** Agregar métricas globales.

**Test:** `tests/simulation-export-builder.test.ts`
- Bundle generado desde session + tree mock tiene todos los campos
- Profile sanitizado NO incluye ubicación ni condiciones de salud detalladas
- Edges derivados correctamente de parentId
- Agent logs ordenados cronológicamente
- Timeline ordenada por período
- Summary tiene ratios correctos

---

## Grupo 3 — API Route

### 3.1 Crear endpoint de exportación

**Archivo nuevo:** `app/api/flow/session/[workflowId]/export-simulation/route.ts`

**Método:** `GET`

**Lógica:**
1. Cargar session con `getOrCreateWorkflowSession(workflowId)`
2. Verificar que `session.state.simulationTreeId` exista → sino, error `FLOW_SIMULATION_TREE_REQUIRED`
3. Cargar tree con `getSimulationTree(workflowId)`
4. Llamar `buildSimulationExportBundle({ session, tree })`
5. Responder JSON con headers de descarga:
   ```ts
   return new Response(JSON.stringify(bundle, null, 2), {
     status: 200,
     headers: {
       'Content-Type': 'application/json; charset=utf-8',
       'Content-Disposition': `attachment; filename="lap-simulation-${workflowId}-${DateTime.utc().toFormat('yyyyMMdd-HHmmss')}.json"`,
       'Cache-Control': 'no-store'
     }
   })
   ```

**Formato alternativo CSV (opcional):**
Agregar query param `?format=csv` que exporta solo la timeline como CSV:
```
nodeId,label,granularity,start,end,plannedHours,actualHours,quality,disruptionCount,status
month-1,marzo 2026,month,2026-03-01,2026-04-01,43.5,38.2,82,2,simulated
```

**Test:** `tests/simulation-export-route.test.ts`
- GET con tree existente → 200 con JSON válido
- GET con `?format=csv` → 200 con CSV
- GET sin simulation tree → error FLOW_SIMULATION_TREE_REQUIRED
- GET con workflow inexistente → 404
- Content-Disposition tiene el filename correcto

---

## Grupo 4 — flow-client

### 4.1 Agregar método al client

**Archivo:** `src/lib/client/flow-client.ts`

```ts
exportSimulation(workflowId: string, format?: 'json' | 'csv'): Promise<Blob>
```

Descarga el blob y dispara `URL.createObjectURL()` + click simulado para que el browser descargue el archivo.

---

## Grupo 5 — i18n

### 5.1 Claves de i18n

**Archivo:** `src/i18n/locales/es-AR.json`

Agregar bajo `simulation.tree`:

```json
{
  "export": {
    "button": "Exportar simulación",
    "downloading": "Preparando la exportación...",
    "success": "Exportación lista. Se descargó el archivo.",
    "error": "No pude preparar la exportación. Intentá de nuevo.",
    "no_tree": "Primero necesitás correr una simulación para exportar.",
    "format_json": "Completo (JSON)",
    "format_csv": "Resumen (CSV)"
  }
}
```

---

## Grupo 6 — Tests

### 6.1 Test de schema

**Archivo:** `tests/simulation-export-schema.test.ts`

### 6.2 Test de builder

**Archivo:** `tests/simulation-export-builder.test.ts`

### 6.3 Test de ruta API

**Archivo:** `tests/simulation-export-route.test.ts`

---

## Orden de ejecución

1. **Grupo 1:** Schema del export bundle. Correr `npm test`.
2. **Grupo 2:** Builder del bundle. Correr `npm test`.
3. **Grupo 3:** API Route. Correr `npm test`.
4. **Grupo 4:** flow-client. Correr `npm test`.
5. **Grupo 5:** i18n. Correr `npm test`.
6. **Grupo 6:** Tests de integración. Correr `npm test`.
7. **Final:** `npm run build` para verificar compilación.

---

## Uso externo esperado

El JSON exportado permite:

| Herramienta | Qué se importa | Para qué |
|---|---|---|
| **Excel / Google Sheets** | `timeline` (o CSV) | Ver calidad y cumplimiento por período |
| **Jupyter / Colab** | Bundle completo | Análisis estadístico de disruptions vs quality |
| **Neo4j** | `nodes` + `edges` | Visualizar árbol como grafo, trazar propagación |
| **Mermaid / d2** | `nodes` + `edges` | Diagramas de arquitectura del plan |
| **Obsidian** | `agentLogs` | Leer razonamiento del agente paso a paso |
| **Diff tools** | Dos bundles JSON | Comparar before/after de correcciones |

---

## Estimación

- **Código nuevo:** ~300 líneas (schema + builder + route + client)
- **Tests:** ~100 líneas
- **Riesgo:** bajo (no toca lógica existente, solo lee datos)
