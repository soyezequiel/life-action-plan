import { existsSync } from 'node:fs'
import postgres from 'postgres'

function loadLocalEnv() {
  const loadedFiles = []

  for (const envFile of ['.env.local', '.env']) {
    if (existsSync(envFile)) {
      process.loadEnvFile(envFile)
      loadedFiles.push(envFile)
    }
  }

  return loadedFiles
}

function needsSsl(connectionString) {
  return connectionString.includes('neon.tech') ||
    connectionString.includes('sslmode=require') ||
    process.env.NODE_ENV === 'production'
}

function parseArgs(argv) {
  let limit = 10
  let expectedStatuses = []

  for (const arg of argv) {
    if (arg.startsWith('--limit=')) {
      const parsed = Number.parseInt(arg.slice('--limit='.length), 10)
      if (Number.isInteger(parsed) && parsed > 0) {
        limit = parsed
      }
    }

    if (arg.startsWith('--expect=')) {
      expectedStatuses = arg
        .slice('--expect='.length)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    }
  }

  return { limit, expectedStatuses }
}

function formatUsd(value) {
  return typeof value === 'number' ? value.toFixed(4) : '0.0000'
}

async function main() {
  const loadedFiles = loadLocalEnv()
  const { limit, expectedStatuses } = parseArgs(process.argv.slice(2))
  const databaseUrl = process.env.DATABASE_URL?.trim() || ''

  console.log('LAP charge smoke report')
  console.log(`Env cargado: ${loadedFiles.length > 0 ? loadedFiles.join(', ') : 'ninguno'}`)

  if (!databaseUrl) {
    console.error('FAIL DATABASE_URL: falta configurar DATABASE_URL en .env.local o .env')
    process.exitCode = 1
    return
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 5,
    prepare: false,
    ssl: needsSsl(databaseUrl) ? 'require' : undefined
  })

  try {
    const [walletSettingsRow] = await sql`
      select count(*)::int as count
      from user_settings
      where key like 'wallet.%'
    `

    const chargeRows = await sql`
      select
        oc.id,
        oc.operation,
        oc.status,
        oc.reason_code as "reasonCode",
        oc.estimated_cost_sats as "estimatedCostSats",
        oc.final_cost_sats as "finalCostSats",
        oc.charged_sats as "chargedSats",
        oc.payment_provider as "paymentProvider",
        oc.plan_id as "planId",
        oc.profile_id as "profileId",
        oc.created_at as "createdAt",
        oc.resolved_at as "resolvedAt",
        ct.id as "costTrackingId",
        ct.cost_usd as "trackedCostUsd",
        ct.tokens_input as "trackedTokensInput",
        ct.tokens_output as "trackedTokensOutput",
        ct.model,
        p.nombre as "planName"
      from operation_charges oc
      left join cost_tracking ct on ct.charge_id = oc.id
      left join plans p on p.id = oc.plan_id
      order by oc.created_at desc
      limit ${limit}
    `

    console.log(`Wallets guardadas: ${walletSettingsRow.count}`)
    console.log(`Cobros encontrados: ${chargeRows.length}`)

    const statusCounts = chargeRows.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1
      return acc
    }, {})

    const summary = Object.entries(statusCounts)
      .map(([status, count]) => `${status}=${count}`)
      .join(', ')

    console.log(`Resumen por estado: ${summary || 'sin cobros registrados'}`)

    if (chargeRows.length > 0) {
      console.log('Ultimos cobros:')
      for (const row of chargeRows) {
        const planLabel = row.planName || row.planId || 'sin plan'
        const trackedLabel = row.costTrackingId
          ? `tracking=${row.costTrackingId} (USD ${formatUsd(row.trackedCostUsd)} / tokens ${row.trackedTokensInput ?? 0}+${row.trackedTokensOutput ?? 0})`
          : 'tracking=sin enlace'
        console.log(
          [
            `- ${row.createdAt}`,
            `op=${row.operation}`,
            `status=${row.status}`,
            `estimado=${row.estimatedCostSats} sats`,
            `final=${row.finalCostSats} sats`,
            `cobrado=${row.chargedSats} sats`,
            `razon=${row.reasonCode || '-'}`,
            `proveedor=${row.paymentProvider || row.model || '-'}`,
            `plan=${planLabel}`,
            trackedLabel
          ].join(' | ')
        )
      }
    }

    if (expectedStatuses.length > 0) {
      const missingStatuses = expectedStatuses.filter((status) => !statusCounts[status])
      if (missingStatuses.length > 0) {
        console.error(`FAIL Estados faltantes en operation_charges: ${missingStatuses.join(', ')}`)
        process.exitCode = 1
        return
      }

      console.log(`PASS Estados esperados presentes: ${expectedStatuses.join(', ')}`)
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

await main()
