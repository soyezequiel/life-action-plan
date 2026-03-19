// Mock window.api for browser-only dev (no Electron)
// Returns fake data so the UI can be developed without the main process

import { DateTime } from 'luxon'
import type { IntakeExpressData } from '../../shared/types/ipc'
import { calculateHabitStreak } from '../../utils/streaks'

const MOCK_PROFILE_ID = 'mock-profile-1'
const MOCK_PLAN_ID = 'mock-plan-1'
const TODAY = DateTime.now().toISODate() ?? '2026-03-18'
const YESTERDAY = DateTime.fromISO(TODAY).minus({ days: 1 }).toISODate() ?? TODAY
const TWO_DAYS_AGO = DateTime.fromISO(TODAY).minus({ days: 2 }).toISODate() ?? TODAY

const mockHabitHistory = [
  { fecha: TWO_DAYS_AGO, tipo: 'habito', completado: true },
  { fecha: YESTERDAY, tipo: 'habito', completado: true }
]

const mockTasks = [
  { id: 'task-1', planId: MOCK_PLAN_ID, fecha: TODAY, tipo: 'tarea', objetivoId: 'obj1', descripcion: 'Estudiar JavaScript 30 min', completado: false, notas: JSON.stringify({ hora: '08:00', duracion: 30, categoria: 'estudio' }), createdAt: TODAY },
  { id: 'task-2', planId: MOCK_PLAN_ID, fecha: TODAY, tipo: 'habito', objetivoId: 'obj1', descripcion: 'Salir a caminar', completado: false, notas: JSON.stringify({ hora: '07:00', duracion: 20, categoria: 'ejercicio' }), createdAt: TODAY },
  { id: 'task-3', planId: MOCK_PLAN_ID, fecha: TODAY, tipo: 'tarea', objetivoId: 'obj1', descripcion: 'Leer un capítulo del libro', completado: true, notas: JSON.stringify({ hora: '21:00', duracion: 20, categoria: 'estudio' }), createdAt: TODAY }
]

const mockApi = {
  intake: {
    save: async (data: IntakeExpressData) => {
      console.log('[mock] intake:save', data)
      return { success: true, profileId: MOCK_PROFILE_ID }
    }
  },
  plan: {
    build: async (profileId: string, _apiKey: string, provider?: string) => {
      console.log('[mock] plan:build', { profileId, provider })
      await new Promise((resolve) => setTimeout(resolve, 2000))
      return {
        success: true,
        planId: MOCK_PLAN_ID,
        nombre: 'Mi Plan de Acción (demo)',
        resumen: 'Este es un plan simulado para desarrollo en navegador. Conectá Electron para generar uno real con IA.',
        eventos: [],
        tokensUsed: { input: 0, output: 0 }
      }
    },
    list: async (profileId: string) => {
      console.log('[mock] plan:list', profileId)
      return [{
        id: MOCK_PLAN_ID,
        profileId,
        nombre: 'Mi Plan de Acción (demo)',
        slug: 'mi-plan-demo',
        manifest: '{}',
        createdAt: TODAY,
        updatedAt: TODAY
      }]
    }
  },
  profile: {
    get: async (_profileId: string) => {
      return {
        version: '3.0',
        participantes: [{ datosPersonales: { nombre: 'María' } }]
      }
    },
    latest: async (): Promise<string | null> => {
      return MOCK_PROFILE_ID
    }
  },
  progress: {
    list: async (_planId: string, _fecha: string) => {
      return mockTasks
    },
    toggle: async (progressId: string) => {
      const task = mockTasks.find((entry) => entry.id === progressId)
      if (task) task.completado = !task.completado
      return { success: true, completado: task?.completado ?? false }
    }
  },
  streak: {
    get: async (_planId: string) => {
      return calculateHabitStreak([...mockHabitHistory, ...mockTasks], TODAY)
    }
  }
}

export function installMockApi(): void {
  if (typeof window !== 'undefined' && !window.api) {
    ;(window as unknown as { api?: typeof mockApi }).api = mockApi
    console.log('[LAP] Running in browser mode — using mock API')
  }
}
