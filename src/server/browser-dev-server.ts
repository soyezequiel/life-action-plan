import { DateTime } from 'luxon'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import { intakeExpressToProfile } from '../skills/plan-intake'
import { generatePlan } from '../skills/plan-builder'
import { getProvider } from '../providers/provider-factory'
import { buildWithOllamaFallback } from '../utils/plan-build-fallback'
import { createInstrumentedRuntime } from '../debug/instrumented-runtime'
import { traceCollector } from '../debug/trace-collector'
import { calculateHabitStreak } from '../utils/streaks'
import {
  createBrowserPlan,
  createBrowserProfile,
  getBrowserCostSummary,
  getBrowserPlan,
  getBrowserPlanBySlug,
  getBrowserProfile,
  getBrowserSetting,
  listBrowserPlans,
  listBrowserProgressByPlan,
  listBrowserProgressByPlanAndDate,
  setBrowserSetting,
  toggleBrowserProgress,
  trackBrowserCost,
  updateBrowserPlanManifest,
  addBrowserProgress
} from './store/browser-dev-store'
import type {
  IntakeExpressData,
  PlanExportCalendarResult,
  PlanBuildResult,
  PlanSimulationProgress,
  PlanSimulationResult,
  ProgressRow,
  StreakResult,
  WalletConnectResult,
  WalletDisconnectResult,
  WalletStatus
} from '../shared/types/ipc'
import type { Perfil } from '../shared/schemas/perfil'
import type { SkillContext } from '../runtime/types'
import { simulatePlanViabilityWithProgress } from '../skills/plan-simulator'
import { generateIcsCalendar } from '../utils/ics-generator'

const API_PREFIX = '/__lap/api'

interface BrowserDevState {
  debugPanelVisible: boolean
  debugHoldSubscription: (() => void) | null
  simulationListeners: Set<(progress: PlanSimulationProgress) => void>
}

const state: BrowserDevState = {
  debugPanelVisible: false,
  debugHoldSubscription: null,
  simulationListeners: new Set()
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function noContent(res: ServerResponse): void {
  res.statusCode = 204
  res.end()
}

function createUniquePlanSlug(baseSlug: string): string {
  let candidate = baseSlug
  let suffix = 2

  while (getBrowserPlanBySlug(candidate)) {
    candidate = `${baseSlug}-${suffix}`
    suffix += 1
  }

  return candidate
}

function normalizeBaseSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'mi-plan'
}

function getProgressByPlanAndDate(planId: string, fecha: string): ProgressRow[] {
  return listBrowserProgressByPlanAndDate(planId, fecha)
}

function getProgressByPlan(planId: string): ProgressRow[] {
  return listBrowserProgressByPlan(planId)
}

function seedProgressFromEvents(
  planId: string,
  eventos: Array<{ semana: number; dia: string; hora: string; duracion: number; actividad: string; categoria: string; objetivoId: string }>,
  zonaHoraria: string
): number {
  const diasMap: Record<string, number> = {
    lunes: 1, martes: 2, miercoles: 3, miércoles: 3,
    jueves: 4, viernes: 5, sabado: 6, sábado: 6, domingo: 7
  }

  let seeded = 0
  const planStart = DateTime.now().setZone(zonaHoraria).startOf('week')

  for (const evento of eventos) {
    const weekOffset = (evento.semana - 1) * 7
    const dayOffset = (diasMap[evento.dia.toLowerCase()] ?? 1) - 1
    const fecha = planStart.plus({ days: weekOffset + dayOffset }).toISODate() ?? DateTime.now().toISODate() ?? '2026-03-19'
    addBrowserProgress({
      planId,
      fecha,
      tipo: evento.categoria === 'habito' ? 'habito' : 'tarea',
      objetivoId: evento.objetivoId || null,
      descripcion: evento.actividad,
      completado: false,
      notas: JSON.stringify({ hora: evento.hora, duracion: evento.duracion, categoria: evento.categoria })
    })

    seeded += 1
  }

  return seeded
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = []

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  const rawBody = Buffer.concat(chunks).toString('utf8')
  return rawBody ? JSON.parse(rawBody) as T : {} as T
}

