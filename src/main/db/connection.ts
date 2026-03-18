import Database from 'better-sqlite3'
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { app } from 'electron'
import * as path from 'path'

let db: BetterSQLite3Database<typeof schema> | null = null
let sqlite: Database.Database | null = null

export function getDbPath(): string {
  const userDataPath = app.getPath('userData')
  // Use POSIX separators internally per CLAUDE.md rule #4
  return path.posix.join(
    userDataPath.split(path.sep).join('/'),
    'lap.sqlite'
  )
}

export function initDatabase(): BetterSQLite3Database<typeof schema> {
  if (db) return db

  const dbPath = getDbPath()
  console.log(`[LAP] Initializing database at: ${dbPath}`)

  sqlite = new Database(dbPath)

  // WAL mode for concurrent read access (plan rule #5)
  sqlite.pragma('journal_mode = WAL')

  // Boot-time integrity check (plan rule Q1)
  const integrityResult = sqlite.pragma('integrity_check')
  if (Array.isArray(integrityResult) && integrityResult[0]?.integrity_check !== 'ok') {
    console.error('[LAP] Database integrity check FAILED:', integrityResult)
    // TODO: Restore from backup in production
  }

  // Performance pragmas
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')

  db = drizzle(sqlite, { schema })

  // Create tables if they don't exist
  createTablesIfNeeded(sqlite)

  return db
}

export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (!db) {
    throw new Error('[LAP] Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close()
    sqlite = null
    db = null
    console.log('[LAP] Database closed.')
  }
}

function createTablesIfNeeded(sqliteDb: Database.Database): void {
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id),
      nombre TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      manifest TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plan_progress (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES plans(id),
      fecha TEXT NOT NULL,
      tipo TEXT NOT NULL,
      objetivo_id TEXT,
      descripcion TEXT NOT NULL,
      completado INTEGER NOT NULL DEFAULT 0,
      notas TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
      payload TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cost_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id TEXT REFERENCES plans(id),
      operation TEXT NOT NULL,
      model TEXT NOT NULL,
      tokens_input INTEGER NOT NULL DEFAULT 0,
      tokens_output INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      timestamp TEXT NOT NULL
    );
  `)
}
