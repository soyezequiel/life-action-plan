import { existsSync } from 'node:fs'
import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import readline from 'node:readline'
import postgres from 'postgres'
import { DateTime } from 'luxon'

const DEFAULT_OWNER_ID = 'backend-system'
const DEFAULT_LABEL = 'default'
const ENCRYPTION_PREFIX = 'v1'
const PROVIDER_ENV_MAP = {
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY'
}

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

function now() {
  return DateTime.utc().toISO()
}

function needsSsl(connectionString) {
  return connectionString.includes('neon.tech') ||
    connectionString.includes('sslmode=require') ||
    process.env.NODE_ENV === 'production'
}

function getEncryptionSeed() {
  return process.env.API_KEY_ENCRYPTION_SECRET?.trim()
    || process.env.DATABASE_URL?.trim()
    || null
}

function deriveKey(seed) {
  return createHash('sha256').update(seed, 'utf8').digest()
}

function encryptSecret(value) {
  const seed = getEncryptionSeed()

  if (!seed) {
    throw new Error('SECURE_STORAGE_UNAVAILABLE')
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(seed), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    ENCRYPTION_PREFIX,
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64')
  ].join(':')
}

function parseArgs(argv) {
  const parsed = {
    provider: '',
    label: DEFAULT_LABEL,
    ownerId: DEFAULT_OWNER_ID,
    apiKeyEnv: '',
    skipValidation: false
  }

  for (const arg of argv) {
    if (arg.startsWith('--provider=')) {
      parsed.provider = arg.slice('--provider='.length).trim()
    }

    if (arg.startsWith('--label=')) {
      parsed.label = arg.slice('--label='.length).trim() || DEFAULT_LABEL
    }

    if (arg.startsWith('--owner-id=')) {
      parsed.ownerId = arg.slice('--owner-id='.length).trim() || DEFAULT_OWNER_ID
    }

    if (arg.startsWith('--api-key-env=')) {
      parsed.apiKeyEnv = arg.slice('--api-key-env='.length).trim()
    }

    if (arg === '--skip-validation') {
      parsed.skipValidation = true
    }
  }

  return parsed
}

function validateProvider(provider) {
  if (provider === 'openai' || provider === 'openrouter') {
    return provider
  }

  throw new Error('INVALID_PROVIDER')
}

function promptHidden(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    })

    const onData = (char) => {
      const normalized = String(char)

      if (normalized === '\u0003') {
        process.stdout.write('\n')
        process.exit(130)
      }

      readline.cursorTo(process.stdout, 0)
      process.stdout.write(`${query}${'*'.repeat(rl.line.length)}`)
    }

    process.stdin.on('data', onData)

    rl.question(query, (answer) => {
      process.stdin.removeListener('data', onData)
      rl.close()
      process.stdout.write('\n')
      resolve(answer.trim())
    })
  })
}

async function resolveApiKey(options) {
  const envName = options.apiKeyEnv || PROVIDER_ENV_MAP[options.provider]
  const envValue = envName ? process.env[envName]?.trim() || '' : ''

  if (envValue) {
    return {
      apiKey: envValue,
      source: `env:${envName}`
    }
  }

  if (!process.stdin.isTTY) {
    throw new Error('API_KEY_MISSING')
  }

  const prompted = await promptHidden(`API key para ${options.provider}: `)

  if (!prompted) {
    throw new Error('API_KEY_MISSING')
  }

  return {
    apiKey: prompted,
    source: 'prompt'
  }
}

