# Plan: Contratos de Entrada/Salida por Fase del Pipeline

> **Objetivo**: Cada fase del pipeline tiene contratos tipados de input/output. Tanto la terminal como el visualizador muestran ambos.
> **Agente implementador**: Gemini 3 Flash (o cualquier agente disponible)

## Problema actual

Hoy el `FlowRunner` tiene fases con tipos `Promise<any>` donde:
- No hay tipos explícitos para la **entrada** de cada fase
- Los resultados se guardan dispersos en `PipelineContext` (`context.profileId`, `context.enrichment`, `context.results.build`, etc.)
- El logger de terminal solo loguea el nombre de la fase, no qué recibe ni qué produce
- El visualizador muestra solo datos sueltos por fase pero no hay separación visual input/output
- El mapper `mapContextToRuntimeData` es un blob monolítico que sabe cómo extraer cada dato

## Solución

### Concepto central: `PhaseIO<I, O>`

Cada fase define un tipo `PhaseInput` y un tipo `PhaseOutput`. El runner ejecuta la fase y guarda ambos. El tracker los recibe. El visualizador y la terminal los muestran.

```typescript
interface PhaseIO<I, O> {
  input: I
  output: O
  startedAt: string   // ISO timestamp
  finishedAt: string   // ISO timestamp
  durationMs: number
}
```

## Arquitectura de archivos

```
src/lib/pipeline/
  contracts.ts          ← YA EXISTE — se refactoriza con los nuevos PhaseIO types
  phase-io.ts           ← NUEVO — define PhaseInput/PhaseOutput por cada fase
  runner.ts             ← YA EXISTE — se refactoriza para almacenar PhaseIO en context
  readiness-gate.ts     ← no cambia

src/lib/flow/
  pipeline-runtime-data.ts  ← se simplifica: el mapper ahora lee context.phaseIO directamente
  runner-logger.ts           ← se amplía: loguea input resumen + output resumen por fase

components/debug/
  FlowStepNode.tsx      ← se agrega tabs "Entrada" / "Salida" en el nodo
  FlowDetailModal.tsx   ← se refactoriza con tabs "Entrada" / "Salida"
```

## Pasos de implementación

---

### Paso 1: Crear `phase-io.ts` con tipos de entrada y salida por fase

**Archivo nuevo**: `src/lib/pipeline/phase-io.ts`

