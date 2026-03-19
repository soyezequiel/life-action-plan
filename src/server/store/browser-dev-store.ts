import { DateTime } from 'luxon'
import { posix as pathPosix } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { CostSummary, PlanRow, ProgressRow } from '../../shared/types/ipc'

const DB_FILENAME = '.lap-browser-dev.sqlite'
const OPENAI_INPUT_USD_PER_MILLION = 0.15
const OPENAI_OUTPUT_USD_PER_MILLION = 0.6
const SATS_PER_USD = 1000

let db: DatabaseSync | null = null

function now(): string {
  return DateTime.utc().toISO() ?? '2026-03-19T00:00:00.000Z'
}

function generateId(): string {
  return crypto.randomUUID()
}

function getDbPath(): string {
  return pathPosix.join(process.cwd().replace(/\\/g, '/'), DB_FILENAME)
}

function getDatabase(): DatabaseSync {
  if (db) {
    return db
  }

  db = new DatabaseSync(getDbPath())
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec('PRAGMA busy_timeout = 5000;')

  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      nombre TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      manifest TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plan_progress (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS cost_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id TEXT,
      operation TEXT NOT NULL,
      model TEXT NOT NULL,
      tokens_input INTEGER NOT NULL DEFAULT 0,
      tokens_output INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      timestamp TEXT NOT NULL
    );
  `)

  return db
}

export function createBrowserProfile(data: string): string {
  const database = getDatabase()
  const id = generateId()
  const timestamp = now()

  database.prepare(`
    INSERT INTO profiles (id, data, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(id, data, timestamp, timestamp)

  return id
}

export function getBrowserProfile(id: string): { id: string; data: string } | undefined {
  const database = getDatabase()
  return database.prepare(`
    SELECT id, data
    FROM profiles
    WHERE id = ?
  `).get(id) as { id: string; data: string } | undefined
}

export function createBrowserPlan(profileId: string, nombre: string, slug: string, manifest: string): string {
  const database = getDatabase()
  const id = generateId()
  const timestamp = now()

  database.prepare(`
    INSERT INTO plans (id, profile_id, nombre, slug, manifest, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, profileId, nombre, slug, manifest, timestamp, timestamp)

  return id
}

export function getBrowserPlan(id: string): PlanRow | undefined {
  const database = getDatabase()
  const row = database.prepare(`
    SELECT
      id,
      profile_id AS profileId,
      nombre,
      slug,
      manifest,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM plans
    WHERE id = ?
  `).get(id) as PlanRow | undefined

  return row
}

export function getBrowserPlanBySlug(slug: string): PlanRow | undefined {
  const database = getDatabase()
  return database.prepare(`
    SELECT
      id,
      profile_id AS profileId,
      nombre,
      slug,
      manifest,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM plans
    WHERE slug = ?
  `).get(slug) as PlanRow | undefined
}

export function listBrowserPlans(profileId: string): PlanRow[] {
  const database = getDatabase()
  return database.prepare(`
    SELECT
      id,
      profile_id AS profileId,
      nombre,
      slug,
      manifest,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM plans
    WHERE profile_id = ?
    ORDER BY created_at ASC
  `).all(profileId) as unknown as PlanRow[]
}

export function updateBrowserPlanManifest(id: string, manifest: string): void {
  const database = getDatabase()
  database.prepare(`
    UPDATE plans
    SET manifest = ?, updated_at = ?
    WHERE id = ?
  `).run(manifest, now(), id)
}

export function addBrowserProgress(params: Omit<ProgressRow, 'id' | 'createdAt'>): string {
  const database = getDatabase()
  const id = generateId()
  const timestamp = now()

  database.prepare(`
    INSERT INTO plan_progress (id, plan_id, fecha, tipo, objetivo_id, descripcion, completado, notas, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.planId,
    params.fecha,
    params.tipo,
    params.objetivoId,
    params.descripcion,
    params.completado ? 1 : 0,
    params.notas,
    timestamp
  )

  return id
}

export function listBrowserProgressByPlan(planId: string): ProgressRow[] {
  const database = getDatabase()
  return database.prepare(`
    SELECT
      id,
      plan_id AS planId,
      fecha,
      tipo,
      objetivo_id AS objetivoId,
      descripcion,
      completado,
      notas,
      created_at AS createdAt
    FROM plan_progress
    WHERE plan_id = ?
    ORDER BY fecha ASC, created_at ASC
  `).all(planId) as unknown as ProgressRow[]
}

export function listBrowserProgressByPlanAndDate(planId: string, fecha: string): ProgressRow[] {
  const database = getDatabase()
  return database.prepare(`
    SELECT
      id,
      plan_id AS planId,
      fecha,
      tipo,
      objetivo_id AS objetivoId,
      descripcion,
      completado,
      notas,
      created_at AS createdAt
    FROM plan_progress
    WHERE plan_id = ? AND fecha = ?
    ORDER BY created_at ASC
  `).all(planId, fecha) as unknown as ProgressRow[]
}

export function toggleBrowserProgress(progressId: string): boolean | null {
  const database = getDatabase()
  const row = database.prepare(`
    SELECT completado
    FROM plan_progress
    WHERE id = ?
  `).get(progressId) as { completado: number } | undefined

  if (!row) {
    return null
  }

  const nextValue = !Boolean(row.completado)
  database.prepare(`
    UPDATE plan_progress
    SET completado = ?
    WHERE id = ?
  `).run(nextValue ? 1 : 0, progressId)

  return nextValue
}

export function getBrowserSetting(key: string): string | undefined {
  const database = getDatabase()
  const row = database.prepare(`
    SELECT value
    FROM settings
    WHERE key = ?
  `).get(key) as { value: string } | undefined

  return row?.value
}

export function setBrowserSetting(key: string, value: string): void {
  const database = getDatabase()
  const existing = getBrowserSetting(key)

  if (typeof existing === 'string') {
    database.prepare(`
      UPDATE settings
      SET value = ?
      WHERE key = ?
    `).run(value, key)
    return
  }

  database.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
  `).run(key, value)
}

export function estimateBrowserCostUsd(model: string, tokensInput: number, tokensOutput: number): number {
  if (model.startsWith('openai:')) {
    return Number(
      (((tokensInput * OPENAI_INPUT_USD_PER_MILLION) + (tokensOutput * OPENAI_OUTPUT_USD_PER_MILLION)) / 1_000_000)
        .toFixed(8)
    )
  }

  return 0
}

export function estimateBrowserCostSats(costUsd: number): number {
  if (costUsd <= 0) {
    return 0
  }

  return Math.max(1, Math.ceil(costUsd * SATS_PER_USD))
}

export function trackBrowserCost(
  planId: string,
  operation: string,
  model: string,
  tokensInput: number,
  tokensOutput: number
): CostSummary {
  const database = getDatabase()
  const costUsd = estimateBrowserCostUsd(model, tokensInput, tokensOutput)

  database.prepare(`
    INSERT INTO cost_tracking (plan_id, operation, model, tokens_input, tokens_output, cost_usd, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(planId, operation, model, tokensInput, tokensOutput, costUsd, now())

  return getBrowserCostSummary(planId)
}

export function getBrowserCostSummary(planId: string): CostSummary {
  const database = getDatabase()
  const rows = database.prepare(`
    SELECT tokens_input AS tokensInput, tokens_output AS tokensOutput, cost_usd AS costUsd
    FROM cost_tracking
    WHERE plan_id = ?
  `).all(planId) as Array<{ tokensInput: number; tokensOutput: number; costUsd: number }>

  const summary = rows.reduce(
    (acc, row) => ({
      tokensInput: acc.tokensInput + row.tokensInput,
      tokensOutput: acc.tokensOutput + row.tokensOutput,
      costUsd: acc.costUsd + row.costUsd
    }),
    {
      tokensInput: 0,
      tokensOutput: 0,
      costUsd: 0
    }
  )

  const roundedUsd = Number(summary.costUsd.toFixed(8))

  return {
    planId,
    tokensInput: summary.tokensInput,
    tokensOutput: summary.tokensOutput,
    costUsd: roundedUsd,
    costSats: estimateBrowserCostSats(roundedUsd)
  }
}