async function validateApiKey(provider, apiKey) {
  const request = provider === 'openrouter'
    ? {
        url: 'https://openrouter.ai/api/v1/key',
        details: async (response) => {
          const payload = await response.json().catch(() => null)
          return {
            label: payload?.data?.label ?? null,
            creditLimit: payload?.data?.limit ?? null
          }
        }
      }
    : {
        url: 'https://api.openai.com/v1/models?limit=1',
        details: async (response) => {
          const payload = await response.json().catch(() => null)
          return {
            sampleModel: payload?.data?.[0]?.id ?? null
          }
        }
      }

  try {
    const response = await fetch(request.url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    })

    if (response.ok) {
      return {
        kind: 'valid',
        validationError: null,
        details: await request.details(response)
      }
    }

    if (response.status === 401 || response.status === 403) {
      return {
        kind: 'invalid',
        validationError: `${provider.toUpperCase()}_API_KEY_REJECTED`,
        details: null
      }
    }

    return {
      kind: 'error',
      validationError: `${provider.toUpperCase()}_API_KEY_VALIDATION_FAILED_${response.status}`,
      details: null
    }
  } catch {
    return {
      kind: 'error',
      validationError: `${provider.toUpperCase()}_API_KEY_VALIDATION_FAILED`,
      details: null
    }
  }
}

async function main() {
  const loadedFiles = loadLocalEnv()
  const options = parseArgs(process.argv.slice(2))
  const provider = validateProvider(options.provider)
  const databaseUrl = process.env.DATABASE_URL?.trim() || ''

  console.log('LAP backend credential bootstrap')
  console.log(`Env cargado: ${loadedFiles.length > 0 ? loadedFiles.join(', ') : 'ninguno'}`)

  if (!databaseUrl) {
    console.error('FAIL DATABASE_URL: falta DATABASE_URL')
    process.exitCode = 1
    return
  }

  const { apiKey, source } = await resolveApiKey({ ...options, provider })
  const encryptedValue = encryptSecret(apiKey)
  const validatedAt = now()
  const validation = options.skipValidation
    ? {
        kind: 'skipped',
        validationError: null,
        details: null
      }
    : await validateApiKey(provider, apiKey)
  const status = validation.kind === 'invalid' ? 'invalid' : 'active'
  const metadata = {
    provisionedBy: 'bootstrap-script',
    source,
    provider,
    syncedAt: validatedAt,
    validation: validation.kind,
    details: validation.details ?? null
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 5,
    prepare: false,
    ssl: needsSsl(databaseUrl) ? 'require' : undefined
  })

  try {
    const [row] = await sql`
      insert into credential_registry (
        id,
        owner,
        owner_id,
        provider_id,
        secret_type,
        label,
        encrypted_value,
        status,
        last_validated_at,
        last_validation_error,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${randomUUID()},
        'backend',
        ${options.ownerId},
        ${provider},
        'api-key',
        ${options.label},
        ${encryptedValue},
        ${status},
        ${options.skipValidation ? null : validatedAt},
        ${validation.validationError},
        ${JSON.stringify(metadata)}::jsonb,
        ${validatedAt},
        ${validatedAt}
      )
      on conflict (owner, owner_id, provider_id, secret_type, label)
      do update set
        encrypted_value = excluded.encrypted_value,
        status = excluded.status,
        last_validated_at = excluded.last_validated_at,
        last_validation_error = excluded.last_validation_error,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
      returning
        id,
        owner,
        owner_id as "ownerId",
        provider_id as "providerId",
        secret_type as "secretType",
        label,
        status,
        last_validated_at as "lastValidatedAt",
        last_validation_error as "lastValidationError"
    `

    console.log(`PASS Credencial backend guardada: ${row.id}`)
    console.log(`Provider: ${row.providerId}`)
    console.log(`Owner: ${row.owner}/${row.ownerId}`)
    console.log(`Label: ${row.label}`)
    console.log(`Estado: ${row.status}`)
    console.log(`Fuente: ${source}`)

    if (options.skipValidation) {
      console.log('Validacion: omitida por --skip-validation')
    } else if (validation.kind === 'valid') {
      console.log('Validacion: OK')
    } else if (validation.kind === 'invalid') {
      console.log(`Validacion: rechazada (${validation.validationError})`)
    } else {
      console.log(`Validacion: no concluyente (${validation.validationError})`)
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

await main()
