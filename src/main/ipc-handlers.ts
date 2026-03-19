import { ipcMain } from 'electron'
import { intakeExpressToProfile } from '../skills/plan-intake'
import { generatePlan } from '../skills/plan-builder'
import { getProvider } from '../providers/provider-factory'
import {
  createProfile, getProfile, createPlan,
  getPlansByProfile, getProgressByPlanAndDate, toggleProgress,
  seedProgressFromEvents, trackEvent, getSetting, setSetting
} from './db/db-helpers'
import type { IntakeExpressData } from '../shared/types/ipc'
import type { Perfil } from '../shared/schemas/perfil'
import type { SkillContext } from '../runtime/types'
import { DateTime } from 'luxon'

export function registerIpcHandlers(): void {
  // --- Intake Express: save profile ---
  ipcMain.handle('intake:save', async (_event, data: IntakeExpressData) => {
    try {
      const profile = intakeExpressToProfile(data)
      const profileId = createProfile(JSON.stringify(profile))
      setSetting('lastProfileId', profileId)

      trackEvent('INTAKE_COMPLETED', { profileId, mode: 'express' })

      return { success: true, profileId }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, profileId: '', error: message }
    }
  })

  // --- Plan Builder: generate plan from profile ---
  // provider: "openai:gpt-4o-mini" or "ollama:qwen3:8b"
  ipcMain.handle('plan:build', async (_event, profileId: string, apiKey: string, provider?: string) => {
    try {
      const profileRow = getProfile(profileId)
      if (!profileRow) {
        return { success: false, error: 'Perfil no encontrado' }
      }

      const profile: Perfil = JSON.parse(profileRow.data)

      const modelId = provider || 'openai:gpt-4o-mini'
      const runtime = getProvider(modelId, { apiKey })

      const ctx: SkillContext = {
        planDir: '',
        profileId,
        userLocale: 'es-AR',
        formalityLevel: 'informal',
        tokenMultiplier: 1.22
      }

      trackEvent('PLAN_BUILD_STARTED', { profileId })

      const result = await generatePlan(runtime, profile, ctx)

      // Save plan to DB
      const now = DateTime.utc().toISO()!
      const slug = result.nombre
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50) || 'mi-plan'

      const manifest = JSON.stringify({
        nombrePlan: result.nombre,
        creado: now,
        ultimaModificacion: now,
        versionGlobal: 1,
        modo: 'individual',
        planGeneral: 'plan-general.md',
        horizontePlan: { anosTotal: 1, estrategia: 'completo' },
        granularidadCompletada: { anual: false, mensual: [], diario: [] },
        estadoSimulacion: {},
        versionesArchivos: {},
        checkpoint: { operacion: 'build', iteracionActual: 1, maxIteraciones: 5, itemsPendientes: [], ultimoPasoCompletado: 'plan-builder', granularidad: 'mensual', periodoObjetivo: null, periodosValidados: [], periodosPendientes: [] },
        ramas: {},
        archivados: {},
        costoAcumulado: {
          llamadasModelo: { alto: 1, medio: 0, bajo: 0 },
          tokensInput: result.tokensUsed.input,
          tokensOutput: result.tokensUsed.output,
          estimacionUSD: ((result.tokensUsed.input * 0.15 + result.tokensUsed.output * 0.6) / 1_000_000)
        }
      })

      const planId = createPlan(profileId, result.nombre, slug, manifest)

      // Seed individual progress rows from plan events
      const tz = profile.participantes[0]?.datosPersonales?.ubicacion?.zonaHoraria || 'America/Argentina/Buenos_Aires'
      const seeded = seedProgressFromEvents(planId, result.eventos, tz)

      trackEvent('PLAN_BUILT', {
        planId,
        eventCount: result.eventos.length,
        progressSeeded: seeded,
        tokensInput: result.tokensUsed.input,
        tokensOutput: result.tokensUsed.output
      })

      return {
        success: true,
        planId,
        nombre: result.nombre,
        resumen: result.resumen,
        eventos: result.eventos,
        tokensUsed: result.tokensUsed
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      trackEvent('ERROR_OCCURRED', { code: 'PLAN_BUILD_FAILED', message })
      return { success: false, error: message }
    }
  })

  // --- Get latest profile ID (session restore) ---
  ipcMain.handle('profile:latest', async () => {
    return getSetting('lastProfileId') ?? null
  })

  // --- Get profile ---
  ipcMain.handle('profile:get', async (_event, profileId: string) => {
    const row = getProfile(profileId)
    if (!row) return null
    return JSON.parse(row.data)
  })

  // --- List plans for profile ---
  ipcMain.handle('plan:list', async (_event, profileId: string) => {
    return getPlansByProfile(profileId)
  })

  // --- List progress for plan + date ---
  ipcMain.handle('progress:list', async (_event, planId: string, fecha: string) => {
    return getProgressByPlanAndDate(planId, fecha)
  })

  // --- Toggle progress completion ---
  ipcMain.handle('progress:toggle', async (_event, progressId: string) => {
    const newValue = toggleProgress(progressId)
    trackEvent('PROGRESS_TOGGLED', { progressId, completado: newValue })
    return { success: true, completado: newValue }
  })
}
