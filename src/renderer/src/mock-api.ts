import { DateTime } from 'luxon'
import type {
  CostSummary,
  DebugEvent,
  DebugSpan,
  DebugTraceSnapshot,
  IntakeExpressData,
  PlanBuildProgress,
  PlanExportCalendarResult,
  PlanSimulationProgress,
  PlanSimulationSnapshot,
  SimulationMode
} from '../../shared/types/ipc'
import type { LapAPI } from '../../shared/types/lap-api'
import type { Perfil } from '../../shared/schemas/perfil'
import { calculateHabitStreak } from '../../utils/streaks'

const MOCK_PROFILE_ID = 'mock-profile-1'
const MOCK_PLAN_ID = 'mock-plan-1'
const TODAY = DateTime.now().toISODate() ?? '2026-03-19'
const YESTERDAY = DateTime.fromISO(TODAY).minus({ days: 1 }).toISODate() ?? TODAY
const TWO_DAYS_AGO = DateTime.fromISO(TODAY).minus({ days: 2 }).toISODate() ?? TODAY

const mockProfile: Perfil = {
  version: '3.0',
  planificacionConjunta: false,
  participantes: [
    {
      id: 'p1',
      datosPersonales: {
        nombre: 'Maria',
        edad: 31,
        sexo: 'no-especificado',
        ubicacion: {
          ciudad: 'Buenos Aires',
          pais: 'AR',
          zonaHoraria: 'America/Argentina/Buenos_Aires',
          zonaHorariaSecundaria: null,
          feriadosRelevantes: [],
          conectividad: 'alta',
          accesoCursos: 'online',
          distanciaCentroUrbano: 0,
          transporteDisponible: 'publico',
          adversidadesLocales: []
        },
        idioma: 'es',
        nivelAcademico: 'no-especificado',
        nivelEconomico: 'medio',
        narrativaPersonal: 'Disenadora freelance'
      },
      dependientes: [],
      habilidades: {
        actuales: [],
        aprendiendo: []
      },
      condicionesSalud: [],
      patronesEnergia: {
        cronotipo: 'neutro',
        horarioPicoEnergia: '09:00-12:00',
        horarioBajoEnergia: '14:00-16:00',
        horasProductivasMaximas: 6
      },
      problemasActuales: [],
      patronesConocidos: {
        diaTipicoBueno: '',
        diaTipicoMalo: '',
        tendencias: []
      },
      rutinaDiaria: {
        porDefecto: {
          despertar: '07:00',
          dormir: '23:00',
          trabajoInicio: '09:00',
          trabajoFin: '18:00',
          tiempoTransporte: 30
        },
        fasesHorario: []
      },
      calendario: {
        fuente: 'ninguno',
        eventosInamovibles: [],
        eventosFlexibles: [],
        horasLibresEstimadas: {
          diasLaborales: 4,
          diasDescanso: 10
        }
      },
      compromisos: []
    }
  ],
  objetivos: [
    {
      id: 'obj1',
      descripcion: 'Quiero ordenar mi rutina y sostener habitos',
      tipo: 'meta',
      responsable: 'p1',
      prioridad: 3,
      plazo: null,
      tipoTimeline: 'controlable',
      rangoEstimado: {
        optimista: null,
        probable: null,
        pesimista: null
      },
      motivacion: 'Quiero ordenar mi rutina y sostener habitos',
      relaciones: [],
      horasSemanalesEstimadas: 10
    }
  ],
  estadoDinamico: {
    ultimaActualizacion: DateTime.utc().toISO() ?? '2026-03-19T12:00:00.000Z',
    salud: 'buena',
    nivelEnergia: 'medio',
    estadoEmocional: {
      motivacion: 3,
      estres: 2,
      satisfaccion: 3
    },
    notasTemporales: [],
    umbralStaleness: 7
  }
}

const mockHabitHistory = [
  { fecha: TWO_DAYS_AGO, tipo: 'habito', completado: true },
  { fecha: YESTERDAY, tipo: 'habito', completado: true }
]

