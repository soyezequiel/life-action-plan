import { and, eq } from 'drizzle-orm'
import { DateTime } from 'luxon'
import { calculateHabitStreak } from '../../utils/streaks'
import { decryptSecret, encryptSecret } from '../auth/secret-storage'
import type {
  ChargeOperation,
  ChargeReasonCode,
  ChargeStatus,
  CostSummary,
  OperationChargeSummary,
  OperationChargeRow,
  PlanRow,
  ProgressRow,
  StreakResult
} from '../../shared/types/lap-api'
import type {
  CredentialLocator,
  CredentialOwner,
  CredentialRecordStatus,
  CredentialSecretType,
  StoredCredentialRecord
} from '../../shared/types/credential-registry'
import { DEFAULT_CREDENTIAL_LABEL } from '../../shared/schemas'
import { DEFAULT_OPENROUTER_BUILD_MODEL } from '../providers/provider-metadata'
import { getDatabase } from './connection'
import {
  analyticsEvents,
  credentialRegistry,
  costTracking,
  operationCharges,
  planProgress,
  plans,
  profiles,
  settings,
  userSettings
} from './schema'

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

interface CreateOperationChargeInput {
  profileId?: string | null
  planId?: string | null
  operation: ChargeOperation
  model?: string | null
  paymentProvider?: string | null
  status?: ChargeStatus
  estimatedCostUsd?: number
  estimatedCostSats?: number
  finalCostUsd?: number
  finalCostSats?: number
  chargedSats?: number
  reasonCode?: ChargeReasonCode | null
  reasonDetail?: string | null
  lightningInvoice?: string | null
  lightningPaymentHash?: string | null
  lightningPreimage?: string | null
  providerReference?: string | null
  metadata?: string | Record<string, unknown> | Array<unknown> | null
  resolvedAt?: string | null
}

interface UpdateOperationChargeInput {
  profileId?: string | null
  planId?: string | null
  operation?: ChargeOperation
  model?: string | null
  paymentProvider?: string | null
  status?: ChargeStatus
  estimatedCostUsd?: number
  estimatedCostSats?: number
  finalCostUsd?: number
  finalCostSats?: number
  chargedSats?: number
  reasonCode?: ChargeReasonCode | null
  reasonDetail?: string | null
  lightningInvoice?: string | null
  lightningPaymentHash?: string | null
  lightningPreimage?: string | null
  providerReference?: string | null
  metadata?: string | Record<string, unknown> | Array<unknown> | null
  resolvedAt?: string | null
}

interface UpsertCredentialRecordInput {
  owner: CredentialOwner
  ownerId: string
  providerId: string
  secretType: CredentialSecretType
  label?: string | null
  secretValue: string
  status?: CredentialRecordStatus
  metadata?: string | Record<string, unknown> | Array<unknown> | null
  lastValidatedAt?: string | null
  lastValidationError?: string | null
}

interface UpdateCredentialRecordInput {
  label?: string | null
  secretValue?: string
  status?: CredentialRecordStatus
  metadata?: string | Record<string, unknown> | Array<unknown> | null
  lastValidatedAt?: string | null
  lastValidationError?: string | null
}

interface ListCredentialRecordsFilters {
  owner?: CredentialOwner
  ownerId?: string
  providerId?: string
  secretType?: CredentialSecretType
  status?: CredentialRecordStatus
  label?: string
}