```typescript
// ─── Phase I/O Contracts ──────────────────────────────────────────────────────
// Cada fase del pipeline tiene un tipo explícito de entrada y salida.
// El runner los usa para guardar PhaseIO<I, O> en el contexto.

import type { Perfil } from '../../shared/schemas/perfil'
import type { PlanEvent, PlanSimulationSnapshot, SimulationFinding } from '../../shared/types/lap-api'
import type { EnrichmentInference } from '../skills/profile-enricher'

// ─── Generic wrapper ──────────────────────────────────────────────────────────

export interface PhaseIO<I = unknown, O = unknown> {
  input: I
  output: O
  /** Descripción en español de qué hace esta fase internamente */
  processing: string
  startedAt: string
  finishedAt: string
  durationMs: number
}

// ─── 1. Intake ────────────────────────────────────────────────────────────────

export interface IntakeInput {
  nombre: string
  edad: number
  ubicacion: string
  ocupacion: string
  objetivo: string
}

export interface IntakeOutput {
  profileId: string
  nombre: string
  edad: number
  ciudad: string
  objetivo: string
}

// ─── 2. Enrich ────────────────────────────────────────────────────────────────

export interface EnrichInput {
  profileId: string
  provider: string
}

export interface EnrichOutput {
  enrichedProfileId: string
  inferences: EnrichmentInference[]
  warnings: string[]
  tokensUsed: { input: number; output: number }
}

// ─── 3. Readiness ─────────────────────────────────────────────────────────────

export interface ReadinessInput {
  profileId: string
  objectiveCount: number
  freeHoursWeekday: number
  freeHoursWeekend: number
}

export interface ReadinessOutput {
  ready: boolean
  errors: string[]
  warnings: string[]
  constraints: string[]
}

// ─── 4. Build ─────────────────────────────────────────────────────────────────

export interface BuildInput {
  profileId: string
  provider: string
  constraints: string[]
  previousFindings?: SimulationFinding[]
}

export interface BuildOutput {
  planId: string
  nombre: string
  resumen: string
  eventCount: number
  eventos: PlanEvent[]
  tokensUsed: { input: number; output: number }
  fallbackUsed: boolean
}

// ─── 5. Simulate ──────────────────────────────────────────────────────────────

export interface SimulateInput {
  planId: string
  mode: 'interactive' | 'automatic'
}

export interface SimulateOutput {
  qualityScore: number
  overallStatus: string
  pass: number
  warn: number
  fail: number
  findings: Array<{ status: string; code: string; params?: Record<string, string | number> }>
}

// ─── 6. Repair ────────────────────────────────────────────────────────────────

export interface RepairInput {
  planId: string
  profileId: string
  attempt: number
  maxAttempts: number
  failingFindings: SimulationFinding[]
  currentEventCount: number
}

export interface RepairOutput {
  newPlanId: string
  repairedEventCount: number
  repairNotes: string
  tokensUsed: { input: number; output: number }
}

// ─── 7. Output ────────────────────────────────────────────────────────────────

export interface OutputInput {
  profileId: string
  planId: string
  deliveryMode: string
  finalQualityScore: number
  repairAttempts: number
}

export interface OutputOutput {
  deliveryMode: string
  finalQualityScore: number
  unresolvableFindings: SimulationFinding[]
  honestWarning?: string
}

// ─── Registry type for context ────────────────────────────────────────────────

export interface PhaseIORegistry {
  intake?: PhaseIO<IntakeInput, IntakeOutput>
  enrich?: PhaseIO<EnrichInput, EnrichOutput>
  readiness?: PhaseIO<ReadinessInput, ReadinessOutput>
  build?: PhaseIO<BuildInput, BuildOutput>
  simulate?: PhaseIO<SimulateInput, SimulateOutput>
  repair?: PhaseIO<RepairInput, RepairOutput>
  output?: PhaseIO<OutputInput, OutputOutput>
}
```

---

### Paso 2: Agregar `phaseIO` al `PipelineContext`

**Archivo**: `src/lib/pipeline/contracts.ts`

```diff
+import type { PhaseIORegistry } from './phase-io'

 export interface PipelineContext {
   profileId?: string
   planId?: string
   config: RunnerConfig
   intakeSummary?: { ... }
+  phaseIO: PhaseIORegistry
   results: {
```

Inicializar en el constructor del `FlowRunner` (`runner.ts`):

```diff
   this.context = {
     config,
     results: {},
+    phaseIO: {},
     ...initialState
   }
```

---

### Paso 3: Refactorizar `FlowRunner._runIntakePhase()` para guardar PhaseIO

**Archivo**: `src/lib/pipeline/runner.ts`

Agregar import al inicio del archivo (línea ~12):

```typescript
import type { IntakeInput, IntakeOutput, EnrichInput, EnrichOutput, ReadinessInput, ReadinessOutput, BuildInput, BuildOutput, SimulateInput, SimulateOutput, RepairInput, RepairOutput, OutputInput, OutputOutput } from './phase-io'
```

Reemplazar `_runIntakePhase()` completo (actualmente en línea ~209-235):

