import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

interface PipelineStatusPhase {
  id: string
  status?: string
  durationMs?: number
  traces?: unknown[]
  input?: unknown
  output?: unknown
  error?: unknown
}

interface PipelineStatusSnapshot {
  updatedAt: string
  phases?: PipelineStatusPhase[]
  [key: string]: unknown
}

type PipelineStatusPhaseMap = Record<string, {
  status?: string
  durationMs?: number
  tracesCount: number
  input?: unknown
  output?: unknown
  error?: unknown
}>

export async function GET() {
  const statePath = join(process.cwd(), 'tmp', 'pipeline-state.json')

  if (!existsSync(statePath)) {
    return NextResponse.json({ 
      lastStepId: null, 
      lastPhaseId: null, 
      active: false 
    })
  }

  try {
    const raw = readFileSync(statePath, 'utf8')
    const state = JSON.parse(raw) as PipelineStatusSnapshot
    
    const lastUpdate = new Date(state.updatedAt).getTime()
    const active = Date.now() - lastUpdate < 60000

    // Construir un phaseMap para que el UI pueda consumir los resultados fácilmente
    const phaseMap: PipelineStatusPhaseMap = {}
    
    if (Array.isArray(state.phases)) {
      state.phases.forEach((phase) => {
        if (!phase.id) {
          return
        }

        phaseMap[phase.id] = {
          status: phase.status,
          durationMs: phase.durationMs,
          tracesCount: phase.traces?.length || 0,
          input: phase.input,
          output: phase.output,
          error: phase.error
        }
      })
    }

    return NextResponse.json({
      ...state,
      active,
      phaseMap
    })
  } catch {
    return NextResponse.json({ error: 'Failed to read state' }, { status: 500 })
  }
}
