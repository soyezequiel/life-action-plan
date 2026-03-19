import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { posix as pathPosix } from 'node:path'
import { intakeExpressToProfile } from '../skills/plan-intake'
import { generatePlan } from '../skills/plan-builder'
import { getProvider } from '../providers/provider-factory'
import {
  createProfile, getProfile, createPlan, getPlan, updatePlanManifest,
  getPlanBySlug, getPlansByProfile, getProgressByPlan, getProgressByPlanAndDate, toggleProgress,
  seedProgressFromEvents, trackEvent, getSetting, setSetting, getHabitStreak, getCostSummary, trackCost
} from './db/db-helpers'
import type { IntakeExpressData } from '../shared/types/ipc'
import type { Perfil } from '../shared/schemas/perfil'
import type { SkillContext } from '../runtime/types'
import { DateTime } from 'luxon'
import { generateIcsCalendar } from '../utils/ics-generator'
import { t } from '../i18n'
import { getPaymentProvider } from '../providers/payment-provider'
import { clearSecureToken, isSecureStorageAvailable, loadSecureToken, saveSecureToken } from '../auth/token-store'
import type { PaymentProviderStatus } from '../providers/payment-provider'
import type { PlanBuildProgress, SimulationMode, WalletStatus } from '../shared/types/ipc'
import { buildWithOllamaFallback } from '../utils/plan-build-fallback'
import { simulatePlanViabilityWithProgress } from '../skills/plan-simulator'
import { traceCollector } from '../debug/trace-collector'
import { createInstrumentedRuntime } from '../debug/instrumented-runtime'

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/')
}

function sanitizeFileName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'mi-plan'
}

function createUniquePlanSlug(baseSlug: string): string {
  let candidate = baseSlug
  let suffix = 2

  while (getPlanBySlug(candidate)) {
    candidate = `${baseSlug}-${suffix}`
    suffix += 1
  }

  return candidate
}

function toSats(valueMsats: number | null): number | undefined {
  return typeof valueMsats === 'number' ? Math.floor(valueMsats / 1000) : undefined
}

function toWalletStatus(
  snapshot: PaymentProviderStatus | null,
  options: { configured: boolean; connected: boolean; canUseSecureStorage?: boolean }
): WalletStatus {
  return {
    configured: options.configured,
    connected: options.connected,
    canUseSecureStorage: options.canUseSecureStorage ?? isSecureStorageAvailable(),
    alias: snapshot?.alias ?? undefined,
    balanceSats: toSats(snapshot?.balanceMsats ?? null),
    budgetSats: toSats(snapshot?.budgetTotalMsats ?? null),
    budgetUsedSats: toSats(snapshot?.budgetUsedMsats ?? null)
  }
}

function parseManifest(manifest: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(manifest) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function simulationStatusToManifestValue(value: 'PASS' | 'WARN' | 'FAIL' | 'MISSING') {
  return value === 'MISSING' ? 'PENDIENTE' : value
}

function flushRendererFrame(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 120)
  })
}

function toPlanBuildErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown error'
  const normalized = message.toLowerCase()

  if (
    normalized.includes('api key') ||
    normalized.includes('unauthorized') ||
    normalized.includes('authentication') ||
    normalized.includes('401') ||
    normalized.includes('403')
  ) {
    return t('errors.no_api_key')
  }

  if (
    normalized.includes('budget') ||
    normalized.includes('quota') ||
    normalized.includes('insufficient')
  ) {
    return t('errors.budget_exceeded')
  }

  if (
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('tard') ||
    normalized.includes('fetch failed') ||
    normalized.includes('connect') ||
    normalized.includes('econnrefused')
  ) {
    return t('errors.connection_busy')
  }

  if (
    message.startsWith('El asistente ') ||
    message.startsWith('No pude ') ||
    message === 'Perfil no encontrado'
  ) {
    return message
  }

  return t('errors.generic')
}