```typescript
private async _runIntakePhase(): Promise<any> {
  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  // 1. Construir input tipado
  const cfg = this.context.config.intake
  const phaseInput: IntakeInput = {
    nombre: cfg.nombre,
    edad: cfg.edad,
    ubicacion: cfg.ubicacion,
    ocupacion: cfg.ocupacion,
    objetivo: cfg.objetivo,
  }

  // 2. Ejecutar lógica existente
  const result = await processIntake(cfg)
  this.context.profileId = result.profileId
  this.context.results.intake = result

  // 3. Extraer profile summary para el visualizador
  try {
    const profileRow = await getProfile(result.profileId)
    if (profileRow) {
      const profile = parseStoredProfile(profileRow.data)
      if (profile) {
        const p = profile.participantes[0]
        this.context.intakeSummary = {
          nombre: p?.datosPersonales?.nombre ?? '',
          edad: p?.datosPersonales?.edad ?? 0,
          ciudad: p?.datosPersonales?.ubicacion?.ciudad ?? '',
          objetivo: profile.objetivos[0]?.descripcion ?? ''
        }
      }
    }
  } catch {
    // Non-fatal: intake summary is optional for the visualizer
  }

  // 4. Construir output tipado
  const phaseOutput: IntakeOutput = {
    profileId: result.profileId,
    nombre: this.context.intakeSummary?.nombre ?? '',
    edad: this.context.intakeSummary?.edad ?? 0,
    ciudad: this.context.intakeSummary?.ciudad ?? '',
    objetivo: this.context.intakeSummary?.objetivo ?? '',
  }

  // 5. Guardar PhaseIO
  this.context.phaseIO.intake = {
    input: phaseInput,
    output: phaseOutput,
    processing: 'Convierte los datos crudos del formulario en un perfil estructurado (Perfil) con participantes, objetivos y calendario. Lo persiste en PostgreSQL.',
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
  }

  return result
}
```

Descripciones de processing para cada fase (agregar al guardar el PhaseIO):

