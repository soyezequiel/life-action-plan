import { DateTime } from 'luxon'

import type { PlanEvent } from '../../shared/types/lap-api'
import type { PlanPackage, V5PhaseSnapshot } from '../pipeline/shared/phase-io'
import type { ReasoningEntry } from '../pipeline/v6/types'
import { createPlan, seedProgressFromEvents, softDeleteOtherPlans } from '../db/db-helpers'
import {
  buildPendingAdaptiveState,
  buildPlanManifest,
  createUniquePlanSlug
} from './plan-helpers'

function normalizeComparableText(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function normalizeDayLabel(value: string): string {
  return normalizeComparableText(value).replace(/\s+/g, '')
}

function inferLegacyCategory(goalText: string): PlanEvent['categoria'] {
  const normalized = normalizeComparableText(goalText)

  if (/(correr|running|entren|gim|yoga|movilidad|caminar|natacion|bici|salud)/.test(normalized)) {
    return 'ejercicio'
  }

  if (/(guitarra|idioma|ingles|estudio|aprend)/.test(normalized)) {
    return 'estudio'
  }

  if (/(proyecto|entrega|lanza|build|producto|app)/.test(normalized)) {
    return 'trabajo'
  }

  if (/(habito|rutina|consistencia|sosten|correr|leer|meditar)/.test(normalized)) {
    return 'habito'
  }

  return 'otro'
}

export function convertV5PackageToPlanEvents(input: {
  package: PlanPackage
  goalId: string
  goalText: string
  timezone: string
}): Array<PlanEvent & { fecha: string }> {
  const defaultCategory = inferLegacyCategory(input.goalText)

  return input.package.plan.detail.weeks.flatMap((week) =>
    week.scheduledEvents.map((event) => {
      const localStart = DateTime.fromISO(event.startAt, { zone: 'utc' }).setZone(input.timezone)

      return {
        semana: week.weekIndex,
        dia: normalizeDayLabel(localStart.setLocale('es').toFormat('cccc')),
        fecha: localStart.toISODate() ?? localStart.toFormat('yyyy-MM-dd'),
        hora: localStart.toFormat('HH:mm'),
        duracion: event.durationMin,
        actividad: event.title,
        categoria: defaultCategory,
        objetivoId: event.goalIds[0] || input.goalId
      } satisfies PlanEvent & { fecha: string }
    })
  )
}

export async function persistPlanFromV5Package(input: {
  profileId: string
  package: PlanPackage
  goalId: string
  goalText: string
  timezone: string
  modelId: string
  tokensInput?: number
  tokensOutput?: number
  runSnapshot?: V5PhaseSnapshot | null
  nombre?: string
  reasoningTrace?: ReasoningEntry[] | null
}): Promise<{
  planId: string
  nombre: string
  resumen: string
  eventos: PlanEvent[]
  manifest: string
}> {
  const eventos = convertV5PackageToPlanEvents({
    package: input.package,
    goalId: input.goalId,
    goalText: input.goalText,
    timezone: input.timezone
  })
  const nombre = input.nombre?.trim() || `Plan - ${input.goalText}`
  const planSlug = await createUniquePlanSlug(nombre)
  const reasoningTrace = input.reasoningTrace ?? null
  const manifest = buildPlanManifest({
    nombre,
    fallbackUsed: false,
    modelId: input.modelId,
    tokensInput: input.tokensInput ?? 0,
    tokensOutput: input.tokensOutput ?? 0,
    costUsd: 0,
    costSats: 0,
    v5: {
      package: input.package,
      adaptive: buildPendingAdaptiveState(),
      run: input.runSnapshot ?? null
    }
  })
  const planId = await createPlan(input.profileId, nombre, planSlug, manifest, reasoningTrace)
  await seedProgressFromEvents(planId, eventos, input.timezone)
  await softDeleteOtherPlans(input.profileId, planId)

  return {
    planId,
    nombre,
    resumen: input.package.summary_esAR,
    eventos,
    manifest
  }
}