export function registerIpcHandlers(): void {
  ipcMain.handle('debug:enable', async (event) => {
    traceCollector.enable(event.sender)
    setSetting('debugPanelVisible', 'true')

    return {
      enabled: traceCollector.isEnabled(),
      panelVisible: true
    }
  })

  ipcMain.handle('debug:disable', async () => {
    traceCollector.disable()
    setSetting('debugPanelVisible', 'false')

    return {
      enabled: false,
      panelVisible: false
    }
  })

  ipcMain.handle('debug:status', async () => {
    return {
      enabled: traceCollector.isEnabled(),
      panelVisible: getSetting('debugPanelVisible') === 'true'
    }
  })

  ipcMain.handle('debug:snapshot', async () => {
    return {
      traces: traceCollector.getSnapshot()
    }
  })

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
  ipcMain.handle('plan:build', async (event, profileId: string, apiKey: string, provider?: string) => {
    let traceId: string | null = null
    let streamedCharCount = 0
    const totalStages = 4
    const emitBuildProgress = (
      stage: PlanBuildProgress['stage'],
      current: number,
      buildProvider: string,
      chunk?: string
    ): void => {
      event.sender.send('plan:build:progress', {
        profileId,
        provider: buildProvider,
        stage,
        current,
        total: totalStages,
        charCount: streamedCharCount,
        ...(chunk ? { chunk } : {})
      } satisfies PlanBuildProgress)
    }

    try {
      const profileRow = getProfile(profileId)
      if (!profileRow) {
        return { success: false, error: 'Perfil no encontrado' }
      }

      const profile: Perfil = JSON.parse(profileRow.data)

      const modelId = provider || 'openai:gpt-4o-mini'
      const ctx: SkillContext = {
        planDir: '',
        profileId,
        userLocale: 'es-AR',
        formalityLevel: 'informal',
        tokenMultiplier: 1.22
      }

      trackEvent('PLAN_BUILD_STARTED', { profileId, modelId })
      emitBuildProgress('preparing', 1, modelId)

      if (getSetting('debugPanelVisible') === 'true' && !traceCollector.isEnabled()) {
        traceCollector.enable(event.sender)
      }

      traceId = traceCollector.startTrace('plan-builder', modelId, { profileId })
      const buildResult = await buildWithOllamaFallback(
        modelId,
        async (nextModelId) => {
          const runtime = getProvider(nextModelId, {
            apiKey: nextModelId.startsWith('ollama:') ? '' : apiKey
          })
          const instrumentedRuntime = createInstrumentedRuntime(
            runtime,
            traceId,
            'plan-builder',
            nextModelId
          )

          return generatePlan(instrumentedRuntime, profile, ctx, {
            onStageChange: (stage) => {
              if (stage === 'generating') {
                emitBuildProgress('generating', 2, nextModelId)
              } else if (stage === 'validating') {
                emitBuildProgress('validating', 3, nextModelId)
              }
            },
            onToken: (chunk) => {
              streamedCharCount += chunk.length
              emitBuildProgress('generating', 2, nextModelId, chunk)
            }
          })
        },
        (originalError) => {
          trackEvent('PLAN_BUILD_FALLBACK', {
            profileId,
            originalModel: modelId,
            originalError: originalError.message
          })
        }
      )
      traceCollector.completeTrace(traceId)
      const result = buildResult.result
      const fallbackUsed = buildResult.fallbackUsed
      const finalModelId = buildResult.modelId

      emitBuildProgress('saving', 4, finalModelId)

      // Save plan to DB
      const now = DateTime.utc().toISO()!
      const baseSlug = result.nombre
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50) || 'mi-plan'
      const slug = createUniquePlanSlug(baseSlug)

      const manifest = JSON.stringify({
        nombrePlan: result.nombre,
        creado: now,
        ultimaModificacion: now,
        versionGlobal: 1,
        modo: 'individual',
        planGeneral: 'plan-general.md',
        fallbackUsed,
        ultimoModeloUsado: finalModelId,
        horizontePlan: { anosTotal: 1, estrategia: 'completo' },
        granularidadCompletada: { anual: false, mensual: [], diario: [] },
        estadoSimulacion: {},
        versionesArchivos: {},
        checkpoint: { operacion: 'build', iteracionActual: 1, maxIteraciones: 5, itemsPendientes: [], ultimoPasoCompletado: 'plan-builder', granularidad: 'mensual', periodoObjetivo: null, periodosValidados: [], periodosPendientes: [] },
        ramas: {},
        archivados: {},
        ultimaSimulacion: null,
        costoAcumulado: {
          llamadasModelo: { alto: 1, medio: 0, bajo: 0 },
          tokensInput: result.tokensUsed.input,
          tokensOutput: result.tokensUsed.output,
          estimacionUSD: 0,
          estimacionSats: 0
        }
      })

      const planId = createPlan(profileId, result.nombre, slug, manifest)
      const costEntry = trackCost(
        planId,
        'plan_build',
        finalModelId,
        result.tokensUsed.input,
        result.tokensUsed.output
      )
      updatePlanManifest(planId, JSON.stringify({
        ...JSON.parse(manifest),
        costoAcumulado: {
          llamadasModelo: { alto: 1, medio: 0, bajo: 0 },
          tokensInput: result.tokensUsed.input,
          tokensOutput: result.tokensUsed.output,
          estimacionUSD: costEntry.costUsd,
          estimacionSats: costEntry.costSats
        }
      }))

      // Seed individual progress rows from plan events
      const tz = profile.participantes[0]?.datosPersonales?.ubicacion?.zonaHoraria || 'America/Argentina/Buenos_Aires'
      const seeded = seedProgressFromEvents(planId, result.eventos, tz)

      trackEvent('PLAN_BUILT', {
        planId,
        modelId: finalModelId,
        fallbackUsed,
        eventCount: result.eventos.length,
        progressSeeded: seeded,
        tokensInput: result.tokensUsed.input,
        tokensOutput: result.tokensUsed.output,
        costUsd: costEntry.costUsd,
        costSats: costEntry.costSats
      })

      return {
        success: true,
        planId,
        nombre: result.nombre,
        resumen: result.resumen,
        eventos: result.eventos,
        tokensUsed: result.tokensUsed,
        fallbackUsed
      }
    } catch (error) {
      traceCollector.failTrace(traceId, error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      const stack = error instanceof Error ? error.stack : ''
      console.error('[LAP] plan:build failed —', message)
      if (stack) console.error('[LAP] stack:', stack)
      trackEvent('ERROR_OCCURRED', { code: 'PLAN_BUILD_FAILED', message })
      return { success: false, error: toPlanBuildErrorMessage(error) }
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

  // --- Wallet secure status ---
  ipcMain.handle('wallet:status', async () => {
    if (!isSecureStorageAvailable()) {
      return toWalletStatus(null, { configured: false, connected: false, canUseSecureStorage: false })
    }

    const connectionUrl = await loadSecureToken('wallet-nwc')
    if (!connectionUrl) {
      return toWalletStatus(null, { configured: false, connected: false })
    }

    let provider: ReturnType<typeof getPaymentProvider> | null = null

    try {
      provider = getPaymentProvider('nwc', { connectionUrl })
      const snapshot = await provider.getStatus()
      return toWalletStatus(snapshot, { configured: true, connected: true })
    } catch {
      return toWalletStatus(null, { configured: true, connected: false })
    } finally {
      provider?.close()
    }
  })

  // --- Wallet connect + save secure secret ---
  ipcMain.handle('wallet:connect', async (_event, connectionUrl: string) => {
    const canUseSecureStorage = isSecureStorageAvailable()
    if (!canUseSecureStorage) {
      return {
        success: false,
        status: toWalletStatus(null, { configured: false, connected: false, canUseSecureStorage: false }),
        error: 'SECURE_STORAGE_UNAVAILABLE'
      }
    }

    let provider: ReturnType<typeof getPaymentProvider> | null = null

    try {
      provider = getPaymentProvider('nwc', { connectionUrl })
      const snapshot = await provider.getStatus()
      await saveSecureToken('wallet-nwc', connectionUrl)
      trackEvent('WALLET_CONNECTED', {
        alias: snapshot.alias,
        network: snapshot.network
      })

      return {
        success: true,
        status: toWalletStatus(snapshot, { configured: true, connected: true })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      trackEvent('ERROR_OCCURRED', { code: 'WALLET_CONNECT_FAILED', message })
      return {
        success: false,
        status: toWalletStatus(null, { configured: false, connected: false }),
        error: message
      }
    } finally {
      provider?.close()
    }
  })

  // --- Wallet disconnect ---
  ipcMain.handle('wallet:disconnect', async () => {
    await clearSecureToken('wallet-nwc')
    trackEvent('WALLET_DISCONNECTED')
    return { success: true }
  })

  // --- List plans for profile ---
  ipcMain.handle('plan:list', async (_event, profileId: string) => {
    return getPlansByProfile(profileId)
  })

  // --- Cost summary for active plan ---
  ipcMain.handle('cost:summary', async (_event, planId: string) => {
    return getCostSummary(planId)
  })

  // --- Simulate current plan viability ---
  ipcMain.handle('plan:simulate', async (event, planId: string, mode: SimulationMode = 'interactive') => {
    try {
      const planRow = getPlan(planId)
      if (!planRow) {
        return { success: false, error: 'PLAN_NOT_FOUND' }
      }

      const profileRow = getProfile(planRow.profileId)
      if (!profileRow) {
        return { success: false, error: 'PROFILE_NOT_FOUND' }
      }

      const profile: Perfil = JSON.parse(profileRow.data)
      const timezone = profile.participantes[0]?.datosPersonales?.ubicacion?.zonaHoraria || 'America/Argentina/Buenos_Aires'
      const rows = getProgressByPlan(planId)
      const simulation = await simulatePlanViabilityWithProgress(profile, rows, {
        timezone,
        locale: 'es-AR',
        mode,
        onProgress: async (progress) => {
          event.sender.send('plan:simulate:progress', {
            planId,
            ...progress
          })
          await flushRendererFrame()
        }
      })
      const manifest = parseManifest(planRow.manifest)
      const periodKey = DateTime.now().setZone(timezone).toFormat('yyyy-MM')
      const findings = simulation.findings
      const hasMissingSimulationData = findings.some((finding) => finding.code === 'missing_schedule' || finding.code === 'no_plan_items')
      const nextManifest = {
        ...manifest,
        ultimaModificacion: simulation.ranAt,
        estadoSimulacion: {
          ...(manifest.estadoSimulacion && typeof manifest.estadoSimulacion === 'object' ? manifest.estadoSimulacion : {}),
          'viabilidad-general': simulationStatusToManifestValue(simulation.summary.overallStatus),
          horarios: hasMissingSimulationData
            ? 'PENDIENTE'
            : findings.some((finding) => finding.code === 'outside_awake_hours')
              ? 'FAIL'
              : 'PASS',
          trabajo: hasMissingSimulationData
            ? 'PENDIENTE'
            : findings.some((finding) => finding.code === 'overlaps_work')
              ? 'FAIL'
              : 'PASS',
          carga: hasMissingSimulationData
            ? 'PENDIENTE'
            : findings.some((finding) => finding.code === 'day_over_capacity')
              ? 'FAIL'
              : findings.some((finding) => finding.code === 'day_high_load' || finding.code === 'too_many_activities')
                ? 'WARN'
                : 'PASS',
          datos: hasMissingSimulationData
            ? 'PENDIENTE'
            : 'PASS'
        },
        checkpoint: {
          ...(manifest.checkpoint && typeof manifest.checkpoint === 'object' ? manifest.checkpoint : {}),
          operacion: simulation.summary.missing > 0 ? 'simulacion-parcial' : 'simulacion',
          iteracionActual: 1,
          maxIteraciones: 5,
          ultimoPasoCompletado: 'plan-simulator',
          granularidad: 'mensual',
          periodoObjetivo: periodKey,
          periodosValidados: simulation.summary.overallStatus === 'FAIL' ? [] : [periodKey],
          periodosPendientes: simulation.summary.overallStatus === 'FAIL' || simulation.summary.missing > 0 ? [periodKey] : []
        },
        ultimaSimulacion: simulation
      }

      updatePlanManifest(planId, JSON.stringify(nextManifest))
      trackEvent('SIMULATION_RAN', {
        planId,
        mode,
        overallStatus: simulation.summary.overallStatus,
        pass: simulation.summary.pass,
        warn: simulation.summary.warn,
        fail: simulation.summary.fail,
        missing: simulation.summary.missing
      })

      return {
        success: true,
        simulation
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      trackEvent('ERROR_OCCURRED', { code: 'PLAN_SIMULATION_FAILED', message, planId })
      return { success: false, error: message }
    }
  })

  // --- Export plan progress as calendar file ---
  ipcMain.handle('plan:export-ics', async (event, planId: string) => {
    try {
      const planRow = getPlan(planId)
      if (!planRow) {
        return { success: false, error: 'PLAN_NOT_FOUND' }
      }

      let timezone = 'America/Argentina/Buenos_Aires'
      const profileRow = getProfile(planRow.profileId)

      if (profileRow) {
        try {
          const profile: Perfil = JSON.parse(profileRow.data)
          timezone = profile.participantes[0]?.datosPersonales?.ubicacion?.zonaHoraria || timezone
        } catch {
          timezone = 'America/Argentina/Buenos_Aires'
        }
      }

      const calendar = generateIcsCalendar({
        planName: planRow.nombre,
        timezone,
        rows: getProgressByPlan(planId)
      })

      const nowInZone = DateTime.now().setZone(timezone)
      const exportDate = nowInZone.isValid
        ? nowInZone.toISODate()
        : DateTime.now().toISODate()
      const defaultFileName = `lap-${sanitizeFileName(planRow.nombre)}-${exportDate || 'plan'}.ics`
      const defaultPath = pathPosix.join(toPosixPath(app.getPath('documents')), defaultFileName)
      const browserWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const saveDialogOptions = {
        defaultPath,
        filters: [{ name: t('calendar.file_type'), extensions: ['ics'] }]
      }
      const saveResult = browserWindow
        ? await dialog.showSaveDialog(browserWindow, saveDialogOptions)
        : await dialog.showSaveDialog(saveDialogOptions)

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, cancelled: true }
      }

      const filePath = toPosixPath(saveResult.filePath)
      await writeFile(filePath, calendar, 'utf8')

      trackEvent('PLAN_CALENDAR_EXPORTED', { planId, filePath })
      return { success: true, filePath }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      trackEvent('ERROR_OCCURRED', { code: 'PLAN_EXPORT_ICS_FAILED', message, planId })
      return { success: false, error: message }
    }
  })

  // --- List progress for plan + date ---
  ipcMain.handle('progress:list', async (_event, planId: string, fecha: string) => {
    return getProgressByPlanAndDate(planId, fecha)
  })

  // --- Get current/best streak for habits in a plan ---
  ipcMain.handle('streak:get', async (_event, planId: string) => {
    const planRow = getPlan(planId)
    if (!planRow) return { current: 0, best: 0 }

    let timezone = 'America/Argentina/Buenos_Aires'
    const profileRow = getProfile(planRow.profileId)

    if (profileRow) {
      try {
        const profile: Perfil = JSON.parse(profileRow.data)
        timezone = profile.participantes[0]?.datosPersonales?.ubicacion?.zonaHoraria || timezone
      } catch {
        timezone = 'America/Argentina/Buenos_Aires'
      }
    }

    const todayISO = DateTime.now().setZone(timezone).toISODate() ?? DateTime.now().toISODate()!
    return getHabitStreak(planId, todayISO)
  })

  // --- Toggle progress completion ---
  ipcMain.handle('progress:toggle', async (_event, progressId: string) => {
    const newValue = toggleProgress(progressId)
    trackEvent('PROGRESS_TOGGLED', { progressId, completado: newValue })
    return { success: true, completado: newValue }
  })
}
