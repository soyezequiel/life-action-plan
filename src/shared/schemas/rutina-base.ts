import { z } from 'zod'

const timeRegex = /^\d{2}:\d{2}$/

const bloqueHorarioSchema = z.object({
  inicio: z.string().regex(timeRegex),
  fin: z.string().regex(timeRegex),
  actividad: z.string().max(200),
  categoria: z.enum([
    'trabajo',
    'estudio',
    'ejercicio',
    'descanso',
    'familia',
    'transporte',
    'alimentacion',
    'higiene',
    'ocio',
    'otro'
  ]),
  energia: z.enum(['alta', 'media', 'baja']),
  flexible: z.boolean().default(false)
}).strict()

const rutinaDelDiaSchema = z.object({
  despertar: z.string().regex(timeRegex),
  dormir: z.string().regex(timeRegex),
  trabajoInicio: z.string().regex(timeRegex).nullable().default(null),
  trabajoFin: z.string().regex(timeRegex).nullable().default(null),
  tiempoTransporte: z.number().int().nonnegative(),
  bloques: z.array(bloqueHorarioSchema).default([])
}).strict()

export const rutinaBaseCompleta = z.object({
  porDefecto: rutinaDelDiaSchema,
  variaciones: z.record(z.string(), rutinaDelDiaSchema).default({}),
  diasEspeciales: z.record(z.string(), rutinaDelDiaSchema).default({})
}).strict()

export type RutinaBase = z.infer<typeof rutinaBaseCompleta>
export type BloqueHorario = z.infer<typeof bloqueHorarioSchema>
export type RutinaDelDia = z.infer<typeof rutinaDelDiaSchema>

export { rutinaDelDiaSchema, bloqueHorarioSchema }
