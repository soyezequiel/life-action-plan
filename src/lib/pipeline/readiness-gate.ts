import { DateTime } from 'luxon'
import type { Perfil } from '../../shared/schemas/perfil'

export interface ReadinessResult {
  ready: boolean
  errors: string[]
  warnings: string[]
  constraints: string[]
}

const MAX_REALISTIC_FREE_HOURS = 16

function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number.parseInt(match[1], 10)
  const minutes = Number.parseInt(match[2], 10)
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

/**
 * Pure deterministic gate: receives an enriched Perfil, returns
 * { ready, errors, warnings, constraints } with no side-effects.
 *
 * Errors → abort the pipeline before spending tokens.
 * Warnings → continue but inject constraints into the builder prompt.
 */
export function runReadinessGate(profile: Perfil): ReadinessResult {
  const errors: string[] = []
  const warnings: string[] = []
  const constraints: string[] = []

  const participant = profile.participantes[0]

  // ── Check 1: has_objective ──────────────────────────────────────────────
  if (!profile.objetivos || profile.objetivos.length === 0) {
    errors.push('No hay ningún objetivo definido. El pipeline no puede generar un plan sin una meta.')
  }

  // ── Check 2: positive_free_time ─────────────────────────────────────────
  const freeWeekday = participant?.calendario?.horasLibresEstimadas?.diasLaborales ?? 0
  const freeWeekend = participant?.calendario?.horasLibresEstimadas?.diasDescanso ?? 0
  const totalFreeHoursPerWeek = freeWeekday * 5 + freeWeekend * 2

  if (totalFreeHoursPerWeek <= 0) {
    errors.push(
      'Las horas libres estimadas son 0 en todos los días. ' +
      'No es posible generar un plan viable sin disponibilidad horaria.'
    )
  }

  // ── Check 3: realistic_hours ────────────────────────────────────────────
  if (freeWeekday > MAX_REALISTIC_FREE_HOURS) {
    warnings.push(
      `Se declararon ${freeWeekday}h libres en días laborales — valor irreal, se capará a ${MAX_REALISTIC_FREE_HOURS}h.`
    )
    constraints.push(
      `Usá máximo ${MAX_REALISTIC_FREE_HOURS}h disponibles en días laborales (el usuario declaró más pero no es realista).`
    )
  }

  if (freeWeekend > MAX_REALISTIC_FREE_HOURS) {
    warnings.push(
      `Se declararon ${freeWeekend}h libres en fines de semana — valor irreal, se capará a ${MAX_REALISTIC_FREE_HOURS}h.`
    )
    constraints.push(
      `Usá máximo ${MAX_REALISTIC_FREE_HOURS}h disponibles en fines de semana.`
    )
  }

  // ── Check 4: has_schedule ───────────────────────────────────────────────
  const despertar = participant?.rutinaDiaria?.porDefecto?.despertar
  const dormir = participant?.rutinaDiaria?.porDefecto?.dormir
  const despertarMin = parseTimeToMinutes(despertar)
  const dormirMin = parseTimeToMinutes(dormir)

  if (despertarMin === null || dormirMin === null) {
    warnings.push('No se especificaron horarios de despertar/dormir. Se usarán defaults: 07:00 / 23:00.')
    constraints.push('Asumí que el usuario se despierta a las 07:00 y se duerme a las 23:00.')
  } else {
    // Validate coherence: awake window must be at least 12h
    const awakeMinutes = dormirMin > despertarMin
      ? dormirMin - despertarMin
      : (24 * 60 - despertarMin) + dormirMin
    if (awakeMinutes < 12 * 60) {
      warnings.push(
        `El usuario duerme ${Math.round((24 * 60 - awakeMinutes) / 60)}h según sus horarios — muy poco tiempo despierto.`
      )
      constraints.push('El usuario tiene una ventana de vigilia corta. No sobrecargar actividades.')
    }
  }

  // ── Check 5: goal_feasibility ───────────────────────────────────────────
  const totalRequestedHoursPerWeek = profile.objetivos.reduce(
    (sum, obj) => sum + (obj.horasSemanalesEstimadas ?? 0),
    0
  )
  const cappedFreeWeekday = Math.min(freeWeekday, MAX_REALISTIC_FREE_HOURS)
  const cappedFreeWeekend = Math.min(freeWeekend, MAX_REALISTIC_FREE_HOURS)
  const realisticWeeklyHours = cappedFreeWeekday * 5 + cappedFreeWeekend * 2

  if (totalRequestedHoursPerWeek > 0 && totalRequestedHoursPerWeek > realisticWeeklyHours) {
    warnings.push(
      `Los objetivos requieren ${totalRequestedHoursPerWeek}h/semana pero solo hay ${realisticWeeklyHours}h disponibles. ` +
      'El plan deberá priorizar y reducir carga.'
    )
    constraints.push(
      `Los objetivos del usuario necesitan ${totalRequestedHoursPerWeek}h/semana pero la disponibilidad real es ` +
      `${realisticWeeklyHours}h/semana. Priorizá los de mayor prioridad y ajustá las horas semanales a lo disponible.`
    )
  }

  // ── Check 6: profile_freshness ──────────────────────────────────────────
  const lastUpdated = profile.estadoDinamico?.ultimaActualizacion
  const staleness = profile.estadoDinamico?.umbralStaleness ?? 7

  if (lastUpdated) {
    const lastUpdatedDt = DateTime.fromISO(lastUpdated, { zone: 'utc' })
    const nowDt = DateTime.utc()
    if (lastUpdatedDt.isValid) {
      const daysSinceUpdate = nowDt.diff(lastUpdatedDt, 'days').days
      if (daysSinceUpdate > staleness) {
        warnings.push(
          `El perfil tiene ${Math.floor(daysSinceUpdate)} días sin actualizar (umbral: ${staleness} días). ` +
          'Puede no reflejar la realidad actual del usuario.'
        )
      }
    }
  }

  // ── Check 7: commitment conflicts warning ────────────────────────────────
  const inamovibles = participant?.calendario?.eventosInamovibles ?? []
  if (inamovibles.length > 0) {
    const descriptions = inamovibles.map(e => `"${e.nombre}" (${e.horario})`).join(', ')
    constraints.push(
      `El usuario tiene compromisos inamovibles que NO se pueden sobrescribir: ${descriptions}. ` +
      'No planifiques actividades en esos horarios.'
    )
  }

  return {
    ready: errors.length === 0,
    errors,
    warnings,
    constraints
  }
}
