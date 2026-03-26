import { z } from 'zod'

// --- Sub-schemas ---

const feriadoSchema = z.object({
  nombre: z.string().max(100),
  fecha: z.string().max(20),
  tipo: z.enum(['nacional', 'religioso', 'personal'])
}).strict()

const ubicacionSchema = z.object({
  ciudad: z.string().max(100),
  pais: z.string().length(2),
  zonaHoraria: z.string().max(50),
  zonaHorariaSecundaria: z.string().max(50).nullable().default(null),
  feriadosRelevantes: z.array(feriadoSchema).default([]),
  conectividad: z.enum(['alta', 'media', 'baja', 'intermitente']),
  accesoCursos: z.enum(['local', 'online', 'ambos', 'limitado']),
  distanciaCentroUrbano: z.number().nonnegative(),
  transporteDisponible: z.enum(['propio', 'publico', 'limitado']),
  adversidadesLocales: z.array(z.string().max(200)).default([])
}).strict()

const datosPersonalesSchema = z.object({
  nombre: z.string().min(1).max(50),
  edad: z.number().int().min(0).max(150),
  sexo: z.string().max(30),
  ubicacion: ubicacionSchema,
  idioma: z.string().max(10),
  nivelAcademico: z.string().max(100),
  nivelEconomico: z.enum(['bajo', 'medio-bajo', 'medio', 'medio-alto', 'alto']),
  narrativaPersonal: z.string().max(500)
}).strict()

const dependienteSchema = z.object({
  nombre: z.string().min(1).max(50),
  relacion: z.enum(['hijo', 'madre', 'padre', 'pareja', 'otro']),
  edad: z.number().int().min(0).max(150).nullable().default(null),
  rol: z.enum(['cuidador', 'dependiente', 'co-responsable']),
  disponibilidad: z.string().max(200),
  restricciones: z.string().max(300),
  variabilidad: z.enum(['estable', 'variable', 'impredecible'])
}).strict()

const habilidadesSchema = z.object({
  actuales: z.array(z.string().max(100)),
  aprendiendo: z.array(z.string().max(100))
}).strict()

const condicionSaludSchema = z.object({
  condicion: z.string().max(200),
  impactoFuncional: z.string().max(300),
  restriccionesHorario: z.string().max(200),
  frecuenciaEpisodios: z.string().max(100)
}).strict()

const patronesEnergiaSchema = z.object({
  cronotipo: z.enum(['matutino', 'vespertino', 'neutro']),
  horarioPicoEnergia: z.string().max(20),
  horarioBajoEnergia: z.string().max(20),
  horasProductivasMaximas: z.number().min(0).max(24)
}).strict()

const patronesConocidosSchema = z.object({
  diaTipicoBueno: z.string().max(500),
  diaTipicoMalo: z.string().max(500),
  tendencias: z.array(z.string().max(300))
}).strict()

// --- Rutina ---

const rutinaBaseSchema = z.object({
  despertar: z.string().max(5),
  dormir: z.string().max(5),
  trabajoInicio: z.string().max(5).nullable().default(null),
  trabajoFin: z.string().max(5).nullable().default(null),
  tiempoTransporte: z.number().int().nonnegative()
}).strict()

const periodoSchema = z.object({
  inicio: z.string().max(10),
  fin: z.string().max(10)
}).strict()

const faseHorarioSchema = z.object({
  nombre: z.string().max(100),
  periodos: z.array(periodoSchema),
  rutina: rutinaBaseSchema
}).strict()

const rutinaDiariaSchema = z.object({
  porDefecto: rutinaBaseSchema,
  fasesHorario: z.array(faseHorarioSchema).default([])
}).strict()

// --- Calendario ---

const eventoInamovibleSchema = z.object({
  nombre: z.string().max(200),
  horario: z.string().max(100),
  recurrencia: z.string().max(100).nullable().default(null),
  categoria: z.enum(['trabajo', 'educacion', 'salud', 'familia', 'otro']),
  persona: z.string().max(50)
}).strict()

const eventoFlexibleSchema = z.object({
  nombre: z.string().max(200),
  horario: z.string().max(100),
  flexibilidad: z.enum(['alta', 'media', 'baja']),
  persona: z.string().max(50)
}).strict()

