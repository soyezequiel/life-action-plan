import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

function getLapHomeDir() {
  const configuredHome = process.env.LAP_HOME?.trim()
  return configuredHome || path.join(homedir(), '.lap')
}

function getLapCodexAuthFilePath() {
  return path.join(getLapHomeDir(), 'codex', 'auth.json')
}

function run() {
  const authFilePath = getLapCodexAuthFilePath()

  if (!existsSync(authFilePath)) {
    console.error(`❌ Error: No se encontró el archivo de sesión de Codex en: ${authFilePath}`)
    console.error('Ejecuta "npm run codex:login" primero en tu máquina local.')
    process.exit(1)
  }

  try {
    const raw = readFileSync(authFilePath, 'utf8')
    const json = JSON.parse(raw)
    
    // Minify and escape for env var usage
    const minified = JSON.stringify(json)
    
    console.log('\n✅ Sesión de Codex extraída con éxito.')
    console.log('Copia el siguiente valor y pégalo en la variable de entorno LAP_CODEX_AUTH_SESSION_JSON en Vercel:\n')
    console.log(minified)
    console.log('\n---')
  } catch (error) {
    console.error('❌ Error al leer o parsear la sesión:', error.message)
    process.exit(1)
  }
}

run()
