import { getLapCodexAuthFilePath } from '../src/lib/auth/codex-auth'
import { loginCodexWithBrowser } from '../src/lib/auth/codex-browser-login'
import {
  fetchCodexUsageSnapshot,
  formatCodexCreditsLine,
  formatCodexRateLimitLinesFor,
  hasCodexCreditsAvailable
} from '../src/lib/auth/codex-usage'

interface CliOptions {
  port?: number
  noBrowser?: boolean
  workspaceId?: string
}

interface CodexCreditCheckResult {
  checked: boolean
  hasCredits: boolean | null
  unlimited: boolean | null
  balance: number | null
  approxLocalMessages: number | null
  approxCloudMessages: number | null
  planType: string | null
  summary: string | null
  limits: {
    codex: string[]
    codeReview: string[]
  }
  error: string | null
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

async function readCodexCreditCheck(): Promise<CodexCreditCheckResult> {
  try {
    const snapshot = await fetchCodexUsageSnapshot()
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

    return {
      checked: true,
      hasCredits: hasCodexCreditsAvailable(snapshot),
      unlimited: snapshot.credits.unlimited,
      balance: snapshot.credits.balance,
      approxLocalMessages: snapshot.credits.approxLocalMessages,
      approxCloudMessages: snapshot.credits.approxCloudMessages,
      planType: snapshot.planType,
      summary: formatCodexCreditsLine(snapshot),
      limits: {
        codex: formatCodexRateLimitLinesFor('Uso Codex', snapshot.rateLimit, timezone),
        codeReview: formatCodexRateLimitLinesFor('Uso Code Review', snapshot.codeReviewRateLimit, timezone)
      },
      error: null
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo consultar el uso de Codex.'

    return {
      checked: false,
      hasCredits: null,
      unlimited: null,
      balance: null,
      approxLocalMessages: null,
      approxCloudMessages: null,
      planType: null,
      summary: null,
      limits: {
        codex: [],
        codeReview: []
      },
      error: message
    }
  }
}

function printReadableLoginSummary(accountId: string, creditCheck: CodexCreditCheckResult): void {
  console.error('[Codex Login] Sesion lista')
  console.error(`  Cuenta: ${accountId}`)
  console.error(`  Plan: ${creditCheck.planType ?? 'desconocido'}`)

  if (creditCheck.summary) {
    console.error(`  ${creditCheck.summary}`)
  }

  if (creditCheck.limits.codex.length > 0) {
    console.error('  Limites Codex:')
    for (const line of creditCheck.limits.codex) {
      console.error(`    - ${line}`)
    }
  }

  if (creditCheck.limits.codeReview.length > 0) {
    console.error('  Limites Code Review:')
    for (const line of creditCheck.limits.codeReview) {
      console.error(`    - ${line}`)
    }
  }

  if (!creditCheck.checked && creditCheck.error) {
    console.error(`  Estado de creditos: no verificado (${creditCheck.error})`)
  }
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

  const creditCheck = await readCodexCreditCheck()

  printReadableLoginSummary(result.accountId, creditCheck)

  console.log(JSON.stringify({
    authFilePath: result.authFilePath,
    accountId: result.accountId,
    redirectUri: result.redirectUri,
    credits: creditCheck
  }, null, 2))
}

run().catch((error) => {
  console.error('[Codex Login] Error:', error)
  process.exit(1)
})
