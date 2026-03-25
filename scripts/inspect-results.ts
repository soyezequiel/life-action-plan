import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

function main() {
  const statePath = join(process.cwd(), 'tmp', 'pipeline-state.json')

  if (!existsSync(statePath)) {
    console.error('No hay resultados de ninguna ejecución previa.')
    process.exit(1)
  }

  try {
    const raw = readFileSync(statePath, 'utf8')
    const state = JSON.parse(raw)
    const { pipeline, phases, updatedAt } = state

    if (!pipeline) {
      console.error('El formato de pipeline-state.json no coincide con v2 (phases). Ejecuta lap:run primero.')
      process.exit(1)
    }

    console.log(`\n=== INSPECTOR DE EJECUCIÓN (Última actualización: ${updatedAt}) ===`)
    console.log(`Estado Global: ${pipeline.status.toUpperCase()}`)
    console.log(`Calidad Final: ${pipeline.qualityScore ?? 'N/A'} | Modo Entrega: ${pipeline.deliveryMode ?? 'N/A'}`)
    if (pipeline.error) {
      console.log(`Error Critico: ${pipeline.error}`)
    }
    console.log('------------------------------------------------------------')

    if (!phases || !Array.isArray(phases)) {
      console.log('No hay fases registradas.')
      return
    }

    phases.forEach((p: any) => {
      console.log(`\n[${p.id.toUpperCase()}] ${p.name || p.id}`)
      console.log(`  Estado: ${p.status} | Duración: ${p.durationMs ? p.durationMs + 'ms' : 'N/A'} | Trazas LLM: ${p.traces?.length ?? 0}`)
      
      if (p.id === 'intake' && p.input?.config?.intake) {
         const intake = p.input.config.intake
         console.log(`  Entrada -> Usuario: ${intake.nombre} | Objetivo: "${intake.objetivo}"`)
      }
      if (p.output?.error || p.error) {
         console.log(`  Error en fase: ${p.output?.error || p.error}`)
      }
      
      if (p.id === 'enrich' && p.output?.inferences) {
         console.log(`  Inferencias generadas: ${p.output.inferences.length}`)
      }
      if (p.id === 'build' && p.output) {
         console.log(`  Plan ID: ${p.output.planId}`)
         console.log(`  Eventos planificados: ${p.output.eventos?.length ?? 0}`)
      }
      if (p.id === 'simulate' && p.output?.simulation) {
         const sim = p.output.simulation
         console.log(`  Status Simulación: ${sim.summary?.overallStatus ?? 'N/A'} | Quality Score: ${sim.qualityScore ?? 'N/A'}`)
         if (sim.findings?.length > 0) {
           console.log('  Hallazgos activos:')
           sim.findings.slice(0, 3).forEach((f: any) => {
              console.log(`   - [${f.status}] ${f.code}: ${JSON.stringify(f.params || {})}`)
           })
         }
      }
    })

    console.log('\n------------------------------------------------------------')
    console.log('Tip: Para ver el JSON completo: code tmp/pipeline-state.json')

  } catch (err) {
    console.error('Error al leer los resultados:', err)
  }
}

main()
