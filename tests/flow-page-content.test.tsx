// @vitest-environment jsdom

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FlowPageContent from '../components/FlowPageContent'
import { t } from '../src/i18n'
import { ACTIVE_WORKFLOW_ID_STORAGE_KEY } from '../src/lib/client/storage-keys'
import type { FlowSessionIntent, FlowSessionResult } from '../src/shared/types/flow-api'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  createSessionMock: vi.fn<() => Promise<FlowSessionResult>>()
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.pushMock,
    replace: mocks.replaceMock
  })
}))

vi.mock('../src/lib/client/flow-client', () => ({
  flowClient: {
    createSession: mocks.createSessionMock
  }
}))

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react')
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => ReactModule.createElement(ReactModule.Fragment, null, children)
  }
})

vi.mock('../components/DebugPanel', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div>
      <span>{t('debug.panel_title')}</span>
      <button type="button" onClick={onClose}>cerrar</button>
    </div>
  )
}))

function buildSessionResult(intent: FlowSessionIntent): FlowSessionResult {
  const stepByIntent: Record<Exclude<FlowSessionIntent, 'default'>, 'gate' | 'objectives' | 'intake'> = {
    'redo-profile': 'intake',
    'change-objectives': 'objectives',
    'restart-flow': 'gate'
  }
  const currentStep = intent === 'default' ? 'gate' : stepByIntent[intent]
  const status = currentStep === 'gate' ? 'draft' : 'in_progress'

  return {
    success: true,
    session: {
      id: 'wf-new',
      userId: null,
      profileId: currentStep === 'gate' ? null : 'profile-1',
      planId: null,
      status,
      currentStep,
      state: {
        gate: currentStep === 'gate'
          ? null
          : {
              choice: 'pulso',
              llmMode: 'service',
              provider: 'openai:gpt-4o-mini',
              backendCredentialId: null,
              hasUserApiKey: false,
              estimatedCostSats: 0,
              estimatedCostUsd: 0,
              ready: true,
              walletRequired: false,
              summary: '',
              updatedAt: '2026-03-22T10:00:00.000Z'
            },
        goals: currentStep === 'gate'
          ? []
          : [{
              id: 'goal-1',
              text: 'Cambiar de trabajo',
              category: 'carrera',
              effort: 'alto',
              isHabit: false,
              needsClarification: false,
              priority: 1,
              horizonMonths: 6,
              hoursPerWeek: 6
            }],
        intakeBlocks: currentStep === 'intake'
          ? [{
              id: 'intake-1',
              title: 'Aterricemos tu meta',
              description: 'Lo justo para entender que significa avanzar en tu caso.',
              questions: [{
                id: 'question-1',
                key: 'goal_clarity',
                label: 'Para poder aterrizar esa meta, como se veria un avance concreto?',
                type: 'textarea',
                placeholder: null,
                options: [],
                min: null,
                max: null,
                step: null,
                unit: null
              }],
              progressLabel: 'Bloque 1 de 1',
              completed: false
            }]
          : [],
        intakeAnswers: {},
        strategy: null,
        realityCheck: null,
        simulation: null,
        presentation: null,
        calendar: null,
        topdown: null,
        activation: {
          activatedAt: null,
          planId: null
        },
        simulationTreeId: null,
        resume: {
          changeSummary: null,
          patchSummary: null,
          askedAt: null
        }
      },
      lastCheckpointCode: intent === 'default' ? null : `${intent}-started`,
      createdAt: '2026-03-22T10:00:00.000Z',
      updatedAt: '2026-03-22T10:00:00.000Z'
    },
    checkpoints: []
  }
}

describe('flow page content bootstrap', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.replaceMock.mockReset()
    mocks.createSessionMock.mockReset()
    window.localStorage.clear()
    window.history.replaceState({}, '', '/flow')
  })

  it.each([
    ['redo-profile', 'intake', 'Aterricemos tu meta'],
    ['change-objectives', 'objectives', t('flow.objectives.title')],
    ['restart-flow', 'gate', t('flow.gate.title')]
  ] as const)('crea la sesion de entrada %s y limpia el query param', async (intent, _expectedStep, expectedTitle) => {
    window.localStorage.setItem(ACTIVE_WORKFLOW_ID_STORAGE_KEY, 'wf-old')
    window.history.replaceState({}, '', `/flow?entry=${intent}`)

    mocks.createSessionMock.mockResolvedValue(buildSessionResult(intent))

    render(<FlowPageContent deploymentMode="local" />)

    await waitFor(() => {
      expect(mocks.createSessionMock).toHaveBeenCalledWith({
        intent,
        sourceWorkflowId: 'wf-old'
      })
    })

    await waitFor(() => {
      expect(window.localStorage.getItem(ACTIVE_WORKFLOW_ID_STORAGE_KEY)).toBe('wf-new')
      expect(mocks.replaceMock).toHaveBeenCalledWith('/flow')
    })

    expect(await screen.findByText(expectedTitle)).toBeTruthy()
  })

  it('abre y cierra el inspector desde /flow', async () => {
    const user = userEvent.setup()
    mocks.createSessionMock.mockResolvedValue(buildSessionResult('default'))

    render(<FlowPageContent deploymentMode="local" />)

    const openButton = await screen.findByRole('button', { name: t('debug.panel_title') })
    await user.click(openButton)

    expect(await screen.findByRole('button', { name: 'cerrar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: t('debug.disable') })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'cerrar' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'cerrar' })).toBeNull()
    })
  })
})