const mockTasks = [
  {
    id: 'task-1',
    planId: MOCK_PLAN_ID,
    fecha: TODAY,
    tipo: 'tarea',
    objetivoId: 'obj1',
    descripcion: 'Estudiar JavaScript 30 min',
    completado: false,
    notas: JSON.stringify({ hora: '08:00', duracion: 30, categoria: 'estudio' }),
    createdAt: TODAY
  },
  {
    id: 'task-2',
    planId: MOCK_PLAN_ID,
    fecha: TODAY,
    tipo: 'habito',
    objetivoId: 'obj1',
    descripcion: 'Salir a caminar',
    completado: false,
    notas: JSON.stringify({ hora: '07:00', duracion: 20, categoria: 'ejercicio' }),
    createdAt: TODAY
  },
  {
    id: 'task-3',
    planId: MOCK_PLAN_ID,
    fecha: TODAY,
    tipo: 'tarea',
    objetivoId: 'obj1',
    descripcion: 'Leer un capitulo del libro',
    completado: true,
    notas: JSON.stringify({ hora: '21:00', duracion: 20, categoria: 'estudio' }),
    createdAt: TODAY
  }
]

let mockWalletConnected = false
let mockFallbackUsed = false
let mockSimulation: PlanSimulationSnapshot | null = null
let mockCostSummary: CostSummary = {
  planId: MOCK_PLAN_ID,
  tokensInput: 3600,
  tokensOutput: 900,
  costUsd: 0.00108,
  costSats: 2
}
let mockDebugEnabled = false
let mockDebugPanelVisible = false
let mockDebugTraces: DebugTraceSnapshot[] = []

const buildProgressListeners = new Set<(progress: PlanBuildProgress) => void>()
const simulationProgressListeners = new Set<(progress: PlanSimulationProgress) => void>()
const debugListeners = new Set<(event: DebugEvent) => void>()

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function emitBuildProgress(progress: PlanBuildProgress): void {
  for (const listener of buildProgressListeners) {
    listener(progress)
  }
}

function emitSimulationProgress(progress: PlanSimulationProgress): void {
  for (const listener of simulationProgressListeners) {
    listener(progress)
  }
}

function emitDebugEvent(event: DebugEvent): void {
  for (const listener of debugListeners) {
    listener(event)
  }
}

function createMockDebugSpan(traceId: string, spanId: string, provider: string, startedAt: string): DebugSpan {
  return {
    traceId,
    spanId,
    parentSpanId: null,
    skillName: 'plan-builder',
    provider,
    type: 'stream',
    status: 'pending',
    messages: [
      { role: 'system', content: 'Devolve solo JSON con un plan realista.' },
      { role: 'user', content: 'Perfil demo con objetivo de constancia.' }
    ],
    response: null,
    error: null,
    usage: null,
    startedAt,
    completedAt: null,
    durationMs: null,
    metadata: {}
  }
}

async function emitMockDebugTrace(provider = 'ollama:qwen3:8b'): Promise<void> {
  if (!mockDebugEnabled) {
    return
  }

  const traceId = crypto.randomUUID()
  const spanId = crypto.randomUUID()
  const startedAt = DateTime.utc().toISO() ?? '2026-03-19T12:00:00.000Z'
  const promptTokens = provider.startsWith('ollama:') ? 2800 : 4200
  const completionTokens = provider.startsWith('ollama:') ? 700 : 1100
  const response = [
    provider.startsWith('ollama:')
      ? '<think>Voy a acomodar horarios, descanso y habitos antes de responder.</think>\n'
      : '',
    '{"nombre":"Plan demo debug","resumen":"Resumen de prueba","eventos":[{"semana":1,"dia":"lunes","hora":"08:00","duracion":30,"actividad":"Practicar foco","categoria":"habito","objetivoId":"obj1"}]}'
  ].join('')
  const chunks = response.match(/.{1,18}/g) ?? [response]

  emitDebugEvent({
    type: 'trace:start',
    traceId,
    spanId: null,
    timestamp: startedAt,
    data: {
      skillName: 'plan-builder',
      provider
    }
  })

  emitDebugEvent({
    type: 'span:start',
    traceId,
    spanId,
    timestamp: startedAt,
    data: {
      span: createMockDebugSpan(traceId, spanId, provider, startedAt)
    }
  })

  mockDebugTraces = [
    {
      traceId,
      skillName: 'plan-builder',
      provider,
      startedAt,
      completedAt: null,
      error: null,
      metadata: {},
      spans: [createMockDebugSpan(traceId, spanId, provider, startedAt)]
    },
    ...mockDebugTraces.filter((trace) => trace.traceId !== traceId)
  ].slice(0, 50)

  for (const chunk of chunks) {
    if (!mockDebugEnabled) {
      return
    }

    emitDebugEvent({
      type: 'span:token',
      traceId,
      spanId,
      timestamp: DateTime.utc().toISO() ?? startedAt,
      data: {
        tokens: [chunk]
      }
    })
    await wait(50)
  }

  const completedAt = DateTime.utc().toISO() ?? startedAt
  const durationMs = Math.max(DateTime.fromISO(completedAt).toMillis() - DateTime.fromISO(startedAt).toMillis(), 0)
  const completedSpan: DebugSpan = {
    ...createMockDebugSpan(traceId, spanId, provider, startedAt),
    status: 'completed',
    response,
    usage: {
      promptTokens,
      completionTokens
    },
    completedAt,
    durationMs
  }

  emitDebugEvent({
    type: 'span:complete',
    traceId,
    spanId,
    timestamp: completedAt,
    data: {
      span: completedSpan
    }
  })

  mockDebugTraces = mockDebugTraces.map((trace) => (
    trace.traceId === traceId
      ? {
          ...trace,
          completedAt,
          spans: trace.spans.map((span) => (span.spanId === spanId ? completedSpan : span))
        }
      : trace
  ))

  emitDebugEvent({
    type: 'trace:complete',
    traceId,
    spanId: null,
    timestamp: completedAt,
    data: {
      skillName: 'plan-builder',
      provider
    }
  })
}

