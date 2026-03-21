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

function parseExpectedCases(rawValue) {
  return rawValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const [operation, status, executionMode, reasonCode] = value.split(':').map((part) => part.trim())

      return {
        raw: value,
        operation: operation || null,
        status: status || null,
        executionMode: executionMode || null,
        reasonCode: reasonCode || null
      }
    })
}

function parseArgs(argv) {
  let limit = 10
  let expectedStatuses = []
  let expectedCases = []
  let traceSources = []

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

    if (arg.startsWith('--expect-case=')) {
      expectedCases.push(...parseExpectedCases(arg.slice('--expect-case='.length)))
    }

    if (arg.startsWith('--trace=')) {
      traceSources = arg
        .slice('--trace='.length)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    }
  }

  return { limit, expectedStatuses, expectedCases, traceSources }
}

function formatUsd(value) {
  return typeof value === 'number' ? value.toFixed(4) : '0.0000'
}

function normalizeMetadata(rawMetadata) {
  if (!rawMetadata) {
    return null
  }

  if (typeof rawMetadata === 'string') {
    try {
      return JSON.parse(rawMetadata)
    } catch {
      return null
    }
  }

  return typeof rawMetadata === 'object' ? rawMetadata : null
}

function pickExecutionContext(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return null
  }

  return metadata.finalExecutionContext ||
    metadata.requestedExecutionContext ||
    metadata.executionContext ||
    null
}

function pickBillingPolicy(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return null
  }

  return metadata.billingPolicy || null
}

function pickResourceUsage(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return null
  }

  const direct = metadata.resourceUsage
  if (direct && typeof direct === 'object') {
    return direct
  }

  const executionContext = pickExecutionContext(metadata)
  const billingPolicy = pickBillingPolicy(metadata)

  if (!executionContext || !billingPolicy) {
    return null
  }

  return {
    mode: executionContext.mode || null,
    resourceOwner: executionContext.resourceOwner || null,
    executionTarget: executionContext.executionTarget || null,
    credentialSource: executionContext.credentialSource || null,
    chargePolicy: executionContext.chargePolicy || null,
    chargeReason: executionContext.chargeReason || null,
    chargeable: Boolean(billingPolicy.chargeable),
    estimatedCostSats: Number.isInteger(billingPolicy.estimatedCostSats) ? billingPolicy.estimatedCostSats : 0,
    billingReasonCode: billingPolicy.skipReasonCode || null,
    billingReasonDetail: billingPolicy.skipReasonDetail || null,
    canExecute: executionContext.canExecute !== false,
    blockReasonCode: executionContext.blockReasonCode || null,
    blockReasonDetail: executionContext.blockReasonDetail || null,
    providerId: executionContext.provider?.providerId || null,
    modelId: executionContext.provider?.modelId || null
  }
}

function summarizeContext(metadata) {
  const resourceUsage = pickResourceUsage(metadata)
  const trackingSource = metadata?.resourceUsage && typeof metadata.resourceUsage === 'object'
    ? 'resourceUsage'
    : resourceUsage
      ? 'legacy'
      : 'missing'

  return {
    executionMode: resourceUsage?.mode || null,
    resourceOwner: resourceUsage?.resourceOwner || null,
    executionTarget: resourceUsage?.executionTarget || null,
    credentialSource: resourceUsage?.credentialSource || null,
    billingReasonCode: resourceUsage?.billingReasonCode || null,
    hasContext: Boolean(resourceUsage),
    trackingSource
  }
}

function matchesExpectedCase(row, expectedCase) {
  if (expectedCase.operation && row.operation !== expectedCase.operation) {
    return false
  }

  if (expectedCase.status && row.status !== expectedCase.status) {
    return false
  }

  if (expectedCase.executionMode && row.executionMode !== expectedCase.executionMode) {
    return false
  }

  if (expectedCase.reasonCode && row.reasonCode !== expectedCase.reasonCode) {
    return false
  }

  return true
}