| Fase | `processing` |
|------|------|
| `intake` | `'Convierte los datos crudos del formulario en un perfil estructurado (Perfil) con participantes, objetivos y calendario. Lo persiste en PostgreSQL.'` |
| `enrich` | `'Envía el perfil base al LLM para inferir campos faltantes (horarios, preferencias, obstáculos). Guarda el perfil enriquecido como nueva versión en DB.'` |
| `readiness` | `'Valida que el perfil tenga los datos mínimos para generar un plan viable: objetivos definidos, horas libres positivas, horarios coherentes y carga factible.'` |
| `build` | `'Genera el plan semanal de actividades usando el LLM. Produce eventos con día, hora, duración y categoría. Guarda el plan en DB y siembra el progreso inicial.'` |
| `simulate` | `'Ejecuta una simulación determinística del plan: verifica horarios, colisiones con trabajo, carga diaria, energía y cobertura de objetivos. Produce un puntaje 0-100.'` |
| `repair` | `'Envía los hallazgos fallidos al agente reparador LLM para que corrija los eventos problemáticos. Genera una nueva versión del plan con los eventos reparados.'` |
| `output` | `'Evalúa la calidad final del plan y decide el modo de entrega: aprobado, aceptable con avisos o mejor esfuerzo. Ensambla el resultado final del pipeline.'` |
```

Aplicar el **mismo patrón** a las 7 fases:
- `_runEnrichPhase()` → `PhaseIO<EnrichInput, EnrichOutput>`
- `_runReadinessPhase()` → `PhaseIO<ReadinessInput, ReadinessOutput>`
- `_runBuildPhase()` → `PhaseIO<BuildInput, BuildOutput>`
- `_runSimulatePhase()` → `PhaseIO<SimulateInput, SimulateOutput>`
- `_runRepairPhase()` → `PhaseIO<RepairInput, RepairOutput>`
- `_assembleOutput()` → `PhaseIO<OutputInput, OutputOutput>`

Para cada fase, los valores de input se construyen con lo que la fase **recibe** del contexto antes de ejecutar, y los valores de output con lo que la fase **produce** después de ejecutar.

Detalle por fase:

#### `_runEnrichPhase` input/output

```typescript
const phaseInput: EnrichInput = {
  profileId: this.context.profileId!,
  provider: buildCfg.provider ?? 'openai:gpt-4o-mini',
}
// ...after enrichment...
const phaseOutput: EnrichOutput = {
  enrichedProfileId: enrichedProfileId,
  inferences: enrichResult.inferences,
  warnings: enrichResult.warnings,
  tokensUsed: enrichResult.tokensUsed,
}
```

#### `_runReadinessPhase` input/output

```typescript
const phaseInput: ReadinessInput = {
  profileId: this.context.profileId!,
  objectiveCount: profile.objetivos.length,
  freeHoursWeekday: profile.participantes[0]?.calendario?.horasLibresEstimadas?.diasLaborales ?? 0,
  freeHoursWeekend: profile.participantes[0]?.calendario?.horasLibresEstimadas?.diasDescanso ?? 0,
}
const phaseOutput: ReadinessOutput = {
  ready: gateResult.ready,
  errors: gateResult.errors,
  warnings: gateResult.warnings,
  constraints: gateResult.constraints,
}
```

#### `_runBuildPhase` input/output

```typescript
const phaseInput: BuildInput = {
  profileId: this.context.profileId!,
  provider: this.context.config.build.provider ?? 'auto',
  constraints: constraints ?? [],
  previousFindings: lastFindings,
}
const phaseOutput: BuildOutput = {
  planId: result.planId,
  nombre: result.nombre,
  resumen: result.resumen,
  eventCount: result.eventos?.length ?? 0,
  eventos: result.eventos ?? [],
  tokensUsed: result.tokensUsed,
  fallbackUsed: result.fallbackUsed,
}
```

#### `_runSimulatePhase` input/output

```typescript
const phaseInput: SimulateInput = {
  planId: this.context.planId!,
  mode: this.context.config.simulate.mode ?? 'automatic',
}
const sim = result.simulation
const phaseOutput: SimulateOutput = {
  qualityScore: sim.qualityScore ?? 0,
  overallStatus: sim.summary.overallStatus,
  pass: sim.summary.pass,
  warn: sim.summary.warn,
  fail: sim.summary.fail,
  findings: sim.findings.map(f => ({ status: f.status, code: f.code, params: f.params })),
}
```

#### `_runRepairPhase` input/output

```typescript
const phaseInput: RepairInput = {
  planId: this.context.planId!,
  profileId: this.context.profileId!,
  attempt: repairAttempt,
  maxAttempts: this.context.config.pipeline?.maxRepairAttempts ?? 3,
  failingFindings: failingFindings,
  currentEventCount: currentEvents.length,
}
const phaseOutput: RepairOutput = {
  newPlanId: newPlanId,
  repairedEventCount: repairResult.repairedEvents.length,
  repairNotes: repairResult.repairNotes,
  tokensUsed: repairResult.tokensUsed,
}
```

#### `_assembleOutput` input/output

```typescript
const phaseInput: OutputInput = {
  profileId: this.context.profileId ?? '',
  planId: this.context.planId ?? '',
  deliveryMode: this.context.output?.deliveryMode ?? 'best-effort',
  finalQualityScore: this.context.output?.finalQualityScore ?? 0,
  repairAttempts: this.context.repair?.attempts ?? 0,
}
// ...después de armar base...
const phaseOutput: OutputOutput = {
  deliveryMode,
  finalQualityScore: this.context.output?.finalQualityScore ?? 0,
  unresolvableFindings: base.meta?.unresolvableFindings ?? [],
  honestWarning: base.meta?.honestWarning,
}
```

---

### Paso 4: Actualizar tracker para recibir input/output tipados

**Archivo**: `src/lib/pipeline/contracts.ts`

Agregar import al inicio (línea 1):

```typescript
import type { PhaseIO } from './phase-io'
```

Reemplazar la interfaz `PipelineStepTracker` (actualmente línea 54-61):

```typescript
export interface PipelineStepTracker {
  onPhaseStart?: (phase: PipelinePhase, input?: unknown) => void
  onPhaseSuccess?: (phase: PipelinePhase, result: any, io?: PhaseIO) => void
  onPhaseFailure?: (phase: PipelinePhase, error: Error) => void
  onPhaseSkipped?: (phase: PipelinePhase) => void
  onProgress?: (phase: PipelinePhase, progress: any) => void
  onRepairAttempt?: (attempt: number, maxAttempts: number, findings: SimulationFinding[]) => void
}
```

Y en `runner.ts`, reemplazar `executePhase()` (actualmente línea ~40-86):

```typescript
async executePhase(phase: PipelinePhase, tracker: PipelineStepTracker = {}): Promise<any> {
  tracker.onPhaseStart?.(phase)

  try {
    let result: any

    switch (phase) {
      case 'intake':
        result = await this._runIntakePhase()
        break
      case 'enrich':
        result = await this._runEnrichPhase(tracker)
        break
      case 'readiness':
        result = await this._runReadinessPhase()
        break
      case 'build':
        result = await this._runBuildPhase(tracker)
        break
      case 'simulate':
        result = await this._runSimulatePhase(tracker)
        break
      case 'repair':
        result = await this._runRepairPhase(tracker)
        break
      case 'output':
        result = this._assembleOutput()
        break
      default:
        throw new Error(`UNSUPPORTED_PHASE:${phase}`)
    }

    // Notify tracker with IO data
    const io = this.context.phaseIO[phase]
    tracker.onPhaseSuccess?.(phase, result, io)
    return result
  } catch (error) {
    const finalError = error instanceof Error ? error : new Error(String(error))
    tracker.onPhaseFailure?.(phase, finalError)
    throw finalError
  }
}
```

---

### Paso 5: Ampliar `runner-logger.ts` para loguear input/output

**Archivo**: `src/lib/flow/runner-logger.ts`

Agregar función que resuma input/output en terminal:

```typescript
import type { PhaseIO } from '../pipeline/phase-io'