function serializeOperationChargeRow(row: typeof operationCharges.$inferSelect): OperationChargeRow {
  return {
    id: row.id,
    profileId: row.profileId,
    planId: row.planId,
    operation: row.operation as ChargeOperation,
    model: row.model,
    paymentProvider: row.paymentProvider,
    status: row.status as ChargeStatus,
    estimatedCostUsd: row.estimatedCostUsd,
    estimatedCostSats: row.estimatedCostSats,
    finalCostUsd: row.finalCostUsd,
    finalCostSats: row.finalCostSats,
    chargedSats: row.chargedSats,
    reasonCode: row.reasonCode as ChargeReasonCode | null,
    reasonDetail: row.reasonDetail,
    lightningInvoice: row.lightningInvoice,
    lightningPaymentHash: row.lightningPaymentHash,
    lightningPreimage: row.lightningPreimage,
    providerReference: row.providerReference,
    metadata: toJsonString(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt
  }
}

function normalizeCredentialLabel(label: string | null | undefined): string {
  const normalized = label?.trim() || ''
  return normalized || DEFAULT_CREDENTIAL_LABEL
}

function normalizeSecretValue(secretValue: string): string {
  const normalized = secretValue.trim()

  if (!normalized) {
    throw new Error('EMPTY_SECRET_VALUE')
  }

  return normalized
}

function serializeCredentialRecordRow(row: typeof credentialRegistry.$inferSelect): StoredCredentialRecord {
  return {
    id: row.id,
    owner: row.owner as CredentialOwner,
    ownerId: row.ownerId,
    providerId: row.providerId,
    secretType: row.secretType as CredentialSecretType,
    label: row.label,
    encryptedValue: row.encryptedValue,
    status: row.status as CredentialRecordStatus,
    lastValidatedAt: row.lastValidatedAt,
    lastValidationError: row.lastValidationError,
    metadata: toJsonString(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function serializeOperationChargeSummary(row: typeof operationCharges.$inferSelect): OperationChargeSummary {
  return {
    chargeId: row.id,
    status: row.status as ChargeStatus,
    estimatedCostUsd: row.estimatedCostUsd,
    estimatedCostSats: row.estimatedCostSats,
    finalCostUsd: row.finalCostUsd,
    finalCostSats: row.finalCostSats,
    chargedSats: row.chargedSats,
    reasonCode: row.reasonCode as ChargeReasonCode | null,
    reasonDetail: row.reasonDetail,
    paymentProvider: row.paymentProvider
  }
}

function resolveChargeCompletionTimestamp(status: ChargeStatus, explicitResolvedAt?: string | null): string | null {
  if (typeof explicitResolvedAt !== 'undefined') {
    return explicitResolvedAt
  }

  return status === 'pending' ? null : now()
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

export async function createOperationCharge(input: CreateOperationChargeInput): Promise<OperationChargeRow> {
  const id = generateId()
  const timestamp = now()
  const status = input.status ?? 'pending'
  const resolvedAt = resolveChargeCompletionTimestamp(status, input.resolvedAt)

  const row: typeof operationCharges.$inferSelect = {
    id,
    profileId: input.profileId ?? null,
    planId: input.planId ?? null,
    operation: input.operation,
    model: input.model ?? null,
    paymentProvider: input.paymentProvider ?? null,
    status,
    estimatedCostUsd: input.estimatedCostUsd ?? 0,
    estimatedCostSats: input.estimatedCostSats ?? 0,
    finalCostUsd: input.finalCostUsd ?? 0,
    finalCostSats: input.finalCostSats ?? 0,
    chargedSats: input.chargedSats ?? 0,
    reasonCode: input.reasonCode ?? null,
    reasonDetail: input.reasonDetail ?? null,
    lightningInvoice: input.lightningInvoice ?? null,
    lightningPaymentHash: input.lightningPaymentHash ?? null,
    lightningPreimage: input.lightningPreimage ?? null,
    providerReference: input.providerReference ?? null,
    metadata: toStoredJson(input.metadata),
    createdAt: timestamp,
    updatedAt: timestamp,
    resolvedAt
  }

  await db().insert(operationCharges).values(row)
  return serializeOperationChargeRow(row)
}

export async function getOperationCharge(id: string): Promise<OperationChargeRow | null> {
  const rows = await db().select().from(operationCharges).where(eq(operationCharges.id, id))
  const row = rows[0]
  return row ? serializeOperationChargeRow(row) : null
}

export async function listOperationChargesByPlan(planId: string): Promise<OperationChargeRow[]> {
  const rows = await db().select().from(operationCharges).where(eq(operationCharges.planId, planId))
  return rows.map(serializeOperationChargeRow)
}

export async function updateOperationCharge(
  id: string,
  input: UpdateOperationChargeInput
): Promise<OperationChargeRow | null> {
  const nextValues: Partial<typeof operationCharges.$inferInsert> = {
    updatedAt: now()
  }

  if (typeof input.profileId !== 'undefined') {
    nextValues.profileId = input.profileId
  }

  if (typeof input.planId !== 'undefined') {
    nextValues.planId = input.planId
  }

  if (typeof input.operation !== 'undefined') {
    nextValues.operation = input.operation
  }

  if (typeof input.model !== 'undefined') {
    nextValues.model = input.model
  }

  if (typeof input.paymentProvider !== 'undefined') {
    nextValues.paymentProvider = input.paymentProvider
  }

  if (typeof input.status !== 'undefined') {
    nextValues.status = input.status
    nextValues.resolvedAt = resolveChargeCompletionTimestamp(input.status, input.resolvedAt)
  } else if (typeof input.resolvedAt !== 'undefined') {
    nextValues.resolvedAt = input.resolvedAt
  }

  if (typeof input.estimatedCostUsd !== 'undefined') {
    nextValues.estimatedCostUsd = input.estimatedCostUsd
  }

  if (typeof input.estimatedCostSats !== 'undefined') {
    nextValues.estimatedCostSats = input.estimatedCostSats
  }

  if (typeof input.finalCostUsd !== 'undefined') {
    nextValues.finalCostUsd = input.finalCostUsd
  }

  if (typeof input.finalCostSats !== 'undefined') {
    nextValues.finalCostSats = input.finalCostSats
  }

  if (typeof input.chargedSats !== 'undefined') {
    nextValues.chargedSats = input.chargedSats
  }

  if (typeof input.reasonCode !== 'undefined') {
    nextValues.reasonCode = input.reasonCode
  }

  if (typeof input.reasonDetail !== 'undefined') {
    nextValues.reasonDetail = input.reasonDetail
  }

  if (typeof input.lightningInvoice !== 'undefined') {
    nextValues.lightningInvoice = input.lightningInvoice
  }

  if (typeof input.lightningPaymentHash !== 'undefined') {
    nextValues.lightningPaymentHash = input.lightningPaymentHash
  }

  if (typeof input.lightningPreimage !== 'undefined') {
    nextValues.lightningPreimage = input.lightningPreimage
  }

  if (typeof input.providerReference !== 'undefined') {
    nextValues.providerReference = input.providerReference
  }

  if (typeof input.metadata !== 'undefined') {
    nextValues.metadata = toStoredJson(input.metadata)
  }

  await db().update(operationCharges)
    .set(nextValues)
    .where(eq(operationCharges.id, id))

  return getOperationCharge(id)
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
  if (model.startsWith('openai:') || model === DEFAULT_OPENROUTER_BUILD_MODEL) {
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
  tokensOutput: number,
  chargeId?: string | null
): Promise<{ costUsd: number; costSats: number }> {
  const costUsd = estimateCostUsd(model, tokensInput, tokensOutput)
  const costSats = estimateCostSats(costUsd)

  await db().insert(costTracking).values({
    chargeId: chargeId ?? null,
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
  const chargeRows = await db().select().from(operationCharges).where(eq(operationCharges.planId, planId))
  const operationTotals = new Map<string, { count: number; costUsd: number }>()
  const latestChargesByOperation = new Map<string, typeof operationCharges.$inferSelect>()

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

  for (const chargeRow of chargeRows as Array<typeof operationCharges.$inferSelect>) {
    const current = latestChargesByOperation.get(chargeRow.operation)

    if (!current || chargeRow.updatedAt > current.updatedAt) {
      latestChargesByOperation.set(chargeRow.operation, chargeRow)
    }
  }

  const roundedUsd = Number(summary.costUsd.toFixed(8))
  const latestChargeRow = (chargeRows as Array<typeof operationCharges.$inferSelect>)
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
  const chargedSats = (chargeRows as Array<typeof operationCharges.$inferSelect>).reduce(
    (total, row) => total + row.chargedSats,
    0
  )

  return {
    planId,
    tokensInput: summary.tokensInput,
    tokensOutput: summary.tokensOutput,
    costUsd: roundedUsd,
    costSats: estimateCostSats(roundedUsd),
    chargedSats,
    operations: Array.from(operationTotals.entries())
      .map(([operation, totals]) => {
        const operationUsd = Number(totals.costUsd.toFixed(8))
        const latestCharge = latestChargesByOperation.get(operation)

        return {
          operation,
          count: totals.count,
          costUsd: operationUsd,
          costSats: estimateCostSats(operationUsd),
          estimatedChargeSats: latestCharge?.estimatedCostSats ?? 0,
          chargedSats: latestCharge?.chargedSats ?? 0,
          latestChargeStatus: latestCharge?.status as ChargeStatus | null ?? null,
          latestChargeReasonCode: latestCharge?.reasonCode as ChargeReasonCode | null ?? null
        }
      })
      .sort((left, right) => right.count - left.count || left.operation.localeCompare(right.operation)),
    latestCharge: latestChargeRow ? serializeOperationChargeSummary(latestChargeRow) : null
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

export async function getCredentialRecord(id: string): Promise<StoredCredentialRecord | null> {
  const rows = await db().select().from(credentialRegistry).where(eq(credentialRegistry.id, id))
  const row = rows[0]
  return row ? serializeCredentialRecordRow(row) : null
}

export async function findCredentialRecord(locator: CredentialLocator): Promise<StoredCredentialRecord | null> {
  const normalizedLabel = normalizeCredentialLabel(locator.label)
  const rows = await db().select().from(credentialRegistry).where(and(
    eq(credentialRegistry.owner, locator.owner),
    eq(credentialRegistry.ownerId, locator.ownerId),
    eq(credentialRegistry.providerId, locator.providerId),
    eq(credentialRegistry.secretType, locator.secretType),
    eq(credentialRegistry.label, normalizedLabel)
  ))
  const row = rows[0]
  return row ? serializeCredentialRecordRow(row) : null
}

export async function listCredentialRecords(filters: ListCredentialRecordsFilters = {}): Promise<StoredCredentialRecord[]> {
  const conditions = []

  if (filters.owner) {
    conditions.push(eq(credentialRegistry.owner, filters.owner))
  }

  if (filters.ownerId) {
    conditions.push(eq(credentialRegistry.ownerId, filters.ownerId))
  }

  if (filters.providerId) {
    conditions.push(eq(credentialRegistry.providerId, filters.providerId))
  }

  if (filters.secretType) {
    conditions.push(eq(credentialRegistry.secretType, filters.secretType))
  }

  if (filters.status) {
    conditions.push(eq(credentialRegistry.status, filters.status))
  }

  if (typeof filters.label !== 'undefined') {
    conditions.push(eq(credentialRegistry.label, normalizeCredentialLabel(filters.label)))
  }

  const query = db().select().from(credentialRegistry)
  const rows = conditions.length > 0
    ? await query.where(conditions.length === 1 ? conditions[0] : and(...conditions))
    : await query

  return rows.map(serializeCredentialRecordRow)
}

export async function upsertCredentialRecord(input: UpsertCredentialRecordInput): Promise<StoredCredentialRecord> {
  const locator: CredentialLocator = {
    owner: input.owner,
    ownerId: input.ownerId.trim(),
    providerId: input.providerId.trim(),
    secretType: input.secretType,
    label: normalizeCredentialLabel(input.label)
  }
  const existing = await findCredentialRecord(locator)
  const timestamp = now()
  const encryptedValue = encryptSecret(normalizeSecretValue(input.secretValue))

  if (existing) {
    await db().update(credentialRegistry)
      .set({
        encryptedValue,
        status: input.status ?? existing.status,
        metadata: typeof input.metadata !== 'undefined' ? toStoredJson(input.metadata) : toStoredJson(existing.metadata),
        lastValidatedAt: typeof input.lastValidatedAt !== 'undefined' ? input.lastValidatedAt : existing.lastValidatedAt,
        lastValidationError: typeof input.lastValidationError !== 'undefined'
          ? input.lastValidationError
          : existing.lastValidationError,
        updatedAt: timestamp
      })
      .where(eq(credentialRegistry.id, existing.id))

    return (await getCredentialRecord(existing.id))!
  }

  const row: typeof credentialRegistry.$inferSelect = {
    id: generateId(),
    owner: locator.owner,
    ownerId: locator.ownerId,
    providerId: locator.providerId,
    secretType: locator.secretType,
    label: locator.label,
    encryptedValue,
    status: input.status ?? 'active',
    lastValidatedAt: input.lastValidatedAt ?? null,
    lastValidationError: input.lastValidationError ?? null,
    metadata: toStoredJson(input.metadata),
    createdAt: timestamp,
    updatedAt: timestamp
  }

  await db().insert(credentialRegistry).values(row)
  return serializeCredentialRecordRow(row)
}

export async function updateCredentialRecord(
  id: string,
  input: UpdateCredentialRecordInput
): Promise<StoredCredentialRecord | null> {
  const nextValues: Partial<typeof credentialRegistry.$inferInsert> = {
    updatedAt: now()
  }

  if (typeof input.label !== 'undefined') {
    nextValues.label = normalizeCredentialLabel(input.label)
  }

  if (typeof input.secretValue !== 'undefined') {
    nextValues.encryptedValue = encryptSecret(normalizeSecretValue(input.secretValue))
  }

  if (typeof input.status !== 'undefined') {
    nextValues.status = input.status
  }

  if (typeof input.metadata !== 'undefined') {
    nextValues.metadata = toStoredJson(input.metadata)
  }

  if (typeof input.lastValidatedAt !== 'undefined') {
    nextValues.lastValidatedAt = input.lastValidatedAt
  }

  if (typeof input.lastValidationError !== 'undefined') {
    nextValues.lastValidationError = input.lastValidationError
  }

  await db().update(credentialRegistry)
    .set(nextValues)
    .where(eq(credentialRegistry.id, id))

  return getCredentialRecord(id)
}

export async function setCredentialRecordStatus(
  id: string,
  status: CredentialRecordStatus
): Promise<StoredCredentialRecord | null> {
  return updateCredentialRecord(id, { status })
}

export async function recordCredentialValidationResult(
  id: string,
  status: CredentialRecordStatus,
  validationError: string | null = null
): Promise<StoredCredentialRecord | null> {
  return updateCredentialRecord(id, {
    status,
    lastValidatedAt: now(),
    lastValidationError: validationError
  })
}

export async function getCredentialSecretValue(id: string): Promise<string | null> {
  const record = await getCredentialRecord(id)

  if (!record) {
    return null
  }

  return decryptSecret(record.encryptedValue)
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
