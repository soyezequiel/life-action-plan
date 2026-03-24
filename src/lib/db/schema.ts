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

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  email: text('email'),
  passwordHash: text('password_hash').notNull(),
  hashAlgorithm: text('hash_algorithm').notNull().default('argon2id'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { mode: 'string', withTimezone: true })
}, (table) => ({
  usernameIdx: uniqueIndex('users_username_idx').on(table.username),
  emailIdx: uniqueIndex('users_email_idx').on(table.email)
}))

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { mode: 'string', withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull()
}, (table) => ({
  tokenHashIdx: uniqueIndex('sessions_token_hash_idx').on(table.tokenHash)
}))

export const authLoginGuards = pgTable('auth_login_guards', {
  id: text('id').primaryKey(),
  scope: text('scope').notNull(),
  keyHash: text('key_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  windowStartedAt: timestamp('window_started_at', { mode: 'string', withTimezone: true }).notNull(),
  lastAttemptAt: timestamp('last_attempt_at', { mode: 'string', withTimezone: true }).notNull(),
  blockedUntil: timestamp('blocked_until', { mode: 'string', withTimezone: true }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
}, (table) => ({
  scopeKeyIdx: uniqueIndex('auth_login_guards_scope_key_idx').on(table.scope, table.keyHash)
}))

export const encryptedKeyVaults = pgTable('encrypted_key_vaults', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  encryptedBlob: text('encrypted_blob').notNull(),
  salt: text('salt').notNull(),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
}, (table) => ({
  userIdx: uniqueIndex('encrypted_key_vaults_user_id_idx').on(table.userId)
}))

export const profiles = pgTable('profiles', {
  id: text('id').notNull().unique(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
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

export const planWorkflows = pgTable('plan_workflows', {
  id: text('id').notNull().unique(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  profileId: text('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  planId: text('plan_id').references(() => plans.id, { onDelete: 'set null' }),
  status: text('status').notNull(),
  currentStep: text('current_step').notNull(),
  state: jsonb('state').notNull(),
  lastCheckpointCode: text('last_checkpoint_code'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
})

export const planWorkflowCheckpoints = pgTable('plan_workflow_checkpoints', {
  id: text('id').notNull().unique(),
  workflowId: text('workflow_id').notNull().references(() => planWorkflows.id, { onDelete: 'cascade' }),
  step: text('step').notNull(),
  code: text('code').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull()
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

export const planSimulationTrees = pgTable('plan_simulation_trees', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workflowId: text('workflow_id').notNull().references(() => planWorkflows.id),
  data: jsonb('data').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
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
