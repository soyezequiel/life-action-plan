import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const profiles = pgTable('profiles', {
  id: text('id').notNull().unique(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
})

export const plans = pgTable('plans', {
  id: text('id').notNull().unique(),
  profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  nombre: text('nombre').notNull(),
  slug: text('slug').notNull().unique(),
  manifest: jsonb('manifest').notNull(),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
})

export const planProgress = pgTable('plan_progress', {
  id: text('id').notNull().unique(),
  planId: text('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
  fecha: date('fecha', { mode: 'string' }).notNull(),
  tipo: text('tipo').notNull(),
  objetivoId: text('objetivo_id'),
  descripcion: text('descripcion').notNull(),
  completado: boolean('completado').notNull().default(false),
  notas: jsonb('notas'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull()
})

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

export const userSettings = pgTable('user_settings', {
  id: text('id').notNull().unique(),
  userId: text('user_id').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
}, (table) => ({
  userKeyIdx: uniqueIndex('user_settings_user_id_key_idx').on(table.userId, table.key)
}))

export const credentialRegistry = pgTable('credential_registry', {
  id: text('id').notNull().unique(),
  owner: text('owner').notNull(),
  ownerId: text('owner_id').notNull(),
  providerId: text('provider_id').notNull(),
  secretType: text('secret_type').notNull(),
  label: text('label').notNull(),
  encryptedValue: text('encrypted_value').notNull(),
  status: text('status').notNull(),
  lastValidatedAt: timestamp('last_validated_at', { mode: 'string', withTimezone: true }),
  lastValidationError: text('last_validation_error'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
}, (table) => ({
  ownerProviderSecretLabelIdx: uniqueIndex('credential_registry_owner_provider_secret_label_idx')
    .on(table.owner, table.ownerId, table.providerId, table.secretType, table.label)
}))

export const analyticsEvents = pgTable('analytics_events', {
  id: serial('id').primaryKey(),
  event: text('event').notNull(),
  payload: jsonb('payload'),
  timestamp: timestamp('timestamp', { mode: 'string', withTimezone: true }).notNull()
})

export const operationCharges = pgTable('operation_charges', {
  id: text('id').notNull().unique(),
  profileId: text('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  planId: text('plan_id').references(() => plans.id, { onDelete: 'set null' }),
  operation: text('operation').notNull(),
  model: text('model'),
  paymentProvider: text('payment_provider'),
  status: text('status').notNull(),
  estimatedCostUsd: real('estimated_cost_usd').notNull().default(0),
  estimatedCostSats: integer('estimated_cost_sats').notNull().default(0),
  finalCostUsd: real('final_cost_usd').notNull().default(0),
  finalCostSats: integer('final_cost_sats').notNull().default(0),
  chargedSats: integer('charged_sats').notNull().default(0),
  reasonCode: text('reason_code'),
  reasonDetail: text('reason_detail'),
  lightningInvoice: text('lightning_invoice'),
  lightningPaymentHash: text('lightning_payment_hash'),
  lightningPreimage: text('lightning_preimage'),
  providerReference: text('provider_reference'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull(),
  resolvedAt: timestamp('resolved_at', { mode: 'string', withTimezone: true })
})

export const costTracking = pgTable('cost_tracking', {
  id: serial('id').primaryKey(),
  chargeId: text('charge_id').references(() => operationCharges.id, { onDelete: 'set null' }),
  planId: text('plan_id').references(() => plans.id, { onDelete: 'set null' }),
  operation: text('operation').notNull(),
  model: text('model').notNull(),
  tokensInput: integer('tokens_input').notNull().default(0),
  tokensOutput: integer('tokens_output').notNull().default(0),
  costUsd: real('cost_usd').notNull().default(0),
  timestamp: timestamp('timestamp', { mode: 'string', withTimezone: true }).notNull()
})
