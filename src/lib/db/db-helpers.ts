/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, count, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { DateTime } from 'luxon'
import { extractEmailFromLoginIdentifier, normalizeLoginIdentifier } from '../auth/login-identifier'
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
import { extractResourceUsageFromMetadata } from '../runtime/resource-usage-summary'
import { DEFAULT_USER_ID } from '../auth/user-settings'
import { getDatabase } from './connection'
import {
  analyticsEvents,
  authLoginGuards,
  credentialRegistry,
  costTracking,
  encryptedKeyVaults,
  operationCharges,
  planProgress,
  plans,
  profiles,
  settings,
  sessions,
  users,
  userSettings
} from './schema'
import type { SimTree } from '../../shared/schemas/simulation-tree'
import { simTreeSchema } from '../../shared/schemas/simulation-tree'

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

interface CreateUserInput {
  username: string
  email?: string | null
  passwordHash: string
  hashAlgorithm?: string
  name?: string | null
}

interface CreateSessionRecordInput {
  sessionToken: string
  userId: string
  expires: string
  id?: string
  tokenHash?: string
}

interface UpsertAuthLoginGuardInput {
  scope: string
  keyHash: string
  attempts: number
  windowStartedAt: string
  lastAttemptAt: string
  blockedUntil?: string | null
}

interface UpsertEncryptedKeyVaultInput {
  userId: string
  encryptedBlob: string
  salt: string
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

function serializeUserRow(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.passwordHash,
    hashAlgorithm: row.hashAlgorithm,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt
  }
}

function serializeSessionRow(row: typeof sessions.$inferSelect) {
  return {
    sessionToken: row.sessionToken,
    userId: row.userId,
    expires: row.expires,
    createdAt: row.createdAt
  }
}

