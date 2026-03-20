import { and, eq } from 'drizzle-orm'
import { DateTime } from 'luxon'
import { calculateHabitStreak } from '../../utils/streaks'
import type { CostSummary, PlanRow, ProgressRow, StreakResult } from '../../shared/types/lap-api'
import { getDatabase } from './connection'
import { analyticsEvents, costTracking, planProgress, plans, profiles, settings, userSettings } from './schema'

const OPENAI_INPUT_USD_PER_MILLION = 0.15
const OPENAI_OUTPUT_USD_PER_MILLION = 0.6
const SATS_PER_USD = 1000

function db(): any {
  return getDatabase() as any
}

function now(): string {
  return DateTime.utc().toISO()!
}

function generateId(): string {
  return crypto.randomUUID()
}

function parseJsonObject(value: string): unknown {
  return JSON.parse(value)
}

function toStoredJson(value: string | Record<string, unknown> | Array<unknown> | null | undefined): unknown {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  if (typeof value !== 'string') {
    return value
  }

  return parseJsonObject(value)
}

function toJsonString(value: unknown): string | null {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value)
}

function serializePlanRow(row: typeof plans.$inferSelect): PlanRow {
  return {
    id: row.id,
    profileId: row.profileId,
    nombre: row.nombre,
    slug: row.slug,
    manifest: toJsonString(row.manifest) ?? '{}',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function serializeProgressRow(row: typeof planProgress.$inferSelect): ProgressRow {
  return {
    id: row.id,
    planId: row.planId,
    fecha: row.fecha,
    tipo: row.tipo,
    objetivoId: row.objetivoId,
    descripcion: row.descripcion,
    completado: row.completado,
    notas: toJsonString(row.notas),
    createdAt: row.createdAt
  }
}

export async function createProfile(data: string): Promise<string> {
  const id = generateId()
  const timestamp = now()

  await db().insert(profiles).values({
    id,
    data: toStoredJson(data),
    createdAt: timestamp,
    updatedAt: timestamp
  })

  return id
}

export async function getProfile(id: string) {
  const rows = await db().select().from(profiles).where(eq(profiles.id, id))
  const row = rows[0]

  if (!row) {
    return null
  }

  return {
    ...row,
    data: toJsonString(row.data) ?? '{}'
  }
}

export async function updateProfile(id: string, data: string): Promise<void> {
  await db().update(profiles)
    .set({ data: toStoredJson(data), updatedAt: now() })
    .where(eq(profiles.id, id))
}

export async function createPlan(profileId: string, nombre: string, slug: string, manifest: string): Promise<string> {
  const id = generateId()
  const timestamp = now()

  await db().insert(plans).values({
    id,
    profileId,
    nombre,
    slug,
    manifest: toStoredJson(manifest),
    createdAt: timestamp,
    updatedAt: timestamp
  })

  return id
}

export async function getPlan(id: string) {
  const rows = await db().select().from(plans).where(eq(plans.id, id))
  const row = rows[0]
  return row ? serializePlanRow(row) : null
}

export async function getPlanBySlug(slug: string) {
  const rows = await db().select().from(plans).where(eq(plans.slug, slug))
  const row = rows[0]
  return row ? serializePlanRow(row) : null
}

export async function updatePlanManifest(id: string, manifest: string): Promise<void> {
  await db().update(plans)
    .set({ manifest: toStoredJson(manifest), updatedAt: now() })
    .where(eq(plans.id, id))
}

export async function addProgress(planId: string, fecha: string, tipo: string, descripcion: string, objetivoId?: string): Promise<string> {
  const id = generateId()

  await db().insert(planProgress).values({
    id,
    planId,
    fecha,
    tipo,
    objetivoId: objetivoId ?? null,
    descripcion,
    completado: false,
    createdAt: now()
  })

  return id
}

export async function markProgressComplete(id: string, notas?: string): Promise<void> {
  await db().update(planProgress)
    .set({ completado: true, notas: toStoredJson(notas) })
    .where(eq(planProgress.id, id))
}

export async function getPlansByProfile(profileId: string): Promise<PlanRow[]> {
  const rows = await db().select().from(plans).where(eq(plans.profileId, profileId))
  return rows.map(serializePlanRow)
}

export async function getProgressByPlan(planId: string): Promise<ProgressRow[]> {
  const rows = await db().select().from(planProgress).where(eq(planProgress.planId, planId))
  return rows.map(serializeProgressRow)
}

export async function getProgressByPlanAndDate(planId: string, fecha: string): Promise<ProgressRow[]> {
  const rows = await db().select().from(planProgress)
    .where(and(eq(planProgress.planId, planId), eq(planProgress.fecha, fecha)))
  return rows.map(serializeProgressRow)
}

export async function toggleProgress(id: string): Promise<boolean> {
  const rows = await db().select().from(planProgress).where(eq(planProgress.id, id))
  const row = rows[0]
  if (!row) return false

  const newValue = !row.completado
  await db().update(planProgress)
    .set({ completado: newValue })
    .where(eq(planProgress.id, id))

  return newValue
}

export async function getHabitStreak(planId: string, todayISO: string): Promise<StreakResult> {
  return calculateHabitStreak(await getProgressByPlan(planId), todayISO)
}

export function estimateCostUsd(model: string, tokensInput: number, tokensOutput: number): number {
  if (model.startsWith('openai:')) {
    return Number(
      (((tokensInput * OPENAI_INPUT_USD_PER_MILLION) + (tokensOutput * OPENAI_OUTPUT_USD_PER_MILLION)) / 1_000_000)
        .toFixed(8)
    )
  }

  return 0
}

export function estimateCostSats(costUsd: number): number {
  if (costUsd <= 0) return 0
  return Math.max(1, Math.ceil(costUsd * SATS_PER_USD))
}

export async function trackCost(
  planId: string,
  operation: string,
  model: string,
  tokensInput: number,
  tokensOutput: number
): Promise<{ costUsd: number; costSats: number }> {
  const costUsd = estimateCostUsd(model, tokensInput, tokensOutput)
  const costSats = estimateCostSats(costUsd)

  await db().insert(costTracking).values({
    planId,
    operation,
    model,
    tokensInput,
    tokensOutput,
    costUsd,
    timestamp: now()
  })

  return { costUsd, costSats }
}

export async function getCostSummary(planId: string): Promise<CostSummary> {
  const rows = await db().select().from(costTracking).where(eq(costTracking.planId, planId))
  const operationTotals = new Map<string, { count: number; costUsd: number }>()

  const summary = (rows as Array<typeof costTracking.$inferSelect>).reduce(
    (acc: {
      tokensInput: number
      tokensOutput: number
      costUsd: number
    }, row) => {
      acc.tokensInput += row.tokensInput
      acc.tokensOutput += row.tokensOutput
      acc.costUsd += row.costUsd
      return acc
    },
    {
      tokensInput: 0,
      tokensOutput: 0,
      costUsd: 0
    }
  )

  for (const row of rows as Array<typeof costTracking.$inferSelect>) {
    const current = operationTotals.get(row.operation) ?? { count: 0, costUsd: 0 }

    current.count += 1
    current.costUsd += row.costUsd
    operationTotals.set(row.operation, current)
  }

  const roundedUsd = Number(summary.costUsd.toFixed(8))

  return {
    planId,
    tokensInput: summary.tokensInput,
    tokensOutput: summary.tokensOutput,
    costUsd: roundedUsd,
    costSats: estimateCostSats(roundedUsd),
    operations: Array.from(operationTotals.entries())
      .map(([operation, totals]) => {
        const operationUsd = Number(totals.costUsd.toFixed(8))

        return {
          operation,
          count: totals.count,
          costUsd: operationUsd,
          costSats: estimateCostSats(operationUsd)
        }
      })
      .sort((left, right) => right.count - left.count || left.operation.localeCompare(right.operation))
  }
}

export async function seedProgressFromEvents(
  planId: string,
  eventos: Array<{ semana: number; dia: string; hora: string; duracion: number; actividad: string; categoria: string; objetivoId: string }>,
  zonaHoraria: string
): Promise<number> {
  const diasMap: Record<string, number> = {
    lunes: 1,
    martes: 2,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6,
    domingo: 7
  }

  let seeded = 0
  const planStart = DateTime.now().setZone(zonaHoraria).startOf('week')

  for (const ev of eventos) {
    const weekOffset = (ev.semana - 1) * 7
    const dayOffset = (diasMap[ev.dia.toLowerCase()] ?? 1) - 1
    const fecha = planStart.plus({ days: weekOffset + dayOffset }).toISODate()!

    await db().insert(planProgress).values({
      id: generateId(),
      planId,
      fecha,
      tipo: ev.categoria === 'habito' ? 'habito' : 'tarea',
      objetivoId: ev.objetivoId || null,
      descripcion: ev.actividad,
      completado: false,
      notas: {
        hora: ev.hora,
        duracion: ev.duracion,
        categoria: ev.categoria
      },
      createdAt: now()
    })
    seeded += 1
  }

  return seeded
}

export async function getSetting(key: string): Promise<string | undefined> {
  const rows = await db().select().from(settings).where(eq(settings.key, key))
  return rows[0]?.value
}

export async function setSetting(key: string, value: string): Promise<void> {
  const rows = await db().select().from(settings).where(eq(settings.key, key))
  const existing = rows[0]

  if (existing) {
    await db().update(settings).set({ value }).where(eq(settings.key, key))
  } else {
    await db().insert(settings).values({ key, value })
  }
}

export async function upsertUserSetting(userId: string, key: string, value: string): Promise<void> {
  const rows = await db().select().from(userSettings).where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)))
  const existing = rows[0]
  const timestamp = now()

  if (existing) {
    await db().update(userSettings)
      .set({ value, updatedAt: timestamp })
      .where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)))
    return
  }

  await db().insert(userSettings).values({
    id: generateId(),
    userId,
    key,
    value,
    createdAt: timestamp,
    updatedAt: timestamp
  })
}

export async function getUserSetting(userId: string, key: string): Promise<string | undefined> {
  const rows = await db().select().from(userSettings).where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)))
  return rows[0]?.value
}

export async function deleteUserSetting(userId: string, key: string): Promise<void> {
  await db().delete(userSettings).where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)))
}

export async function trackEvent(event: string, payload?: Record<string, unknown>): Promise<void> {
  await db().insert(analyticsEvents).values({
    event,
    payload: payload ?? null,
    timestamp: now()
  })
}
