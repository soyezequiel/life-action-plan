import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { runnerConfigSchema } from './runner-config.schema'
import { FlowRunner } from '../src/lib/pipeline/runner'
import { logPhase, logStep, logRepairAttempt } from '../src/lib/flow/runner-logger'

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

  try {
    if (targetPhase) {
      logPhase(targetPhase as any)
      const result = await runner.executePhase(targetPhase as any, {
        onPhaseStart: (p) => logStep(`${p}-start` as any),
        onProgress: (p, prog) => {
           if (p === 'build') {
             console.error(`[LAP Runner] Build Progress: [${prog.stage}] step ${prog.current}/${prog.total} (${prog.charCount} chars)`)
           } else {
             console.error(`[LAP Runner] ${p} Progress: stage ${prog.stage}`)
           }
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
      console.log(JSON.stringify(result, null, 2))
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
