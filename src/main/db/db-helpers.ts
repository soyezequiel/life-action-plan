import { eq } from 'drizzle-orm'
import { getDatabase } from './connection'
import { profiles, plans, planProgress, settings, analyticsEvents, costTracking } from './schema'
import { DateTime } from 'luxon'
import type { CostSummary, StreakResult } from '../../shared/types/ipc'
import { calculateHabitStreak } from '../../utils/streaks'

const OPENAI_INPUT_USD_PER_MILLION = 0.15
const OPENAI_OUTPUT_USD_PER_MILLION = 0.6
const SATS_PER_USD = 1000

function now(): string {
  return DateTime.utc().toISO()!
}

function generateId(): string {
  return crypto.randomUUID()
}

// --- Profiles ---

export function createProfile(data: string): string {
  const db = getDatabase()
  const id = generateId()
  const timestamp = now()
  db.insert(profiles).values({
    id,
    data,
    createdAt: timestamp,
    updatedAt: timestamp
  }).run()
  return id
}

export function getProfile(id: string) {
  const db = getDatabase()
  return db.select().from(profiles).where(eq(profiles.id, id)).get()
}

export function updateProfile(id: string, data: string): void {
  const db = getDatabase()
  db.update(profiles)
    .set({ data, updatedAt: now() })
    .where(eq(profiles.id, id))
    .run()
}

// --- Plans ---

export function createPlan(profileId: string, nombre: string, slug: string, manifest: string): string {
  const db = getDatabase()
  const id = generateId()
  const timestamp = now()
  db.insert(plans).values({
    id,
    profileId,
    nombre,
    slug,
    manifest,
    createdAt: timestamp,
    updatedAt: timestamp
  }).run()
  return id
}

export function getPlan(id: string) {
  const db = getDatabase()
  return db.select().from(plans).where(eq(plans.id, id)).get()
}

export function getPlanBySlug(slug: string) {
  const db = getDatabase()
  return db.select().from(plans).where(eq(plans.slug, slug)).get()
}

export function updatePlanManifest(id: string, manifest: string): void {
  const db = getDatabase()
  db.update(plans)
    .set({ manifest, updatedAt: now() })
    .where(eq(plans.id, id))
    .run()
}

// --- Progress ---

export function addProgress(planId: string, fecha: string, tipo: string, descripcion: string, objetivoId?: string): string {
  const db = getDatabase()
  const id = generateId()
  db.insert(planProgress).values({
    id,
    planId,
    fecha,
    tipo,
    objetivoId: objetivoId ?? null,
    descripcion,
    completado: false,
    createdAt: now()
  }).run()
  return id
}

export function markProgressComplete(id: string, notas?: string): void {
  const db = getDatabase()
  db.update(planProgress)
    .set({ completado: true, notas: notas ?? null })
    .where(eq(planProgress.id, id))
    .run()
}

export function getPlansByProfile(profileId: string) {
  const db = getDatabase()
  return db.select().from(plans).where(eq(plans.profileId, profileId)).all()
}

export function getProgressByPlan(planId: string) {
  const db = getDatabase()
  return db.select().from(planProgress).where(eq(planProgress.planId, planId)).all()
}

export function getProgressByPlanAndDate(planId: string, fecha: string) {
  const db = getDatabase()
  return db.select().from(planProgress)
    .where(eq(planProgress.planId, planId))
    .all()
    .filter((row) => row.fecha === fecha)
}

export function toggleProgress(id: string): boolean {
  const db = getDatabase()
  const row = db.select().from(planProgress).where(eq(planProgress.id, id)).get()
  if (!row) return false
  const newValue = !row.completado
  db.update(planProgress)
    .set({ completado: newValue })
    .where(eq(planProgress.id, id))
    .run()
  return newValue
}

export function getHabitStreak(planId: string, todayISO: string): StreakResult {
  return calculateHabitStreak(getProgressByPlan(planId), todayISO)
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

export function trackCost(
  planId: string,
  operation: string,
  model: string,
  tokensInput: number,
  tokensOutput: number
): { costUsd: number; costSats: number } {
  const db = getDatabase()
  const costUsd = estimateCostUsd(model, tokensInput, tokensOutput)
  const costSats = estimateCostSats(costUsd)

  db.insert(costTracking).values({
    planId,
    operation,
    model,
    tokensInput,
    tokensOutput,
    costUsd,
    timestamp: now()
  }).run()

  return { costUsd, costSats }
}

export function getCostSummary(planId: string): CostSummary {
  const db = getDatabase()
  const rows = db.select().from(costTracking).where(eq(costTracking.planId, planId)).all()

  const summary = rows.reduce(
    (acc, row) => {
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

  const roundedUsd = Number(summary.costUsd.toFixed(8))

  return {
    planId,
    tokensInput: summary.tokensInput,
    tokensOutput: summary.tokensOutput,
    costUsd: roundedUsd,
    costSats: estimateCostSats(roundedUsd)
  }
}

export function seedProgressFromEvents(
  planId: string,
  eventos: Array<{ semana: number; dia: string; hora: string; duracion: number; actividad: string; categoria: string; objetivoId: string }>,
  zonaHoraria: string
): number {
  const db = getDatabase()
  const diasMap: Record<string, number> = {
    lunes: 1, martes: 2, miercoles: 3, miércoles: 3,
    jueves: 4, viernes: 5, sabado: 6, sábado: 6, domingo: 7
  }

  let seeded = 0
  const planStart = DateTime.now().setZone(zonaHoraria).startOf('week')

  for (const ev of eventos) {
    const weekOffset = (ev.semana - 1) * 7
    const dayOffset = (diasMap[ev.dia.toLowerCase()] ?? 1) - 1
    const fecha = planStart.plus({ days: weekOffset + dayOffset }).toISODate()!

    db.insert(planProgress).values({
      id: generateId(),
      planId,
      fecha,
      tipo: ev.categoria === 'habito' ? 'habito' : 'tarea',
      objetivoId: ev.objetivoId || null,
      descripcion: ev.actividad,
      completado: false,
      notas: JSON.stringify({ hora: ev.hora, duracion: ev.duracion, categoria: ev.categoria }),
      createdAt: now()
    }).run()
    seeded++
  }

  return seeded
}

// --- Settings ---

export function getSetting(key: string): string | undefined {
  const db = getDatabase()
  const row = db.select().from(settings).where(eq(settings.key, key)).get()
  return row?.value
}

export function setSetting(key: string, value: string): void {
  const db = getDatabase()
  // Upsert
  const existing = db.select().from(settings).where(eq(settings.key, key)).get()
  if (existing) {
    db.update(settings).set({ value }).where(eq(settings.key, key)).run()
  } else {
    db.insert(settings).values({ key, value }).run()
  }
}

// --- Analytics ---

export function trackEvent(event: string, payload?: Record<string, unknown>): void {
  const db = getDatabase()
  db.insert(analyticsEvents).values({
    event,
    payload: payload ? JSON.stringify(payload) : null,
    timestamp: now()
  }).run()
}
