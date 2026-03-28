import { and, eq, lt } from 'drizzle-orm'
import { DateTime } from 'luxon'

import type { InteractiveSessionStatus } from '../../shared/schemas/pipeline-interactive'
import type { PipelineRuntimeData } from '../flow/pipeline-runtime-data'
import { getDatabase } from './connection'
import { interactiveSessions } from './schema'

export interface InteractiveSessionRecord {
  id: string
  status: InteractiveSessionStatus
  currentPauseId: string | null
  runtimeSnapshot: PipelineRuntimeData
  userId: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string
}

export interface CreateInteractiveSessionInput {
  id?: string
  status?: InteractiveSessionStatus
  currentPauseId?: string | null
  runtimeSnapshot: PipelineRuntimeData
  userId?: string | null
  createdAt?: string
  updatedAt?: string
  expiresAt: string
}

export interface UpdateInteractiveSessionInput {
  status?: InteractiveSessionStatus
  currentPauseId?: string | null
  runtimeSnapshot?: PipelineRuntimeData
  userId?: string | null
  expiresAt?: string
}

function db() {
  return getDatabase()
}

function now(): string {
  return DateTime.utc().toISO() ?? new Date().toISOString()
}

function generateId(): string {
  return crypto.randomUUID()
}

function serializeInteractiveSessionRow(row: typeof interactiveSessions.$inferSelect): InteractiveSessionRecord {
  return {
    id: row.id,
    status: row.status as InteractiveSessionStatus,
    currentPauseId: row.currentPauseId,
    runtimeSnapshot: row.runtimeSnapshot as PipelineRuntimeData,
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt
  }
}

export async function createInteractiveSession(input: CreateInteractiveSessionInput): Promise<InteractiveSessionRecord> {
  const id = input.id?.trim() || generateId()
  const timestamp = input.createdAt ?? now()
  const row: typeof interactiveSessions.$inferInsert = {
    id,
    status: input.status ?? 'active',
    currentPauseId: input.currentPauseId ?? null,
    runtimeSnapshot: input.runtimeSnapshot,
    userId: input.userId?.trim() || null,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
    expiresAt: input.expiresAt
  }

  await db().insert(interactiveSessions).values(row)
  return serializeInteractiveSessionRow(row as typeof interactiveSessions.$inferSelect)
}

export async function getInteractiveSession(id: string): Promise<InteractiveSessionRecord | null> {
  const rows = await db().select().from(interactiveSessions).where(eq(interactiveSessions.id, id))
  const row = rows[0]
  return row ? serializeInteractiveSessionRow(row) : null
}

export async function updateInteractiveSession(
  id: string,
  input: UpdateInteractiveSessionInput
): Promise<InteractiveSessionRecord | null> {
  const payload: Record<string, unknown> = {
    updatedAt: now()
  }

  if (typeof input.status !== 'undefined') {
    payload.status = input.status
  }

  if (typeof input.currentPauseId !== 'undefined') {
    payload.currentPauseId = input.currentPauseId
  }

  if (typeof input.runtimeSnapshot !== 'undefined') {
    payload.runtimeSnapshot = input.runtimeSnapshot
  }

  if (typeof input.userId !== 'undefined') {
    payload.userId = input.userId?.trim() || null
  }

  if (typeof input.expiresAt !== 'undefined') {
    payload.expiresAt = input.expiresAt
  }

  await db().update(interactiveSessions).set(payload).where(eq(interactiveSessions.id, id))
  return getInteractiveSession(id)
}

export async function deleteInteractiveSession(id: string): Promise<void> {
  await db().delete(interactiveSessions).where(eq(interactiveSessions.id, id))
}

export async function listExpiredInteractiveSessions(nowIso = now()): Promise<InteractiveSessionRecord[]> {
  const rows = await db().select().from(interactiveSessions).where(
    and(
      eq(interactiveSessions.status, 'active'),
      lt(interactiveSessions.expiresAt, nowIso)
    )
  )

  return rows.map(serializeInteractiveSessionRow)
}
