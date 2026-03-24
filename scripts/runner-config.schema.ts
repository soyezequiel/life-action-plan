import { z } from 'zod'

// ─── Intake schema (enriched — all new fields optional for retrocompat) ────────

const intakeObjetivoSchema = z.object({
  descripcion: z.string().min(1).max(500),
  prioridad: z.number().int().min(1).max(5).optional(),
  horasSemanales: z.number().min(0).optional(),
  tipo: z.enum(['meta', 'habito', 'exploracion']).optional()
})

const intakeHorariosSchema = z.object({
  despertar: z.string().optional(),
  dormir: z.string().optional(),
  trabajoInicio: z.string().optional(),
  trabajoFin: z.string().optional(),
  tiempoTransporte: z.number().int().nonnegative().optional()
}).optional()

const intakeEnergiaSchema = z.object({
  cronotipo: z.enum(['matutino', 'vespertino', 'neutro']).optional(),
  horasProductivasMax: z.number().min(0).max(16).optional(),
  horaPicoEnergia: z.string().optional(),
  horaBajaEnergia: z.string().optional()
}).optional()

const intakeMotivacionSchema = z.object({
  nivel: z.number().int().min(1).max(5).optional(),
  estres: z.number().int().min(1).max(5).optional(),
  fracasosPrevios: z.array(z.string().max(300)).optional(),
  fortalezas: z.array(z.string().max(300)).optional()
}).optional()

const intakeCompromisoSchema = z.object({
  descripcion: z.string().min(1).max(300),
  horario: z.string().optional(),
  recurrencia: z.string().optional(),
  duracion: z.number().int().nonnegative().optional()
})

const intakeDependienteSchema = z.object({
  nombre: z.string().min(1).max(50),
  relacion: z.string().max(50),
  impactoHorario: z.string().max(200).optional()
})

const intakeDisponibilidadSchema = z.object({
  horasLibresLaborales: z.number().min(0).max(16).optional(),
  horasLibresFinDeSemana: z.number().min(0).max(16).optional()
}).optional()

const intakeSaludSchema = z.object({
  condiciones: z.array(z.string().max(200)).optional(),
  restricciones: z.array(z.string().max(200)).optional()
}).optional()

// ─── Pipeline mode config ─────────────────────────────────────────────────────

const pipelineConfigSchema = z.object({
  mode: z.enum(['fast', 'deep']).default('deep'),
  maxRepairAttempts: z.number().int().min(1).max(5).default(3),
  skipEnrichment: z.boolean().default(false)
}).default({})

// ─── Root schema ──────────────────────────────────────────────────────────────

export const runnerConfigSchema = z.object({
  intake: z.object({
    // Original required fields (unchanged)
    nombre: z.string(),
    edad: z.number(),
    ubicacion: z.string(),
    ocupacion: z.string(),
    objetivo: z.string(),

    // New optional enriched fields
    objetivos: z.array(intakeObjetivoSchema).optional(),
    horarios: intakeHorariosSchema,
    energia: intakeEnergiaSchema,
    motivacion: intakeMotivacionSchema,
    compromisos: z.array(intakeCompromisoSchema).optional(),
    dependientes: z.array(intakeDependienteSchema).optional(),
    disponibilidad: intakeDisponibilidadSchema,
    salud: intakeSaludSchema
  }),
  build: z.object({
    provider: z.string().optional(),
    apiKey: z.string().optional(),
    thinkingMode: z.enum(['enabled', 'disabled']).optional(),
    resourceMode: z.enum(['auto', 'backend', 'user', 'codex']).optional()
  }).default({}),
  simulate: z.object({
    mode: z.enum(['interactive', 'automatic']).default('automatic')
  }).default({ mode: 'automatic' }),

  // New: pipeline behavior
  pipeline: pipelineConfigSchema
})

export type RunnerConfig = z.infer<typeof runnerConfigSchema>
export type PipelineConfig = z.infer<typeof pipelineConfigSchema>
