import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

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
    const state = JSON.parse(raw)
    
    const lastUpdate = new Date(state.updatedAt).getTime()
    const active = Date.now() - lastUpdate < 60000

    // Construir un phaseMap para que el UI pueda consumir los resultados fácilmente
    const phaseMap: Record<string, any> = {}
    
    if (Array.isArray(state.phases)) {
      state.phases.forEach((p: any) => {
        phaseMap[p.id] = {
          status: p.status,
          durationMs: p.durationMs,
          tracesCount: p.traces?.length || 0,
          input: p.input,
          output: p.output,
          error: p.error
        }
      })
    }

    return NextResponse.json({
      ...state,
      active,
      phaseMap
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to read state' }, { status: 500 })
  }
}