const horasLibresSchema = z.object({
  diasLaborales: z.number().nonnegative(),
  diasDescanso: z.number().nonnegative()
}).strict()

const calendarioSchema = z.object({
  fuente: z.enum(['ics', 'csv', 'texto', 'ninguno']),
  eventosInamovibles: z.array(eventoInamovibleSchema).default([]),
  eventosFlexibles: z.array(eventoFlexibleSchema).default([]),
  horasLibresEstimadas: horasLibresSchema
}).strict()

// --- Compromisos ---

const compromisoSchema = z.object({
  descripcion: z.string().max(300),
  fecha: z.string().max(10).nullable().default(null),
  recurrencia: z.string().max(100).nullable().default(null),
  duracion: z.number().int().nonnegative()
}).strict()

// --- Participante ---

const participanteSchema = z.object({
  id: z.string().max(20),
  datosPersonales: datosPersonalesSchema,
  dependientes: z.array(dependienteSchema).default([]),
  habilidades: habilidadesSchema,
  condicionesSalud: z.array(condicionSaludSchema).default([]),
  patronesEnergia: patronesEnergiaSchema,
  problemasActuales: z.array(z.string().max(300)),
  patronesConocidos: patronesConocidosSchema,
  rutinaDiaria: rutinaDiariaSchema,
  calendario: calendarioSchema,
  compromisos: z.array(compromisoSchema).default([])
}).strict()

// --- Objetivos ---

const relacionObjetivoSchema = z.object({
  tipo: z.enum(['depende-de', 'compite-con', 'sinergia']),
  objetivoId: z.string().max(20)
}).strict()

const rangoEstimadoSchema = z.object({
  optimista: z.string().max(50).nullable().default(null),
  probable: z.string().max(50).nullable().default(null),
  pesimista: z.string().max(50).nullable().default(null)
}).strict()

const objetivoSchema = z.object({
  id: z.string().max(20),
  descripcion: z.string().max(2000),
  tipo: z.enum(['meta', 'habito', 'exploracion']),
  responsable: z.string().max(50),
  prioridad: z.number().int().min(1).max(5),
  plazo: z.string().max(50).nullable().default(null),
  tipoTimeline: z.enum(['controlable', 'externo', 'mixto']),
  rangoEstimado: rangoEstimadoSchema,
  motivacion: z.string().max(2000),
  relaciones: z.array(relacionObjetivoSchema).default([]),
  horasSemanalesEstimadas: z.number().nonnegative()
}).strict()

// --- Estado Dinámico ---

const estadoEmocionalSchema = z.object({
  motivacion: z.number().int().min(1).max(5),
  estres: z.number().int().min(1).max(5),
  satisfaccion: z.number().int().min(1).max(5)
}).strict()

const estadoDinamicoSchema = z.object({
  ultimaActualizacion: z.string(),
  salud: z.enum(['buena', 'regular', 'mala']),
  nivelEnergia: z.enum(['alto', 'medio', 'bajo']),
  estadoEmocional: estadoEmocionalSchema,
  notasTemporales: z.array(z.string().max(500)).default([]),
  umbralStaleness: z.number().int().min(1).default(7)
}).strict()

// --- Profile Root ---

export const perfilSchema = z.object({
  version: z.string().default('3.0'),
  planificacionConjunta: z.boolean().default(false),
  participantes: z.array(participanteSchema).min(1),
  objetivos: z.array(objetivoSchema),
  estadoDinamico: estadoDinamicoSchema
}).strict()

export type Perfil = z.infer<typeof perfilSchema>
export type Participante = z.infer<typeof participanteSchema>
export type Objetivo = z.infer<typeof objetivoSchema>
export type EstadoDinamico = z.infer<typeof estadoDinamicoSchema>

// Re-export sub-schemas for partial validation during intake
export {
  participanteSchema,
  datosPersonalesSchema,
  ubicacionSchema,
  rutinaBaseSchema,
  rutinaDiariaSchema,
  calendarioSchema,
  objetivoSchema,
  estadoDinamicoSchema
}
