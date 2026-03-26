import { getLapCodexAuthFilePath } from '../src/lib/auth/codex-auth'
import { loginCodexWithBrowser } from '../src/lib/auth/codex-browser-login'

interface CliOptions {
  port?: number
  noBrowser?: boolean
  workspaceId?: string
}

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {}

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const next = argv[index + 1]

    if (token.startsWith('--workspace-id=')) {
      const value = token.slice('--workspace-id='.length).trim()
      if (value) {
        options.workspaceId = value
      }
      continue
    }

    if (token === '--port' && next) {
      const parsed = Number.parseInt(next, 10)
      if (!Number.isNaN(parsed) && parsed > 0) {
        options.port = parsed
      }
      index += 1
      continue
    }

    if (token === '--workspace-id' && next) {
      const value = next.trim()
      if (value) {
        options.workspaceId = value
      }
      index += 1
      continue
    }

    if (token === '--no-browser') {
      options.noBrowser = true
    }
  }

  return options
}

async function run(): Promise<void> {
  const cliOptions = parseCliOptions(process.argv.slice(2))
  const authFilePath = getLapCodexAuthFilePath()
  const workspaceId = (cliOptions.workspaceId ?? process.env.LAP_CODEX_WORKSPACE_ID)?.trim() || undefined

  console.error(`[Codex Login] Guardando sesion en ${authFilePath}`)
  if (workspaceId) {
    console.error(`[Codex Login] Workspace solicitado: ${workspaceId}`)
  }

  const result = await loginCodexWithBrowser({
    authFilePath,
    port: cliOptions.port,
    openBrowser: !cliOptions.noBrowser,
    workspaceId
  })

  console.log(JSON.stringify({
    authFilePath: result.authFilePath,
    accountId: result.accountId,
    redirectUri: result.redirectUri
  }, null, 2))
}

run().catch((error) => {
  console.error('[Codex Login] Error:', error)
  process.exit(1)
})
