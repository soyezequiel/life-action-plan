import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { runnerConfigSchema } from './runner-config.schema'
import { FlowRunner } from '../src/lib/pipeline/runner'
import { logPhase, logStep, logRepairAttempt, logPhaseSkipped } from '../src/lib/flow/runner-logger'
import { mapContextToRuntimeData, type PhaseStatus } from '../src/lib/flow/pipeline-runtime-data'

const CONTEXT_FILE = resolve(process.cwd(), 'tmp/pipeline-context.json')

function persistContext(runner: FlowRunner, phaseStatuses: Record<string, PhaseStatus>) {
  try {
    mkdirSync(resolve(process.cwd(), 'tmp'), { recursive: true })
    const data = mapContextToRuntimeData(runner.getContext(), phaseStatuses)
    writeFileSync(CONTEXT_FILE, JSON.stringify(data, null, 2), 'utf8')
  } catch {
    // Non-fatal — debug persistence failure should not abort the pipeline
  }
}

function loadLocalEnv() {
  let loaded = false
  for (const envFile of ['.env.local', '.env']) {
    const fullPath = resolve(process.cwd(), envFile)
    if (existsSync(fullPath)) {
      try {
        process.loadEnvFile(fullPath)
        loaded = true
      } catch (err) {
        // ignore errors
      }
    }
  }
}

async function run() {
  loadLocalEnv()
  
  const args = process.argv.slice(2)
  let configPath = ''
  let targetPhase: string | null = null
  let overrideProfileId: string | null = null
  let overridePlanId: string | null = null

  // Simple arg parsing
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--phase' && args[i+1]) {
      targetPhase = args[i+1]
      i++
    } else if (args[i] === '--profile-id' && args[i+1]) {
      overrideProfileId = args[i+1]
      i++
    } else if (args[i] === '--plan-id' && args[i+1]) {
      overridePlanId = args[i+1]
      i++
    } else if (!args[i].startsWith('--')) {
      configPath = args[i]
    }
  }

  if (!configPath) {
    console.error('Usage: tsx scripts/lap-runner.ts <config.json> [--phase <phase>] [--profile-id <id>] [--plan-id <id>]')
    process.exit(1)
  }

  const absolutePath = resolve(configPath)
  if (!existsSync(absolutePath)) {
    console.error(`Config file not found at: ${absolutePath}`)
    process.exit(1)
  }

  const configContent = readFileSync(absolutePath, 'utf8')
  let configJson
  try {
    configJson = JSON.parse(configContent)
  } catch (err) {
    console.error('Invalid JSON in config file')
    process.exit(1)
  }

  const parsedConfig = runnerConfigSchema.safeParse(configJson)
  if (!parsedConfig.success) {
    console.error('Invalid configuration:', parsedConfig.error.format())
    process.exit(1)
  }

  const runner = new FlowRunner(parsedConfig.data, {
    profileId: overrideProfileId || undefined,
    planId: overridePlanId || undefined
  })

  const phaseStatuses: Record<string, PhaseStatus> = {}

  try {
    if (targetPhase) {
      logPhase(targetPhase as any)
      phaseStatuses[targetPhase] = 'running'
      persistContext(runner, phaseStatuses)
      const result = await runner.executePhase(targetPhase as any, {
        onPhaseStart: (p) => {
          logStep(`${p}-start` as any)
          phaseStatuses[p] = 'running'
          persistContext(runner, phaseStatuses)
        },
        onProgress: (p, prog) => {
           if (p === 'build') {
             console.error(`[LAP Runner] Build Progress: [${prog.stage}] step ${prog.current}/${prog.total} (${prog.charCount} chars)`)
           } else {
             console.error(`[LAP Runner] ${p} Progress: stage ${prog.stage}`)
           }
        },
        onPhaseSuccess: (p) => {
          phaseStatuses[p] = 'success'
          persistContext(runner, phaseStatuses)
        },
        onPhaseFailure: (p) => {
          phaseStatuses[p] = 'error'
          persistContext(runner, phaseStatuses)
        },
        onPhaseSkipped: (p) => {
          logPhaseSkipped(p)
          phaseStatuses[p] = 'skipped'
          persistContext(runner, phaseStatuses)
        }
      })

      if (targetPhase === 'output') {
        console.log(JSON.stringify(result, null, 2))
      }
    } else {
      const result = await runner.runFullPipeline({
        onPhaseStart: (p) => {
            logPhase(p)
            logStep(`${p}-start` as any)
            phaseStatuses[p] = 'running'
            persistContext(runner, phaseStatuses)
        },
        onPhaseSuccess: (p) => {
            phaseStatuses[p] = 'success'
            persistContext(runner, phaseStatuses)
        },
        onPhaseFailure: (p) => {
            phaseStatuses[p] = 'error'
            persistContext(runner, phaseStatuses)
        },
        onPhaseSkipped: (p) => {
            logPhaseSkipped(p)
            phaseStatuses[p] = 'skipped'
            persistContext(runner, phaseStatuses)
        },
        onProgress: (p, prog) => {
            if (p === 'build') {
                console.error(`[LAP Runner] Build Progress: [${prog.stage}] step ${prog.current}/${prog.total} (${prog.charCount} chars)`)
            } else if (p === 'simulate') {
                console.error(`[LAP Runner] Simulate Progress: stage ${prog.stage}`)
            }
        },
        onRepairAttempt: (attempt, maxAttempts, findings) => {
            logRepairAttempt(attempt, maxAttempts, findings.length)
        }
      })
      
      logPhase('output')
      if (result?.meta?.deliveryMode) {
        console.error(`[LAP Runner] Delivery mode: ${result.meta.deliveryMode} (score: ${result.meta.finalQualityScore ?? 'n/a'}, attempts: ${result.meta.attempts ?? 1})`)
      }
      
      // Esperar un momento para asegurar que los logs de progreso (stderr) se vacíen en la consola
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // Separador para evitar interleaving con los logs de progreso en terminales asíncronas
      console.log('\n--- PIPELINE RESULT START ---')
      console.log(JSON.stringify(result, null, 2))
      console.log('--- PIPELINE RESULT END ---\n')
    }

    logStep('output-exit')
    process.exit(0)
  } catch (error) {
    console.error('[LAP Runner] Runtime error:', error)
    if (error instanceof Error && (error as any).charge) {
      console.error('[LAP Runner] Charge failure info:', (error as any).charge)
    }
    process.exit(1)
  }
}

run()