export function logPhaseIO(phaseId: string, io: PhaseIO | undefined) {
  if (!io) return

  const input = io.input as Record<string, unknown>
  const output = io.output as Record<string, unknown>

  // Descripción de qué hace la fase
  if (io.processing) {
    console.error(`[LAP Runner]   🔄 ${io.processing}`)
  }

  // Resumen compacto del input (solo keys con valor)
  const inputKeys = Object.entries(input)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.length}]`
      if (typeof v === 'object') return `${k}: {...}`
      return `${k}: ${String(v).slice(0, 40)}`
    })
    .join(', ')

  const outputKeys = Object.entries(output)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.length}]`
      if (typeof v === 'object') return `${k}: {...}`
      return `${k}: ${String(v).slice(0, 40)}`
    })
    .join(', ')

  console.error(`[LAP Runner]   📥 IN:  ${inputKeys}`)
  console.error(`[LAP Runner]   📤 OUT: ${outputKeys}`)
  console.error(`[LAP Runner]   ⏱ ${io.durationMs}ms`)
}
```

Y en `lap-runner.ts`, dentro de `onPhaseSuccess`:

```diff
+import { logPhaseIO } from '../src/lib/flow/runner-logger'

 onPhaseSuccess: (p, _result, io) => {
     phaseStatuses[p] = 'success'
+    logPhaseIO(p, io)
     persistContext(runner, phaseStatuses)
 },
```

---

### Paso 6: Simplificar `pipeline-runtime-data.ts`

**Archivo**: `src/lib/flow/pipeline-runtime-data.ts`

Ahora el `PipelineRuntimeData` incluye el shape de PhaseIO serializado:

```diff
 export interface PipelineRuntimeData {
   updatedAt: string
   phaseStatuses: Record<string, PhaseStatus>
-  intake?: { ... }
-  enrich?: { ... }
-  ...
+  // v3: datos estructurados por fase con input/output explícito
+  phases: Record<string, {
+    input: Record<string, unknown>
+    output: Record<string, unknown>
+    startedAt: string
+    finishedAt: string
+    durationMs: number
+  }>
+  // v2 legacy: mantener mientras el viewer migra (DEPRECAR luego)
+  intake?: { ... }   // mantener
+  enrich?: { ... }   // mantener
+  ...                 // mantener
 }
