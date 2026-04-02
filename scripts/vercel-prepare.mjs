import { spawnSync } from 'node:child_process'

console.log('[Vercel-Prepare] Iniciando orquestacion de despliegue...')

function isTruthyFlag(value) {
  const normalized = value?.trim().toLowerCase() ?? ''
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function run(command, args) {
  const fullCommand = `${command} ${args.join(' ')}`
  console.log(`[Vercel-Prepare] PROXIMO PASO: ${fullCommand}`)

  const startTime = Date.now()
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true })
  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  if (result.status !== 0) {
    console.error(`[Vercel-Prepare] FALLO: ${fullCommand} (Status: ${result.status}, Tiempo: ${duration}s)`)
    process.exit(result.status || 1)
  }

  console.log(`[Vercel-Prepare] COMPLETADO: ${fullCommand} (${duration}s)`)
}

function resolvePostbuildDbCommand() {
  const action = process.env.LAP_POSTBUILD_DB_ACTION?.trim().toLowerCase() ?? ''

  if (action === 'push') {
    return { action, command: 'npm', args: ['run', 'db:push'] }
  }

  if (action === 'migrate') {
    return { action, command: 'npm', args: ['run', 'db:migrate'] }
  }

  return null
}

function runExplicitDbStepOrSkip() {
  const dbCommand = resolvePostbuildDbCommand()

  if (!dbCommand) {
    console.log('[Vercel-Prepare] Postbuild sin accion sobre DB.')
    console.log('[Vercel-Prepare] Para ejecutar DB explicitamente usa LAP_POSTBUILD_DB_ACTION=migrate o LAP_POSTBUILD_DB_ACTION=push.')
    return
  }

  if (dbCommand.action === 'push' && !isTruthyFlag(process.env.LAP_POSTBUILD_DB_PUSH_ALLOW_DESTRUCTIVE)) {
    console.log('[Vercel-Prepare] Se pidio db:push, pero queda bloqueado por seguridad.')
    console.log('[Vercel-Prepare] Si realmente quieres usar push, exporta LAP_POSTBUILD_DB_PUSH_ALLOW_DESTRUCTIVE=1.')
    process.exit(1)
  }

  run(dbCommand.command, dbCommand.args)
}

const isPrecheck = process.argv.includes('--precheck-only')
const isPostbuild = process.argv.includes('--postbuild')

if (isPrecheck) {
  run('node', ['scripts/deploy-doctor.mjs'])
} else if (isPostbuild) {
  runExplicitDbStepOrSkip()
} else {
  run('node', ['scripts/deploy-doctor.mjs'])
  run('npm', ['run', 'build'])
  runExplicitDbStepOrSkip()
}

console.log('[Vercel-Prepare] Paso finalizado con exito!')