async function main() {
  const loadedFiles = loadLocalEnv()
  const { limit, expectedStatuses, expectedCases, traceSources } = parseArgs(process.argv.slice(2))
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
      where key like 'wallet-%' or key like 'wallet.%'
    `

    const chargeRows = await sql`
      select
        oc.id,
        oc.operation,
        oc.status,
        oc.reason_code as "reasonCode",
        oc.reason_detail as "reasonDetail",
        oc.estimated_cost_sats as "estimatedCostSats",
        oc.final_cost_sats as "finalCostSats",
        oc.charged_sats as "chargedSats",
        oc.payment_provider as "paymentProvider",
        oc.plan_id as "planId",
        oc.profile_id as "profileId",
        oc.created_at as "createdAt",
        oc.resolved_at as "resolvedAt",
        oc.metadata,
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

    const normalizedRows = chargeRows.map((row) => {
      const metadata = normalizeMetadata(row.metadata)
      const context = summarizeContext(metadata)

      return {
        ...row,
        metadata,
        ...context
      }
    })
    const filteredRows = traceSources.length > 0
      ? normalizedRows.filter((row) => traceSources.includes(row.trackingSource))
      : normalizedRows

    console.log(`Wallets guardadas: ${walletSettingsRow.count}`)
    console.log(`Cobros encontrados: ${filteredRows.length}`)
    if (traceSources.length > 0) {
      console.log(`Filtro de traza: ${traceSources.join(', ')}`)
    }

    const statusCounts = filteredRows.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1
      return acc
    }, {})
    const modeCounts = filteredRows.reduce((acc, row) => {
      const key = row.executionMode || 'sin-contexto'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const ownerCounts = filteredRows.reduce((acc, row) => {
      const key = row.resourceOwner || 'sin-contexto'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const trackingCounts = filteredRows.reduce((acc, row) => {
      const key = row.trackingSource || 'missing'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})

    const summary = Object.entries(statusCounts)
      .map(([status, count]) => `${status}=${count}`)
      .join(', ')
    const modeSummary = Object.entries(modeCounts)
      .map(([mode, count]) => `${mode}=${count}`)
      .join(', ')
    const ownerSummary = Object.entries(ownerCounts)
      .map(([owner, count]) => `${owner}=${count}`)
      .join(', ')
    const trackingSummary = Object.entries(trackingCounts)
      .map(([source, count]) => `${source}=${count}`)
      .join(', ')

    console.log(`Resumen por estado: ${summary || 'sin cobros registrados'}`)
    console.log(`Resumen por modo de ejecucion: ${modeSummary || 'sin contexto registrado'}`)
    console.log(`Resumen por owner del recurso: ${ownerSummary || 'sin contexto registrado'}`)
    console.log(`Resumen por fuente de traza: ${trackingSummary || 'sin traza registrada'}`)

    if (filteredRows.length > 0) {
      console.log('Ultimos cobros:')
      for (const row of filteredRows) {
        const planLabel = row.planName || row.planId || 'sin plan'
        const trackedLabel = row.costTrackingId
          ? `tracking=${row.costTrackingId} (USD ${formatUsd(row.trackedCostUsd)} / tokens ${row.trackedTokensInput ?? 0}+${row.trackedTokensOutput ?? 0})`
          : 'tracking=sin enlace'
        const contextLabel = row.hasContext
          ? `contexto=${row.executionMode}/${row.resourceOwner}/${row.credentialSource || 'none'}`
          : 'contexto=sin-contexto'
        const billingLabel = row.billingReasonCode
          ? `billing=${row.billingReasonCode}`
          : 'billing=-'
        const trackingLabel = `traza=${row.trackingSource}`

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
            contextLabel,
            trackingLabel,
            billingLabel,
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

    if (expectedCases.length > 0) {
      const missingCases = expectedCases.filter((expectedCase) => !filteredRows.some((row) => matchesExpectedCase(row, expectedCase)))
      if (missingCases.length > 0) {
        console.error(`FAIL Casos faltantes en operation_charges: ${missingCases.map((item) => item.raw).join(', ')}`)
        process.exitCode = 1
        return
      }

      console.log(`PASS Casos esperados presentes: ${expectedCases.map((item) => item.raw).join(', ')}`)
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

await main()
