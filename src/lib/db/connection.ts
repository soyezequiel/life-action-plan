import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

type LapDb = PostgresJsDatabase<typeof schema>

declare global {
  // eslint-disable-next-line no-var
  var __lapDatabase: LapDb | undefined
}

function createSqlClient() {
  const connectionString = process.env.DATABASE_URL?.trim()

  if (!connectionString) {
    throw new Error('DATABASE_URL_NOT_SET')
  }

  const normalizedSslMode = process.env.DATABASE_SSL?.trim().toLowerCase()
  const needsSsl = connectionString.includes('neon.tech') ||
    connectionString.includes('sslmode=require') ||
    normalizedSslMode === 'require'

  return postgres(connectionString, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    ssl: needsSsl ? 'require' : undefined
  })
}

export function getDatabase(): LapDb {
  if (!globalThis.__lapDatabase) {
    globalThis.__lapDatabase = drizzle(createSqlClient(), { schema })
  }

  return globalThis.__lapDatabase
}

export function closeDatabase(): void {
  globalThis.__lapDatabase = undefined
}
