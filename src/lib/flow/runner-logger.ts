import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { traceCollector } from '../../debug/trace-collector'
import { FLOW_STEPS, FLOW_PHASES } from './flow-definition'

// State file path: f:/proyectos/planificador-vida/tmp/pipeline-state.json
const STATE_DIR = join(process.cwd(), 'tmp')
const STATE_FILE = join(STATE_DIR, 'pipeline-state.json')

interface PhaseRecord {
  id: string
  name: string
  status: 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt?: string
  durationMs?: number
  input?: any
  output?: any
  traces: any[]
}

let pipelineStatus: 'running' | 'completed' | 'failed' = 'running'
let pipelineStartedAt = new Date().toISOString()
let pipelineCompletedAt: string | undefined
let pipelineFinalResult: any

const phaseRegistry = new Map<string, PhaseRecord>()
let currentPhaseId: string | undefined

function ensureDir() {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true })
  }
}

export function startPipeline() {
  pipelineStatus = 'running'
  pipelineStartedAt = new Date().toISOString()
  pipelineCompletedAt = undefined
  pipelineFinalResult = undefined
  phaseRegistry.clear()
  currentPhaseId = undefined
  traceCollector.clear()
}

export function completePipeline(result: any) {
  pipelineStatus = 'completed'
  pipelineCompletedAt = new Date().toISOString()
  pipelineFinalResult = result
  writeState()
}

export function failPipeline(error: any) {
  pipelineStatus = 'failed'
  pipelineCompletedAt = new Date().toISOString()
  pipelineFinalResult = { error: String(error) }
  if (currentPhaseId) {
    const p = phaseRegistry.get(currentPhaseId)
    if (p) {
        p.status = 'failed'
        p.completedAt = new Date().toISOString()
        p.durationMs = new Date(p.completedAt).getTime() - new Date(p.startedAt).getTime()
        p.output = { error: String(error) }
        
        const snapshot = traceCollector.getSnapshot()
        const allSpans = snapshot.flatMap(t => t.spans || [])
        p.traces = allSpans.filter(span => new Date(span.startedAt).getTime() >= new Date(p.startedAt).getTime())
    }
  }
  writeState()
}

export function startPhase(phaseId: string, input?: any) {
  currentPhaseId = phaseId
  const phaseDef = FLOW_PHASES.find(p => p.id === phaseId)
  
  phaseRegistry.set(phaseId, {
    id: phaseId,
    name: phaseDef ? phaseDef.name : phaseId,
    status: 'running',
    startedAt: new Date().toISOString(),
    input,
    traces: []
  })
  
  if (phaseDef) {
    console.error(`\n[LAP Runner] === PHASE: ${phaseDef.name} ===`)
  } else {
    console.error(`\n[LAP Runner] === PHASE: ${phaseId} ===`)
  }
  
  writeState()
}

export function completePhase(phaseId: string, output?: any) {
  const phase = phaseRegistry.get(phaseId)
  if (phase) {
    phase.status = 'completed'
    phase.completedAt = new Date().toISOString()
    phase.durationMs = new Date(phase.completedAt).getTime() - new Date(phase.startedAt).getTime()
    phase.output = output
    
    const snapshot = traceCollector.getSnapshot()
    const allSpans = snapshot.flatMap(t => t.spans || [])
    
    phase.traces = allSpans.filter(span => {
       const startT = new Date(span.startedAt).getTime()
       const phaseStart = new Date(phase.startedAt).getTime()
       const phaseEnd = new Date(phase.completedAt!).getTime()
       
       return startT >= phaseStart && startT <= phaseEnd
    })
  }
  currentPhaseId = undefined
  writeState()
}

function writeState() {
  try {
    ensureDir()
    const phases = Array.from(phaseRegistry.values())
    
    const snapshot = traceCollector.getSnapshot()
    const globalTraces = snapshot.filter(t => t.skillName === 'cli-pipeline')

    writeFileSync(STATE_FILE, JSON.stringify({
      pipeline: {
        status: pipelineStatus,
        startedAt: pipelineStartedAt,
        completedAt: pipelineCompletedAt,
        deliveryMode: pipelineFinalResult?.output?.deliveryMode ?? pipelineFinalResult?.meta?.deliveryMode,
        qualityScore: pipelineFinalResult?.output?.finalQualityScore ?? pipelineFinalResult?.meta?.finalQualityScore,
        error: pipelineFinalResult?.error
      },
      phases,
      globalTraces,
      updatedAt: new Date().toISOString()
    }, null, 2))
  } catch (err) {
    // Silent fail if disk is locked
  }
}

// Backward compatibility forms to keep typechecks passing if they are still imported
export function updateFullState(context: any) {
  // handled automatically now
}

export function logPhase(phaseId: string, context?: any) {
  // handled by startPhase
}

export function logStep(stepId: string, context?: any) {
  const step = FLOW_STEPS.find(s => s.id === stepId)
  if (step) {
    console.error(`[LAP Runner] -> ${step.name}: ${step.description}`)
  } else {
    console.error(`[LAP Runner] -> Step ${stepId}`)
  }
}

export function logRepairAttempt(attempt: number, maxAttempts: number, findingsCount: number, context?: any) {
  console.error(`[LAP Runner] 🔧 REPAIR attempt ${attempt}/${maxAttempts} — ${findingsCount} findings to fix`)
}
