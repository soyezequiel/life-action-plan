import { eq } from 'drizzle-orm'
import { getDatabase } from './connection'
import { profiles, plans, planProgress, settings, analyticsEvents } from './schema'
import { DateTime } from 'luxon'

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