```

En el mapper, agregar un bloque genérico:

```typescript
  // v3: PhaseIO data
  data.phases = {}
  for (const [phase, io] of Object.entries(context.phaseIO)) {
    if (io) {
      data.phases[phase] = {
        input: io.input as Record<string, unknown>,
        output: io.output as Record<string, unknown>,
        processing: io.processing,
        startedAt: io.startedAt,
        finishedAt: io.finishedAt,
        durationMs: io.durationMs,
      }
    }
  }
```

> **NOTA**: Mantener el bloque legacy para no romper el viewer actual. Podremos eliminarlo una vez que el Paso 7 esté completo.

---

### Paso 7: Refactorizar `FlowDetailModal.tsx` con tabs Entrada/Salida

**Archivo**: `components/debug/FlowDetailModal.tsx`

Cambiar la UI de los modales de cada fase para mostrar tres tabs: **Entrada**, **Procesamiento** y **Salida**.

#### 7a. Crear un componente genérico `IOTabs`:

```tsx
function IOTabs({ input, output, processing, durationMs }: {
  input: Record<string, unknown>
  output: Record<string, unknown>
  processing?: string
  durationMs?: number
}) {
  const [activeTab, setActiveTab] = React.useState<'input' | 'processing' | 'output'>('output')

  return (
    <>
      <div className="io-tabs-bar">
        <button
          className={`io-tab ${activeTab === 'input' ? 'io-tab--active' : ''}`}
          onClick={() => setActiveTab('input')}
        >
          📥 {t('debug.flow.tab_input')}
        </button>
        <button
          className={`io-tab ${activeTab === 'processing' ? 'io-tab--active' : ''}`}
          onClick={() => setActiveTab('processing')}
        >
          🔄 {t('debug.flow.tab_processing')}
        </button>
        <button
          className={`io-tab ${activeTab === 'output' ? 'io-tab--active' : ''}`}
          onClick={() => setActiveTab('output')}
        >
          📤 {t('debug.flow.tab_output')}
        </button>
        {durationMs !== undefined && (
          <span className="io-duration">⏱ {durationMs}ms</span>
        )}
      </div>
      <div className="io-tab-content">
        {activeTab === 'processing' ? (
          <p className="processing-description">{processing ?? '—'}</p>
        ) : (
          <DataRenderer data={activeTab === 'input' ? input : output} />
        )}
      </div>
    </>
  )
```

#### 7b. Crear un `DataRenderer` genérico

Renderiza cualquier `Record<string, unknown>` con formato limpio: cada key es un label y cada valor se renderiza según su tipo (string, number, array, object).

```tsx
function DataRenderer({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="data-renderer">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="data-row">
          <span className="data-key">{t(`debug.flow.field_${key}`) || key}</span>
          <div className="data-value">{renderValue(value)}</div>
        </div>
      ))}
    </div>
  )
}

function renderValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return <span className="data-null">—</span>
  if (typeof value === 'boolean') return <span className={value ? 'data-bool-true' : 'data-bool-false'}>{value ? '✓' : '✗'}</span>
  if (typeof value === 'number') return <span className="data-number">{value.toLocaleString()}</span>
  if (typeof value === 'string') return <span className="data-string">{value}</span>
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="data-null">[]</span>
    return <span className="data-array">[{value.length} elementos]</span>
  }
  return <pre className="data-object">{JSON.stringify(value, null, 2)}</pre>
}
```

#### 7c. Actualizar `renderContent()` del modal

Reemplazar la función `renderContent()` dentro de `FlowDetailModal` (actualmente línea ~324) con:

```tsx
function renderContent() {
  // v3: si hay datos PhaseIO, usar tabs genéricos
  const phaseData = (runtimeData as any)?.phases?.[resolvedPhase]
  if (phaseData) {
    return <IOTabs input={phaseData.input} output={phaseData.output} processing={phaseData.processing} durationMs={phaseData.durationMs} />
  }
  // v2 Legacy fallback: renderers específicos por fase
  switch (resolvedPhase) {
    case 'intake': return <IntakeDetail data={runtimeData} />
    case 'enrich': return <EnrichDetail data={runtimeData} />
    case 'readiness': return <ReadinessDetail data={runtimeData} />
    case 'build': return <BuildDetail data={runtimeData} />
    case 'simulate': return <SimulateDetail data={runtimeData} />
    case 'repair': return <RepairDetail data={runtimeData} />
    case 'output': return <OutputDetail data={runtimeData} />
    default: return <pre style={{ color: '#9d9a97', fontSize: '0.78rem' }}>{JSON.stringify(runtimeData, null, 2)}</pre>
  }
}
```

> **NOTA**: No borrar los componentes legacy (`IntakeDetail`, `EnrichDetail`, etc.). Se usan como fallback y se pueden deprecar en un PR futuro.

---

### Paso 8: Actualizar `FlowStepNode.tsx` con indicadores de I/O

**Archivo**: `components/debug/FlowStepNode.tsx`

En el RuntimeSummary, cuando existan datos de `phases`, mostrar un micro resumen de input keys → output keys:

```tsx
// Al final del nodo, si hay phaseIO:
const phaseData = data.runtimeData?.phases?.[data.phaseId]
if (phaseData) {
  return (
    <div className="node-io-preview">
      <span className="node-io-badge node-io-in">📥 {Object.keys(phaseData.input).length}</span>
      <span className="node-io-arrow">→</span>
      <span className="node-io-badge node-io-out">📤 {Object.keys(phaseData.output).length}</span>
      <span className="node-io-time">⏱ {phaseData.durationMs}ms</span>
    </div>
  )
}
```

---

### Paso 9: Agregar CSS para tabs y data renderer

**Archivo**: `components/debug/flow-viewer.css`

```css
/* ─── I/O Tabs ─────────────────────────────────────────────────────────────── */
.io-tabs-bar { display: flex; gap: 0.5rem; margin-bottom: 1rem; align-items: center; }
.io-tab { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #9d9a97; padding: 0.4rem 1rem; border-radius: 6px; cursor: pointer; font-size: 0.82rem; transition: all 0.2s; }
.io-tab--active { background: rgba(255,255,255,0.12); color: #e4e0db; border-color: rgba(255,255,255,0.2); }
.io-duration { margin-left: auto; font-size: 0.75rem; color: #8f8a86; }

/* ─── Data Renderer ────────────────────────────────────────────────────────── */
.data-renderer { display: flex; flex-direction: column; gap: 0.6rem; }
.data-row { display: flex; flex-direction: column; gap: 0.15rem; }
.data-key { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: #8f8a86; }
.data-value { font-size: 0.88rem; color: #e4e0db; }
.data-null { color: #5f5b58; }
.data-number { color: #80deea; }
.data-string { color: #b9b5b2; line-height: 1.4; }
.data-bool-true { color: #6ed7a5; }
.data-bool-false { color: #ff6b6b; }
.data-array { color: #a78bfa; }
.data-object { color: #9d9a97; font-size: 0.78rem; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 4px; overflow-x: auto; }

/* ─── Node I/O preview ─────────────────────────────────────────────────────── */
.node-io-preview { display: flex; align-items: center; gap: 0.3rem; font-size: 0.72rem; margin-top: 0.3rem; color: #8f8a86; }
.node-io-badge { padding: 0.1rem 0.35rem; border-radius: 3px; }
.node-io-in { background: rgba(128,222,234,0.1); color: #80deea; }
.node-io-out { background: rgba(110,215,165,0.1); color: #6ed7a5; }
.node-io-arrow { color: #5f5b58; }
.node-io-time { margin-left: auto; }

/* ─── Processing description ───────────────────────────────────────────────── */
.processing-description { font-size: 0.9rem; color: #b9b5b2; line-height: 1.6; font-style: italic; padding: 0.5rem 0; }
```

---

### Paso 10: Agregar strings de i18n

**Archivo**: `src/i18n/index.ts`

```typescript
  'debug.flow.tab_input': 'Entrada',
  'debug.flow.tab_processing': 'Procesamiento',
  'debug.flow.tab_output': 'Salida',
  'debug.flow.field_profileId': 'ID de Perfil',
  'debug.flow.field_nombre': 'Nombre',
  'debug.flow.field_edad': 'Edad',
  'debug.flow.field_ciudad': 'Ciudad',
  'debug.flow.field_ubicacion': 'Ubicación',
  'debug.flow.field_ocupacion': 'Ocupación',
  'debug.flow.field_objetivo': 'Objetivo',
  'debug.flow.field_provider': 'Proveedor',
  'debug.flow.field_enrichedProfileId': 'Perfil Enriquecido',
  'debug.flow.field_inferences': 'Inferencias',
  'debug.flow.field_warnings': 'Advertencias',
  'debug.flow.field_tokensUsed': 'Tokens Consumidos',
  'debug.flow.field_ready': '¿Listo?',
  'debug.flow.field_errors': 'Errores',
  'debug.flow.field_constraints': 'Restricciones',
  'debug.flow.field_objectiveCount': 'Cantidad de Objetivos',
  'debug.flow.field_freeHoursWeekday': 'Horas Libres (Día Hábil)',
  'debug.flow.field_freeHoursWeekend': 'Horas Libres (Fin de Semana)',
  'debug.flow.field_planId': 'ID de Plan',
  'debug.flow.field_resumen': 'Resumen',
  'debug.flow.field_eventCount': 'Cantidad de Eventos',
  'debug.flow.field_eventos': 'Eventos',
  'debug.flow.field_fallbackUsed': 'Respaldo Usado',
  'debug.flow.field_qualityScore': 'Puntaje de Calidad',
  'debug.flow.field_overallStatus': 'Estado General',
  'debug.flow.field_pass': 'Pasan',
  'debug.flow.field_warn': 'Avisos',
  'debug.flow.field_fail': 'Fallan',
  'debug.flow.field_findings': 'Hallazgos',
  'debug.flow.field_mode': 'Modo',
  'debug.flow.field_attempt': 'Intento',
  'debug.flow.field_maxAttempts': 'Máximo de Intentos',
  'debug.flow.field_failingFindings': 'Hallazgos Fallidos',
  'debug.flow.field_currentEventCount': 'Eventos Actuales',
  'debug.flow.field_newPlanId': 'Nuevo Plan ID',
  'debug.flow.field_repairedEventCount': 'Eventos Reparados',
  'debug.flow.field_repairNotes': 'Notas de Reparación',
  'debug.flow.field_deliveryMode': 'Modo de Entrega',
  'debug.flow.field_finalQualityScore': 'Puntaje Final',
  'debug.flow.field_repairAttempts': 'Intentos de Reparación',
  'debug.flow.field_unresolvableFindings': 'Problemas Sin Resolver',
  'debug.flow.field_honestWarning': 'Advertencia',
```

---

### Paso 11: Verificación

1. `npm run typecheck` — debe pasar sin errores nuevos
2. `npm run lap:run:example` — verificar en terminal que cada fase imprime `📥 IN:` y `📤 OUT:`
3. Abrir `http://localhost:3000/debug/flow` — verificar que cada modal tiene tabs Entrada/Salida
4. Verificar que los datos legacy siguen funcionando hasta ser deprecados

## Reglas

- No hardcodear strings de UI — usar i18n
- Zod `.strict()` en schemas nuevos si aplica
- No romper los datos que ya se muestran, mantener backward compat
- Si el cambio toca `app/api/` o `src/lib/db/`, correr `npm run build`
- Correr `npm run typecheck` al final
- Luxon para timestamps de negocio (aquí usamos `new Date()` solo para ISO strings de debug, que es aceptable)