function getQuery(requestUrl: string, origin: string): URL {
  return new URL(requestUrl, origin)
}

function toPlanBuildErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown error'
  const normalized = message.toLowerCase()

  if (
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('fetch failed') ||
    normalized.includes('connect') ||
    normalized.includes('econnrefused')
  ) {
    return 'El asistente no se pudo conectar. Intentá de nuevo.'
  }

  return message
}

async function handlePlanBuild(body: { profileId: string; apiKey: string; provider?: string }): Promise<PlanBuildResult> {
  const profileRow = getBrowserProfile(body.profileId)
  const profile = profileRow ? JSON.parse(profileRow.data) as Perfil : null
  if (!profile) {
    return { success: false, error: 'Perfil no encontrado' }
  }

  const modelId = body.provider || 'openai:gpt-4o-mini'
  const ctx: SkillContext = {
    planDir: '',
    profileId: body.profileId,
    userLocale: 'es-AR',
    formalityLevel: 'informal',
    tokenMultiplier: 1.22
  }

  let traceId: string | null = null

  try {
    traceId = traceCollector.startTrace('plan-builder', modelId, { profileId: body.profileId, transport: 'browser-dev' })

    const buildResult = await buildWithOllamaFallback(
      modelId,
      async (nextModelId) => {
        const runtime = getProvider(nextModelId, {
          apiKey: nextModelId.startsWith('ollama:') ? '' : body.apiKey
        })

        return generatePlan(
          createInstrumentedRuntime(runtime, traceId, 'plan-builder', nextModelId),
          profile,
          ctx
        )
      },
      () => {}
    )

    traceCollector.completeTrace(traceId)

    const result = buildResult.result
    const finalModelId = buildResult.modelId
    const fallbackUsed = buildResult.fallbackUsed
    const now = DateTime.utc().toISO() ?? '2026-03-19T00:00:00.000Z'
    const manifest = JSON.stringify({
      nombrePlan: result.nombre,
      creado: now,
      ultimaModificacion: now,
      versionGlobal: 1,
      modo: 'individual',
      planGeneral: 'plan-general.md',
      fallbackUsed,
      ultimoModeloUsado: finalModelId
    })
    const planId = createBrowserPlan(
      body.profileId,
      result.nombre,
      createUniquePlanSlug(normalizeBaseSlug(result.nombre)),
      manifest
    )

    const timezone = profile.participantes[0]?.datosPersonales?.ubicacion?.zonaHoraria || 'America/Argentina/Buenos_Aires'
    seedProgressFromEvents(planId, result.eventos, timezone)

    trackBrowserCost(planId, 'plan_build', finalModelId, result.tokensUsed.input, result.tokensUsed.output)

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
    return {
      success: false,
      error: toPlanBuildErrorMessage(error)
    }
  }
}

function getWalletStatus(): WalletStatus {
  const walletConnected = getBrowserSetting('browserWalletConnected') === 'true'
  return {
    configured: walletConnected,
    connected: walletConnected,
    canUseSecureStorage: false,
    alias: walletConnected ? 'Billetera navegador' : undefined,
    balanceSats: walletConnected ? 21000 : undefined
  }
}