export const mockLapApi: LapAPI = {
  intake: {
    save: async (_data: IntakeExpressData) => ({ success: true, profileId: MOCK_PROFILE_ID })
  },
  plan: {
    build: async (_profileId: string, _apiKey: string, provider?: string) => {
      const resolvedProvider = provider ?? 'ollama:qwen3:8b'
      const streamedDraft = JSON.stringify({
        nombre: 'Mi Plan de Accion (demo)',
        resumen: 'Este es un plan demo para seguir trabajando la UI cuando no hay backend web.',
        eventos: []
      })
      const chunks = streamedDraft.match(/.{1,20}/g) ?? [streamedDraft]
      let charCount = 0

      emitBuildProgress({
        profileId: MOCK_PROFILE_ID,
        provider: resolvedProvider,
        stage: 'preparing',
        current: 1,
        total: 4,
        charCount
      })
      await wait(120)

      emitBuildProgress({
        profileId: MOCK_PROFILE_ID,
        provider: resolvedProvider,
        stage: 'generating',
        current: 2,
        total: 4,
        charCount
      })

      for (const chunk of chunks) {
        charCount += chunk.length
        emitBuildProgress({
          profileId: MOCK_PROFILE_ID,
          provider: resolvedProvider,
          stage: 'generating',
          current: 2,
          total: 4,
          charCount,
          chunk
        })
        await wait(45)
      }

      emitBuildProgress({
        profileId: MOCK_PROFILE_ID,
        provider: resolvedProvider,
        stage: 'validating',
        current: 3,
        total: 4,
        charCount
      })

      await Promise.all([
        wait(240),
        emitMockDebugTrace(resolvedProvider)
      ])

      const isLocalBuild = resolvedProvider.startsWith('ollama:')
      mockFallbackUsed = false
      mockSimulation = null
      mockCostSummary = isLocalBuild
        ? {
            planId: MOCK_PLAN_ID,
            tokensInput: 2800,
            tokensOutput: 700,
            costUsd: 0,
            costSats: 0
          }
        : {
            planId: MOCK_PLAN_ID,
            tokensInput: 4200,
            tokensOutput: 1100,
            costUsd: 0.00129,
            costSats: 2
          }

      emitBuildProgress({
        profileId: MOCK_PROFILE_ID,
        provider: resolvedProvider,
        stage: 'saving',
        current: 4,
        total: 4,
        charCount
      })
      await wait(90)

      return {
        success: true,
        planId: MOCK_PLAN_ID,
        nombre: 'Mi Plan de Accion (demo)',
        resumen: 'Este es un plan demo para seguir trabajando la UI cuando no hay backend web.',
        eventos: [],
        tokensUsed: {
          input: mockCostSummary.tokensInput,
          output: mockCostSummary.tokensOutput
        },
        fallbackUsed: mockFallbackUsed
      }
    },
    onBuildProgress: (listener: (progress: PlanBuildProgress) => void) => {
      buildProgressListeners.add(listener)
      return () => {
        buildProgressListeners.delete(listener)
      }
    },
    list: async (profileId: string) => [
      {
        id: MOCK_PLAN_ID,
        profileId,
        nombre: 'Mi Plan de Accion (demo)',
        slug: 'mi-plan-demo',
        manifest: JSON.stringify({
          fallbackUsed: mockFallbackUsed,
          ultimaSimulacion: mockSimulation
        }),
        createdAt: TODAY,
        updatedAt: TODAY
      }
    ],
    onSimulationProgress: (listener: (progress: PlanSimulationProgress) => void) => {
      simulationProgressListeners.add(listener)
      return () => {
        simulationProgressListeners.delete(listener)
      }
    },
    simulate: async (_planId: string, mode: SimulationMode = 'interactive') => {
      const stages: PlanSimulationProgress['stage'][] = ['schedule', 'work', 'load', 'summary']

      for (const [index, stage] of stages.entries()) {
        emitSimulationProgress({
          planId: MOCK_PLAN_ID,
          mode,
          stage,
          current: index + 1,
          total: stages.length
        })
        await wait(mode === 'automatic' ? 280 : 220)
      }

      mockSimulation = {
        ranAt: DateTime.now().toISO() ?? `${TODAY}T10:00:00`,
        mode,
        periodLabel: DateTime.now().setLocale('es-AR').toFormat('LLLL yyyy'),
        summary: {
          overallStatus: mode === 'automatic' ? 'WARN' : 'FAIL',
          pass: 2,
          warn: mode === 'automatic' ? 2 : 1,
          fail: mode === 'automatic' ? 0 : 1,
          missing: 0
        },
        findings: mode === 'automatic'
          ? [
              { status: 'WARN', code: 'day_high_load', params: { dayLabel: 'viernes 20/03', planned: 180, available: 240 } },
              { status: 'WARN', code: 'too_many_activities', params: { dayLabel: 'sabado 21/03', count: 4 } },
              { status: 'PASS', code: 'schedule_ok' },
              { status: 'PASS', code: 'metadata_ok' }
            ]
          : [
              { status: 'FAIL', code: 'day_over_capacity', params: { dayLabel: 'viernes 20/03', planned: 310, available: 240 } },
              { status: 'WARN', code: 'too_many_activities', params: { dayLabel: 'sabado 21/03', count: 4 } },
              { status: 'PASS', code: 'metadata_ok' }
            ]
      }

      return {
        success: true,
        simulation: mockSimulation
      }
    },
    exportCalendar: async (_planId: string): Promise<PlanExportCalendarResult> => {
      await wait(250)
      return { success: true, filePath: 'F:/mock/lap-demo.ics' }
    }
  },
  profile: {
    get: async (_profileId: string) => mockProfile,
    latest: async () => MOCK_PROFILE_ID
  },
  progress: {
    list: async (_planId: string, _fecha: string) => mockTasks,
    toggle: async (progressId: string) => {
      const task = mockTasks.find((entry) => entry.id === progressId)
      if (task) {
        task.completado = !task.completado
      }

      return {
        success: true,
        completado: task?.completado ?? false
      }
    }
  },
  streak: {
    get: async (_planId: string) => calculateHabitStreak([...mockHabitHistory, ...mockTasks], TODAY)
  },
  wallet: {
    status: async () => ({
      configured: mockWalletConnected,
      connected: mockWalletConnected,
      canUseSecureStorage: true,
      alias: mockWalletConnected ? 'Billetera demo' : undefined,
      balanceSats: mockWalletConnected ? 21000 : undefined
    }),
    connect: async (connectionUrl: string) => {
      await wait(300)

      if (!connectionUrl.trim().startsWith('nostr+walletconnect://')) {
        return {
          success: false,
          status: {
            configured: false,
            connected: false,
            canUseSecureStorage: true
          },
          error: 'INVALID_NWC_URL'
        }
      }

      mockWalletConnected = true

      return {
        success: true,
        status: {
          configured: true,
          connected: true,
          canUseSecureStorage: true,
          alias: 'Billetera demo',
          balanceSats: 21000
        }
      }
    },
    disconnect: async () => {
      mockWalletConnected = false
      return { success: true }
    }
  },
  cost: {
    summary: async (_planId: string) => mockCostSummary
  },
  debug: {
    enable: async () => {
      mockDebugEnabled = true
      mockDebugPanelVisible = true
      return { enabled: true, panelVisible: true }
    },
    disable: async () => {
      mockDebugEnabled = false
      mockDebugPanelVisible = false
      return { enabled: false, panelVisible: false }
    },
    status: async () => ({
      enabled: mockDebugEnabled,
      panelVisible: mockDebugPanelVisible
    }),
    snapshot: async () => ({
      traces: mockDebugTraces
    }),
    onEvent: (listener: (event: DebugEvent) => void) => {
      debugListeners.add(listener)
      return () => {
        debugListeners.delete(listener)
      }
    }
  }
}