function serializeAuthLoginGuardRow(row: typeof authLoginGuards.$inferSelect) {
  return {
    id: row.id,
    scope: row.scope,
    keyHash: row.keyHash,
    attempts: row.attempts,
    windowStartedAt: row.windowStartedAt,
    lastAttemptAt: row.lastAttemptAt,
    blockedUntil: row.blockedUntil,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function serializeEncryptedKeyVaultRow(row: typeof encryptedKeyVaults.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    encryptedBlob: row.encryptedBlob,
    salt: row.salt,
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
    paymentProvider: row.paymentProvider,
    resourceUsage: extractResourceUsageFromMetadata(row.metadata)
  }
}

function resolveChargeCompletionTimestamp(status: ChargeStatus, explicitResolvedAt?: string | null): string | null {
  if (typeof explicitResolvedAt !== 'undefined') {
    return explicitResolvedAt
  }

  return status === 'pending' ? null : now()
}

export async function createProfile(data: string, userId?: string | null): Promise<string> {
  const id = generateId()
  const timestamp = now()

  await db().insert(profiles).values({
    id,
    userId: userId?.trim() || null,
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

export async function getLatestProfileIdForUser(userId: string | null): Promise<string | null> {
  const query = db()
    .select({
      id: profiles.id,
      updatedAt: profiles.updatedAt,
      planCount: count(plans.id)
    })
    .from(profiles)
    .leftJoin(plans, eq(plans.profileId, profiles.id))

  if (userId) {
    query.where(eq(profiles.userId, userId))
  } else {
    query.where(isNull(profiles.userId))
  }

  const rows = await query
    .groupBy(profiles.id, profiles.updatedAt)
    .orderBy(
      desc(count(plans.id)), // Prioritize profiles with plans
      desc(profiles.updatedAt) // Then by most recently updated
    )
    .limit(1)

  return rows[0]?.id ?? null
}


export async function createUser(input: CreateUserInput) {
  const timestamp = now()
  const row: typeof users.$inferInsert = {
    id: generateId(),
    name: input.name?.trim() || null,
    username: normalizeLoginIdentifier(input.username),
    email: input.email?.trim().toLowerCase() || null,
    passwordHash: input.passwordHash,
    hashAlgorithm: input.hashAlgorithm?.trim() || 'argon2id',
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null
  }

  await db().insert(users).values(row)
  return serializeUserRow(row as typeof users.$inferSelect)
}

export async function getUserById(id: string) {
  const rows = await db().select().from(users).where(eq(users.id, id))
  const row = rows[0]
  return row ? serializeUserRow(row) : null
}

export async function getUserByUsername(username: string) {
  const normalizedUsername = normalizeLoginIdentifier(username)
  const rows = await db().select().from(users).where(eq(users.username, normalizedUsername))
  const row = rows[0]
  return row ? serializeUserRow(row) : null
}

export async function getUserByLoginIdentifier(identifier: string) {
  const normalizedIdentifier = normalizeLoginIdentifier(identifier)
  const normalizedEmail = extractEmailFromLoginIdentifier(normalizedIdentifier)
  const condition = normalizedEmail
    ? or(eq(users.username, normalizedIdentifier), eq(users.email, normalizedEmail))
    : eq(users.username, normalizedIdentifier)
  const rows = await db().select().from(users).where(condition)
  const row = rows[0]
  return row ? serializeUserRow(row) : null
}

export async function deleteUserAccountCascade(userId: string): Promise<void> {
  await db().transaction(async (tx: any) => {
    const profileRows = await tx.select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.userId, userId))
    const profileIds = (profileRows as Array<{ id: string }>).map((row) => row.id)
    const planRows = profileIds.length > 0
      ? await tx.select({ id: plans.id })
        .from(plans)
        .where(inArray(plans.profileId, profileIds))
      : []
    const planIds = (planRows as Array<{ id: string }>).map((row) => row.id)

    if (planIds.length > 0) {
      await tx.delete(costTracking).where(inArray(costTracking.planId, planIds))
    }

    const chargeConditions = []

    if (profileIds.length > 0) {
      chargeConditions.push(inArray(operationCharges.profileId, profileIds))
    }

    if (planIds.length > 0) {
      chargeConditions.push(inArray(operationCharges.planId, planIds))
    }

    if (chargeConditions.length === 1) {
      await tx.delete(operationCharges).where(chargeConditions[0]!)
    } else if (chargeConditions.length > 1) {
      await tx.delete(operationCharges).where(or(...chargeConditions))
    }

    await tx.delete(userSettings).where(eq(userSettings.userId, userId))
    await tx.delete(credentialRegistry).where(and(
      eq(credentialRegistry.owner, 'user'),
      eq(credentialRegistry.ownerId, userId)
    ))

    if (profileIds.length > 0) {
      await tx.delete(profiles).where(inArray(profiles.id, profileIds))
    }

    await tx.delete(users).where(eq(users.id, userId))
  })
}

export async function claimAnonymousLocalData(userId: string, localProfileId: string): Promise<boolean> {
  let claimed = false
  const timestamp = now()

  await db().transaction(async (tx: any) => {
    const anonymousProfileRows = await tx.select()
      .from(profiles)
      .where(and(eq(profiles.id, localProfileId), isNull(profiles.userId)))
    const anonymousProfile = anonymousProfileRows[0] as typeof profiles.$inferSelect | undefined

    if (!anonymousProfile) {
      const ownedProfileRows = await tx.select()
        .from(profiles)
        .where(and(eq(profiles.id, localProfileId), eq(profiles.userId, userId)))
      claimed = Boolean(ownedProfileRows[0])
      return
    }

    claimed = true

    await tx.update(profiles)
      .set({
        userId,
        updatedAt: timestamp
      })
      .where(eq(profiles.id, localProfileId))

    const localSettingsRows = await tx.select()
      .from(userSettings)
      .where(eq(userSettings.userId, DEFAULT_USER_ID))

    for (const localSetting of localSettingsRows as Array<typeof userSettings.$inferSelect>) {
      const existingRows = await tx.select()
        .from(userSettings)
        .where(and(eq(userSettings.userId, userId), eq(userSettings.key, localSetting.key)))
      const existing = existingRows[0] as typeof userSettings.$inferSelect | undefined

      if (existing) {
        await tx.update(userSettings)
          .set({
            value: localSetting.value,
            updatedAt: timestamp
          })
          .where(eq(userSettings.id, existing.id))

        await tx.delete(userSettings).where(eq(userSettings.id, localSetting.id))
        continue
      }

      await tx.update(userSettings)
        .set({
          userId,
          updatedAt: timestamp
        })
        .where(eq(userSettings.id, localSetting.id))
    }

    const localCredentialRows = await tx.select()
      .from(credentialRegistry)
      .where(and(eq(credentialRegistry.owner, 'user'), eq(credentialRegistry.ownerId, DEFAULT_USER_ID)))

    for (const localCredential of localCredentialRows as Array<typeof credentialRegistry.$inferSelect>) {
      const existingRows = await tx.select()
        .from(credentialRegistry)
        .where(and(
          eq(credentialRegistry.owner, localCredential.owner),
          eq(credentialRegistry.ownerId, userId),
          eq(credentialRegistry.providerId, localCredential.providerId),
          eq(credentialRegistry.secretType, localCredential.secretType),
          eq(credentialRegistry.label, localCredential.label)
        ))
      const existing = existingRows[0] as typeof credentialRegistry.$inferSelect | undefined

      if (existing) {
        await tx.update(credentialRegistry)
          .set({
            encryptedValue: localCredential.encryptedValue,
            status: localCredential.status,
            lastValidatedAt: localCredential.lastValidatedAt,
            lastValidationError: localCredential.lastValidationError,
            metadata: localCredential.metadata,
            updatedAt: timestamp
          })
          .where(eq(credentialRegistry.id, existing.id))

        await tx.delete(credentialRegistry).where(eq(credentialRegistry.id, localCredential.id))
        continue
      }

      await tx.update(credentialRegistry)
        .set({
          ownerId: userId,
          updatedAt: timestamp
        })
        .where(eq(credentialRegistry.id, localCredential.id))
    }
  })

  return claimed
}

export async function createSessionRecord(input: CreateSessionRecordInput) {
  const row: typeof sessions.$inferInsert = {
    sessionToken: input.sessionToken,
    userId: input.userId,
    expires: new Date(input.expires),
    createdAt: now()
  }

  await db().insert(sessions).values(row)
  return serializeSessionRow(row as typeof sessions.$inferSelect)
}

export async function getAuthLoginGuard(scope: string, keyHash: string) {
  const rows = await db().select().from(authLoginGuards).where(and(
    eq(authLoginGuards.scope, scope),
    eq(authLoginGuards.keyHash, keyHash)
  ))
  const row = rows[0]
  return row ? serializeAuthLoginGuardRow(row) : null
}

export async function upsertAuthLoginGuard(input: UpsertAuthLoginGuardInput) {
  const existing = await getAuthLoginGuard(input.scope, input.keyHash)
  const timestamp = now()

  if (existing) {
    await db().update(authLoginGuards)
      .set({
        attempts: input.attempts,
        windowStartedAt: input.windowStartedAt,
        lastAttemptAt: input.lastAttemptAt,
        blockedUntil: typeof input.blockedUntil === 'undefined' ? existing.blockedUntil : input.blockedUntil,
        updatedAt: timestamp
      })
      .where(eq(authLoginGuards.id, existing.id))

    return (await getAuthLoginGuard(input.scope, input.keyHash))!
  }

  const row: typeof authLoginGuards.$inferInsert = {
    id: generateId(),
    scope: input.scope,
    keyHash: input.keyHash,
    attempts: input.attempts,
    windowStartedAt: input.windowStartedAt,
    lastAttemptAt: input.lastAttemptAt,
    blockedUntil: input.blockedUntil ?? null,
    createdAt: timestamp,
    updatedAt: timestamp
  }

  await db().insert(authLoginGuards).values(row)
  return serializeAuthLoginGuardRow(row as typeof authLoginGuards.$inferSelect)
}

export async function deleteAuthLoginGuard(scope: string, keyHash: string): Promise<void> {
  await db().delete(authLoginGuards).where(and(
    eq(authLoginGuards.scope, scope),
    eq(authLoginGuards.keyHash, keyHash)
  ))
}

export async function getSessionRecordByToken(sessionToken: string) {
  const rows = await db().select().from(sessions).where(eq(sessions.sessionToken, sessionToken))
  const row = rows[0]
  return row ? serializeSessionRow(row as typeof sessions.$inferSelect) : null
}

export async function deleteSessionRecordByToken(sessionToken: string): Promise<void> {
  await db().delete(sessions).where(eq(sessions.sessionToken, sessionToken))
}

export async function deleteSessionRecordsByUserId(userId: string): Promise<void> {
  await db().delete(sessions).where(eq(sessions.userId, userId))
}

export async function getEncryptedKeyVaultByUserId(userId: string) {
  const rows = await db().select().from(encryptedKeyVaults).where(eq(encryptedKeyVaults.userId, userId))
  const row = rows[0]
  return row ? serializeEncryptedKeyVaultRow(row) : null
}

export async function upsertEncryptedKeyVault(input: UpsertEncryptedKeyVaultInput) {
  const timestamp = now()
  const existing = await getEncryptedKeyVaultByUserId(input.userId)

  if (existing) {
    await db().update(encryptedKeyVaults)
      .set({
        encryptedBlob: input.encryptedBlob,
        salt: input.salt,
        updatedAt: timestamp
      })
      .where(eq(encryptedKeyVaults.userId, input.userId))

    return (await getEncryptedKeyVaultByUserId(input.userId))!
  }

  const row: typeof encryptedKeyVaults.$inferInsert = {
    id: generateId(),
    userId: input.userId,
    encryptedBlob: input.encryptedBlob,
    salt: input.salt,
    createdAt: timestamp,
    updatedAt: timestamp
  }

  await db().insert(encryptedKeyVaults).values(row)
  return serializeEncryptedKeyVaultRow(row as typeof encryptedKeyVaults.$inferSelect)
}

export async function createPlan(
  profileId: string,
  nombre: string,
  slug: string,
  manifest: string,
  reasoningTrace?: unknown
): Promise<string> {
  const id = generateId()
  const timestamp = now()

  await db().insert(plans).values({
    id,
    profileId,
    nombre,
    slug,
    manifest: toStoredJson(manifest),
    reasoningTrace: toStoredJson(
      reasoningTrace as string | Record<string, unknown> | Array<unknown> | null | undefined
    ),
    createdAt: timestamp,
    updatedAt: timestamp
  })

  // Bump profile updatedAt to mark it as the most active
  await db()
    .update(profiles)
    .set({ updatedAt: timestamp })
    .where(eq(profiles.id, profileId))

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

export async function getWeeklyProgressSummary(planId: string, days: number = 5): Promise<Array<{ date: string, percentage: number }>> {
  const startDate = DateTime.now().minus({ days }).toISODate()!

  const rows = await db()
    .select({
      fecha: planProgress.fecha,
      completedCount: sql<number>`count(case when ${planProgress.completado} then 1 end)`,
      totalCount: count(planProgress.id),
    })
    .from(planProgress)
    .where(and(
      eq(planProgress.planId, planId),
      sql`${planProgress.fecha} >= ${startDate}`
    ))
    .groupBy(planProgress.fecha)
    .orderBy(planProgress.fecha)

  return rows.map((row: any) => ({
    date: row.fecha,
    percentage: row.totalCount > 0 ? Math.round((Number(row.completedCount) / Number(row.totalCount)) * 100) : 0
  }))
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
  let seeded = 0
  const today = DateTime.now().setZone(zonaHoraria).startOf('day')

  for (const ev of eventos) {
    const fecha = resolveProgressSeedDate(ev.semana, ev.dia, zonaHoraria, today.toISODate()!)

    await db().insert(planProgress).values({
      id: generateId(),
      planId,
      fecha,
      tipo: ev.categoria || 'tarea',
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

export function resolveProgressSeedDate(
  semana: number,
  dia: string,
  zonaHoraria: string,
  todayIso?: string
): string {
  const diasMap: Record<string, number> = {
    lunes: 1,
    martes: 2,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6,
    domingo: 7
  }
  const today = (todayIso
    ? DateTime.fromISO(todayIso, { zone: zonaHoraria })
    : DateTime.now().setZone(zonaHoraria)
  ).startOf('day')
  const weekStart = today.startOf('week')
  const weekOffset = (semana - 1) * 7
  const dayOffset = (diasMap[dia.toLowerCase()] ?? 1) - 1
  let scheduledDate = weekStart.plus({ days: weekOffset + dayOffset }).startOf('day')

  while (scheduledDate < today) {
    scheduledDate = scheduledDate.plus({ days: 7 })
  }

  return scheduledDate.toISODate()!
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