function getOrigin(req: IncomingMessage): string {
  const host = req.headers.host || 'localhost:5173'
  return `http://${host}`
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestUrl = req.url || '/'
  const url = getQuery(requestUrl, getOrigin(req))
  const pathname = url.pathname
  const method = req.method || 'GET'

  if (pathname === `${API_PREFIX}/status` && method === 'GET') {
    json(res, 200, { ok: true })
    return
  }

  if (pathname === `${API_PREFIX}/intake/save` && method === 'POST') {
    const data = await readJsonBody<IntakeExpressData>(req)
    const profile = intakeExpressToProfile(data)
    const profileId = createBrowserProfile(JSON.stringify(profile))
    setBrowserSetting('lastProfileId', profileId)
    json(res, 200, { success: true, profileId })
    return
  }

  if (pathname === `${API_PREFIX}/profile/latest` && method === 'GET') {
    json(res, 200, getBrowserSetting('lastProfileId') ?? null)
    return
  }

  if (pathname === `${API_PREFIX}/profile/get` && method === 'GET') {
    const row = getBrowserProfile(url.searchParams.get('profileId') || '')
    json(res, 200, row ? JSON.parse(row.data) : null)
    return
  }

  if (pathname === `${API_PREFIX}/plan/build` && method === 'POST') {
    json(res, 200, await handlePlanBuild(await readJsonBody<{ profileId: string; apiKey: string; provider?: string }>(req)))
    return
  }

  if (pathname === `${API_PREFIX}/plan/list` && method === 'GET') {
    const profileId = url.searchParams.get('profileId') || ''
    json(res, 200, listBrowserPlans(profileId))
    return
  }

  if (pathname === `${API_PREFIX}/progress/list` && method === 'GET') {
    const planId = url.searchParams.get('planId') || ''
    const fecha = url.searchParams.get('fecha') || ''
    json(res, 200, getProgressByPlanAndDate(planId, fecha))
    return
  }

  if (pathname === `${API_PREFIX}/progress/toggle` && method === 'POST') {
    const { progressId } = await readJsonBody<{ progressId: string }>(req)
    const completado = toggleBrowserProgress(progressId)

    if (completado === null) {
      json(res, 200, { success: false, completado: false })
      return
    }

    json(res, 200, { success: true, completado })
    return
  }

  if (pathname === `${API_PREFIX}/streak/get` && method === 'GET') {
    const planId = url.searchParams.get('planId') || ''
    const todayISO = DateTime.now().setZone('America/Argentina/Buenos_Aires').toISODate() ?? DateTime.now().toISODate() ?? '2026-03-19'
    const result: StreakResult = calculateHabitStreak(getProgressByPlan(planId), todayISO)
    json(res, 200, result)
    return
  }

  if (pathname === `${API_PREFIX}/cost/summary` && method === 'GET') {
    const planId = url.searchParams.get('planId') || ''
    json(res, 200, getBrowserCostSummary(planId))
    return
  }

  if (pathname === `${API_PREFIX}/wallet/status` && method === 'GET') {
    json(res, 200, getWalletStatus())
    return
  }

  if (pathname === `${API_PREFIX}/wallet/connect` && method === 'POST') {
    setBrowserSetting('browserWalletConnected', 'true')
    const result: WalletConnectResult = { success: true, status: getWalletStatus() }
    json(res, 200, result)
    return
  }

  if (pathname === `${API_PREFIX}/wallet/disconnect` && method === 'POST') {
    setBrowserSetting('browserWalletConnected', 'false')
    const result: WalletDisconnectResult = { success: true }
    json(res, 200, result)
    return
  }

  if (pathname === `${API_PREFIX}/plan/simulate` && method === 'POST') {
    const { planId, mode = 'interactive' } = await readJsonBody<{ planId: string; mode?: 'interactive' | 'automatic' }>(req)
    const plan = getBrowserPlan(planId)

    if (!plan) {
      json(res, 200, { success: false, error: 'PLAN_NOT_FOUND' } satisfies PlanSimulationResult)
      return
    }

    const profileRow = getBrowserProfile(plan.profileId)
    const profile = profileRow ? JSON.parse(profileRow.data) as Perfil : null

    if (!profile) {
      json(res, 200, { success: false, error: 'PROFILE_NOT_FOUND' } satisfies PlanSimulationResult)
      return
    }

    const timezone = profile.participantes[0]?.datosPersonales?.ubicacion?.zonaHoraria || 'America/Argentina/Buenos_Aires'
    const simulation = await simulatePlanViabilityWithProgress(profile, getProgressByPlan(planId), {
      timezone,
      locale: 'es-AR',
      mode,
      onProgress: async (progress) => {
        const payload: PlanSimulationProgress = { planId, ...progress }
        for (const listener of state.simulationListeners) {
          listener(payload)
        }
      }
    })

    let manifest: Record<string, unknown> = {}

    try {
      manifest = JSON.parse(plan.manifest) as Record<string, unknown>
    } catch {
      manifest = {}
    }

    updateBrowserPlanManifest(planId, JSON.stringify({
      ...manifest,
      ultimaModificacion: simulation.ranAt,
      ultimaSimulacion: simulation
    }))

    json(res, 200, { success: true, simulation } satisfies PlanSimulationResult)
    return
  }

  if (pathname === `${API_PREFIX}/plan/simulate/events` && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    })
    res.write(': connected\n\n')

    const listener = (progress: PlanSimulationProgress) => {
      res.write(`data: ${JSON.stringify(progress)}\n\n`)
    }

    state.simulationListeners.add(listener)

    req.on('close', () => {
      state.simulationListeners.delete(listener)
      res.end()
    })

    return
  }

  if (pathname === `${API_PREFIX}/plan/export-ics` && method === 'GET') {
    const planId = url.searchParams.get('planId') || ''
    const plan = getBrowserPlan(planId)

    if (!plan) {
      json(res, 200, { success: false, error: 'PLAN_NOT_FOUND' } satisfies PlanExportCalendarResult)
      return
    }

    let timezone = 'America/Argentina/Buenos_Aires'
    const profileRow = getBrowserProfile(plan.profileId)

    if (profileRow) {
      const profile = JSON.parse(profileRow.data) as Perfil
      timezone = profile.participantes[0]?.datosPersonales?.ubicacion?.zonaHoraria || timezone
    }

    const exportDate = DateTime.now().setZone(timezone).toISODate() ?? 'plan'
    const fileName = `lap-${normalizeBaseSlug(plan.nombre)}-${exportDate}.ics`
    const calendar = generateIcsCalendar({
      planName: plan.nombre,
      timezone,
      rows: getProgressByPlan(planId)
    })

    json(res, 200, {
      success: true,
      fileName,
      calendar
    })
    return
  }

  if (pathname === `${API_PREFIX}/debug/enable` && method === 'POST') {
    state.debugPanelVisible = true

    if (!state.debugHoldSubscription) {
      state.debugHoldSubscription = traceCollector.subscribe(() => {})
    }

    json(res, 200, { enabled: true, panelVisible: true })
    return
  }

  if (pathname === `${API_PREFIX}/debug/disable` && method === 'POST') {
    state.debugPanelVisible = false

    if (state.debugHoldSubscription) {
      state.debugHoldSubscription()
      state.debugHoldSubscription = null
    }

    json(res, 200, { enabled: traceCollector.isEnabled(), panelVisible: false })
    return
  }

  if (pathname === `${API_PREFIX}/debug/status` && method === 'GET') {
    json(res, 200, { enabled: traceCollector.isEnabled(), panelVisible: state.debugPanelVisible })
    return
  }

  if (pathname === `${API_PREFIX}/debug/snapshot` && method === 'GET') {
    json(res, 200, { traces: traceCollector.getSnapshot() })
    return
  }

  if (pathname === `${API_PREFIX}/debug/events` && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    })
    res.write(': connected\n\n')

    const unsubscribe = traceCollector.subscribe((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    })

    req.on('close', () => {
      unsubscribe()
      res.end()
    })

    return
  }

  noContent(res)
}

export function createLapBrowserDevPlugin(): Plugin {
  return {
    name: 'lap-browser-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
        if (!(req.url || '').startsWith(API_PREFIX)) {
          next()
          return
        }

        try {
          await handleRequest(req, res)
        } catch (error) {
          json(res, 500, {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      })
    }
  }
}
