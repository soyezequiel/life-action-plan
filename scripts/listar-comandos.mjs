import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const packageJsonPath = resolve(process.cwd(), 'package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

const descriptions = {
  comandos: 'Muestra todos los comandos disponibles del proyecto con una explicacion breve.',
  dev: 'Inicia el servidor de desarrollo de Next.js.',
  'dev:turbo': 'Inicia el servidor de desarrollo usando Turbopack.',
  build: 'Genera la build de produccion.',
  start: 'Levanta la app en modo produccion.',
  'lap:run': 'Ejecuta el runner principal de LAP en modo real.',
  'lap:run:example': 'Ejecuta el ejemplo del runner v5.',
  'lap:run:v5-example': 'Ejecuta el runner v5 con datos de ejemplo.',
  'lap:run:v5-real': 'Ejecuta el runner v5 real.',
  'codex:login': 'Inicia el flujo de login de Codex para este workspace.',
  'lap:inspect': 'Inspecciona resultados generados por el runner.',
  'lap:flow:viewer': 'Abre el visor local del flujo en el navegador.',
  typecheck: 'Valida los tipos de TypeScript sin emitir archivos.',
  test: 'Corre la suite de tests una vez.',
  'test:watch': 'Corre los tests en modo observacion.',
  lint: 'Ejecuta ESLint sobre el repo.',
  'doctor:local': 'Revisa el estado del entorno local.',
  'doctor:local:charge': 'Revisa el entorno local exigiendo condiciones de cobro.',
  'doctor:deploy': 'Revisa si el proyecto esta listo para deploy.',
  'smoke:local': 'Hace db push y luego corre el chequeo local.',
  'smoke:local:charge': 'Hace db push y luego el chequeo local con requisitos de cobro.',
  'smoke:local:resource': 'Hace db push, chequeo local y reporte de recursos.',
  'credential:bootstrap:backend': 'Prepara credenciales backend necesarias para el entorno.',
  'smoke:resource:policy': 'Ejecuta el smoke test de politicas de recursos.',
  'smoke:deploy': 'Genera la build y corre el chequeo de deploy.',
  'charge:report': 'Genera el reporte de cargos del smoke test.',
  'resource:report': 'Genera el reporte de uso de recursos.',
  'resource:report:canonical': 'Genera el reporte canonico de uso de recursos.',
  'db:generate': 'Genera migraciones de Drizzle.',
  'db:push': 'Aplica el schema actual a la base de datos.',
  'db:migrate': 'Ejecuta migraciones pendientes en la base de datos.'
}

const frequentCommands = new Set([
  'comandos',
  'dev',
  'db:push',
  'typecheck',
  'test',
  'lint',
  'smoke:local',
  'build'
])

const categoryDefinitions = [
  { key: 'frecuentes', title: 'Mas usados' },
  { key: 'desarrollo', title: 'Desarrollo local' },
  { key: 'validacion', title: 'Validacion y calidad' },
  { key: 'base-de-datos', title: 'Base de datos' },
  { key: 'diagnostico', title: 'Diagnostico y smoke tests' },
  { key: 'flujos', title: 'Flujos y utilidades' },
  { key: 'otros', title: 'Otros' }
]

const commandPriorities = {
  comandos: 0,
  dev: 1,
  'db:push': 2,
  typecheck: 3,
  test: 4,
  lint: 5,
  'smoke:local': 6,
  build: 7,
  'dev:turbo': 8,
  start: 9,
  'test:watch': 10,
  'db:generate': 11,
  'db:migrate': 12,
  'doctor:local': 13,
  'doctor:local:charge': 14,
  'doctor:deploy': 15,
  'smoke:local:charge': 16,
  'smoke:local:resource': 17,
  'smoke:resource:policy': 18,
  'smoke:deploy': 19,
  'lap:run': 20,
  'lap:run:example': 21,
  'lap:run:v5-example': 22,
  'lap:run:v5-real': 23,
  'lap:inspect': 24,
  'lap:flow:viewer': 25,
  'codex:login': 26,
  'credential:bootstrap:backend': 27,
  'charge:report': 28,
  'resource:report': 29,
  'resource:report:canonical': 30
}

function resolveCategory(scriptName) {
  if (frequentCommands.has(scriptName)) {
    return 'frecuentes'
  }

  if (scriptName === 'dev:turbo' || scriptName === 'start') {
    return 'desarrollo'
  }

  if (scriptName === 'typecheck' || scriptName === 'test:watch') {
    return 'validacion'
  }

  if (scriptName.startsWith('db:')) {
    return 'base-de-datos'
  }

  if (scriptName.startsWith('doctor:') || scriptName.startsWith('smoke:')) {
    return 'diagnostico'
  }

  if (
    scriptName.startsWith('lap:') ||
    scriptName.startsWith('codex:') ||
    scriptName.startsWith('credential:') ||
    scriptName.startsWith('charge:') ||
    scriptName.startsWith('resource:')
  ) {
    return 'flujos'
  }

  return 'otros'
}

const scripts = Object.entries(packageJson.scripts ?? {}).map(([scriptName, scriptCommand]) => ({
  scriptName,
  scriptCommand,
  description: descriptions[scriptName] ?? 'Sin descripcion disponible.',
  category: resolveCategory(scriptName),
  priority: commandPriorities[scriptName] ?? Number.MAX_SAFE_INTEGER
}))

if (scripts.length === 0) {
  console.log('No hay comandos definidos en package.json.')
  process.exit(0)
}

const longestScriptName = scripts.reduce((maxLength, { scriptName }) => {
  return Math.max(maxLength, scriptName.length)
}, 0)

console.log('Comandos disponibles de LAP')
console.log('')
console.log('La lista esta ordenada por prioridad de uso y luego por categoria.')
console.log('')

for (const { key, title } of categoryDefinitions) {
  const commandsInCategory = scripts
    .filter((script) => script.category === key)
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority
      }

      return left.scriptName.localeCompare(right.scriptName)
    })

  if (commandsInCategory.length === 0) {
    continue
  }

  console.log(`[${title}]`)

  for (const { scriptName, scriptCommand, description } of commandsInCategory) {
    const label = `npm run ${scriptName}`.padEnd(`npm run `.length + longestScriptName + 2, ' ')
    console.log(`${label}${description}`)
    console.log(`  Ejecuta: ${scriptCommand}`)
  }

  console.log('')
}
