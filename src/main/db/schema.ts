import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON string validated by Zod at app layer
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const plans = sqliteTable('plans', {
  id: text('id').primaryKey(),
  profileId: text('profile_id').notNull().references(() => profiles.id),
  nombre: text('nombre').notNull(),
  slug: text('slug').notNull().unique(),
  manifest: text('manifest').notNull(), // JSON string validated by manifiestoSchema
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const planProgress = sqliteTable('plan_progress', {
  id: text('id').primaryKey(),
  planId: text('plan_id').notNull().references(() => plans.id),
  fecha: text('fecha').notNull(),
  tipo: text('tipo').notNull(), // 'habito' | 'tarea' | 'hito'
  objetivoId: text('objetivo_id'),
  descripcion: text('descripcion').notNull(),
  completado: integer('completado', { mode: 'boolean' }).notNull().default(false),
  notas: text('notas'),
  createdAt: text('created_at').notNull()
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

export const analyticsEvents = sqliteTable('analytics_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  event: text('event').notNull(),
  payload: text('payload'), // Optional JSON
  timestamp: text('timestamp').notNull()
})

export const costTracking = sqliteTable('cost_tracking', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  planId: text('plan_id').references(() => plans.id),
  operation: text('operation').notNull(),
  model: text('model').notNull(),
  tokensInput: integer('tokens_input').notNull().default(0),
  tokensOutput: integer('tokens_output').notNull().default(0),
  costUsd: real('cost_usd').notNull().default(0),
  timestamp: text('timestamp').notNull()
})
