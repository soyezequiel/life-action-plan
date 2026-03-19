import { z } from 'zod'

const horizontePlanSchema = z.object({
  anosTotal: z.number().int().min(1),
  estrategia: z.enum(['completo', 'por-eras'])
}).strict()

const granularidadCompletadaSchema = z.object({
  anual: z.boolean().default(false),
  mensual: z.array(z.string()).default([]),
  diario: z.array(z.string()).default([])
}).strict()

const checkpointSchema = z.object({
  operacion: z.string().max(100).nullable().default(null),
  iteracionActual: z.number().int().nonnegative().default(0),
  maxIteraciones: z.number().int().default(5),
  itemsPendientes: z.array(z.string().max(300)).default([]),
  ultimoPasoCompletado: z.string().max(200).nullable().default(null),
  granularidad: z.enum(['anual', 'mensual', 'diario', 'dia']).nullable().default(null),
  periodoObjetivo: z.string().max(20).nullable().default(null),
  periodosValidados: z.array(z.string()).default([]),
  periodosPendientes: z.array(z.string()).default([])
}).strict()

const ramaSchema = z.object({
  tipo: z.enum(['contingencia']),
  creadaDesde: z.string().max(200),
  estado: z.enum(['simulada', 'pendiente'])
}).strict()

const archivoArchivadoSchema = z.object({
  archivado: z.boolean(),
  fecha: z.string()
}).strict()

const costoAcumuladoSchema = z.object({
  llamadasModelo: z.object({
    alto: z.number().nonnegative().default(0),
    medio: z.number().nonnegative().default(0),
    bajo: z.number().nonnegative().default(0)
  }).strict(),
  tokensInput: z.number().nonnegative().default(0),
  tokensOutput: z.number().nonnegative().default(0),
  estimacionUSD: z.number().nonnegative().default(0),
  estimacionSats: z.number().nonnegative().default(0)
}).strict()

const simulationFindingSchema = z.object({
  status: z.enum(['PASS', 'WARN', 'FAIL', 'MISSING']),
  code: z.enum([
    'no_plan_items',
    'missing_schedule',
    'outside_awake_hours',
    'overlaps_work',
    'day_over_capacity',
    'day_high_load',
    'too_many_activities',
    'schedule_ok',
    'work_balance_ok',
    'capacity_ok',
    'metadata_ok'
  ]),
  params: z.record(z.union([z.string(), z.number()])).optional()
}).strict()

const simulationSummarySchema = z.object({
  overallStatus: z.enum(['PASS', 'WARN', 'FAIL', 'MISSING']),
  pass: z.number().int().nonnegative().default(0),
  warn: z.number().int().nonnegative().default(0),
  fail: z.number().int().nonnegative().default(0),
  missing: z.number().int().nonnegative().default(0)
}).strict()

const ultimaSimulacionSchema = z.object({
  ranAt: z.string(),
  mode: z.enum(['interactive', 'automatic']),
  periodLabel: z.string().min(1).max(80),
  summary: simulationSummarySchema,
  findings: z.array(simulationFindingSchema).max(24)
}).strict()

export const manifiestoSchema = z.object({
  nombrePlan: z.string().min(1).max(200),
  creado: z.string(),
  ultimaModificacion: z.string(),
  versionGlobal: z.number().int().nonnegative().default(1),
  modo: z.enum(['individual', 'conjunto']),
  planGeneral: z.string().default('plan-general.md'),
  fallbackUsed: z.boolean().optional(),
  ultimoModeloUsado: z.string().max(120).optional(),
  horizontePlan: horizontePlanSchema,
  granularidadCompletada: granularidadCompletadaSchema,
  estadoSimulacion: z.record(z.string(), z.enum([
    'PASS', 'WARN', 'FAIL', 'PENDIENTE', 'EN_PROGRESO', 'DESACTUALIZADO'
  ])).default({}),
  versionesArchivos: z.record(z.string(), z.number()).default({}),
  checkpoint: checkpointSchema,
  ramas: z.record(z.string(), ramaSchema).default({}),
  archivados: z.record(z.string(), archivoArchivadoSchema).default({}),
  costoAcumulado: costoAcumuladoSchema,
  ultimaSimulacion: ultimaSimulacionSchema.nullable().default(null)
}).strict()

export type Manifiesto = z.infer<typeof manifiestoSchema>
export type Checkpoint = z.infer<typeof checkpointSchema>
export type CostoAcumulado = z.infer<typeof costoAcumuladoSchema>
export type UltimaSimulacion = z.infer<typeof ultimaSimulacionSchema>

export { checkpointSchema, costoAcumuladoSchema, ultimaSimulacionSchema }
