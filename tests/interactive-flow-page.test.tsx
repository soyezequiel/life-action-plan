// @vitest-environment jsdom

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InteractiveFlowPage } from '../components/flow-interactive/InteractiveFlowPage'
import { t } from '../src/i18n'
import {
  ACTIVE_INTERACTIVE_SESSION_ID_STORAGE_KEY,
  ACTIVE_WORKFLOW_ID_STORAGE_KEY,
  LOCAL_PROFILE_ID_STORAGE_KEY
} from '../src/lib/client/storage-keys'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  createSessionMock: vi.fn(),
  getSessionMock: vi.fn(),
  applyInputMock: vi.fn(),
  deleteSessionMock: vi.fn()
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.pushMock
  })
}))

vi.mock('../src/lib/client/interactive-flow-client', () => ({
  interactiveFlowClient: {
    createSession: mocks.createSessionMock,
    getSession: mocks.getSessionMock,
    applyInput: mocks.applyInputMock,
    deleteSession: mocks.deleteSessionMock
  }
}))

vi.mock('../components/flow-interactive/ClassifyReviewStep', () => ({
  ClassifyReviewStep: () => <div>classify-step</div>
}))

vi.mock('../components/flow-interactive/RequirementsAnswerStep', () => ({
  RequirementsAnswerStep: () => <div>requirements-step</div>
}))

vi.mock('../components/flow-interactive/ProfileEditStep', () => ({
  ProfileEditStep: () => <div>profile-step</div>
}))

vi.mock('../components/flow-interactive/ScheduleEditStep', () => ({
  ScheduleEditStep: () => <div>schedule-step</div>
}))

vi.mock('../components/flow-interactive/PackageReviewStep', () => ({
  PackageReviewStep: () => <div>package-step</div>
}))

const baseSessionResponse = {
  sessionId: 'session-1',
  status: 'active' as const,
  pausePoint: null,
  snapshot: {
    interactiveMode: true,
    currentPausePoint: null,
    pauseHistory: [],
    run: {
      goalText: 'Aprender guitarra'
    },
    phases: {}
  },
  planId: null
}

describe('interactive flow page', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.createSessionMock.mockReset()
    mocks.getSessionMock.mockReset()
    mocks.applyInputMock.mockReset()
    mocks.deleteSessionMock.mockReset()
    mocks.createSessionMock.mockResolvedValue(baseSessionResponse)
    window.localStorage.clear()
  })

  it('usa ollama por defecto en local cuando no hay workflow activo', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(LOCAL_PROFILE_ID_STORAGE_KEY, 'profile-local')

    render(<InteractiveFlowPage deploymentMode="local" />)

    await user.type(await screen.findByRole('textbox'), 'Aprender guitarra')
    await user.click(screen.getByRole('button', { name: t('flowInteractive.start') }))

    await waitFor(() => {
      expect(mocks.createSessionMock).toHaveBeenCalledWith({
        goalText: 'Aprender guitarra',
        profileId: 'profile-local',
        workflowId: undefined,
        provider: 'ollama',
        resourceMode: 'auto'
      })
    })
  })

  it('reutiliza el workflow activo y evita forzar el fallback local', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(LOCAL_PROFILE_ID_STORAGE_KEY, 'profile-local')
    window.localStorage.setItem(ACTIVE_WORKFLOW_ID_STORAGE_KEY, 'workflow-7')

    render(<InteractiveFlowPage deploymentMode="local" />)

    await user.type(await screen.findByRole('textbox'), 'Preparar media maraton')
    await user.click(screen.getByRole('button', { name: t('flowInteractive.start') }))

    await waitFor(() => {
      expect(mocks.createSessionMock).toHaveBeenCalledWith({
        goalText: 'Preparar media maraton',
        profileId: 'profile-local',
        workflowId: 'workflow-7'
      })
    })
  })

  it('intenta rehidratar una sesion interactiva guardada al montar', async () => {
    window.localStorage.setItem(ACTIVE_INTERACTIVE_SESSION_ID_STORAGE_KEY, 'session-99')
    mocks.getSessionMock.mockResolvedValue({
      ...baseSessionResponse,
      sessionId: 'session-99'
    })

    render(<InteractiveFlowPage deploymentMode="local" />)

    await waitFor(() => {
      expect(mocks.getSessionMock).toHaveBeenCalledWith('session-99')
    })
  })

  it('permite volver un nivel desde una pausa intermedia', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(ACTIVE_INTERACTIVE_SESSION_ID_STORAGE_KEY, 'session-42')
    mocks.getSessionMock.mockResolvedValue({
      sessionId: 'session-42',
      status: 'active',
      pausePoint: {
        id: '33333333-3333-4333-8333-333333333333',
        phase: 'profile',
        type: 'profile_edit',
        output: {
          freeHoursWeekday: 3,
          freeHoursWeekend: 6,
          energyLevel: 'medium',
          fixedCommitments: [],
          scheduleConstraints: []
        },
        createdAt: '2026-03-27T10:10:00.000Z',
        updatedAt: '2026-03-27T10:10:00.000Z'
      },
      snapshot: {
        interactiveMode: true,
        currentPausePoint: {
          id: '33333333-3333-4333-8333-333333333333',
          phase: 'profile',
          type: 'profile_edit',
          output: {
            freeHoursWeekday: 3,
            freeHoursWeekend: 6,
            energyLevel: 'medium',
            fixedCommitments: [],
            scheduleConstraints: []
          },
          createdAt: '2026-03-27T10:10:00.000Z',
          updatedAt: '2026-03-27T10:10:00.000Z'
        },
        pauseHistory: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            phase: 'classify',
            type: 'classify_review',
            output: {},
            createdAt: '2026-03-27T10:00:00.000Z',
            updatedAt: '2026-03-27T10:00:00.000Z'
          },
          {
            id: '22222222-2222-4222-8222-222222222222',
            phase: 'requirements',
            type: 'requirements_answer',
            output: {},
            createdAt: '2026-03-27T10:05:00.000Z',
            updatedAt: '2026-03-27T10:05:00.000Z'
          },
          {
            id: '33333333-3333-4333-8333-333333333333',
            phase: 'profile',
            type: 'profile_edit',
            output: {},
            createdAt: '2026-03-27T10:10:00.000Z',
            updatedAt: '2026-03-27T10:10:00.000Z'
          }
        ],
        run: {
          goalText: 'Aprender guitarra'
        },
        phases: {}
      },
      planId: null
    })
    mocks.applyInputMock.mockResolvedValue(baseSessionResponse)

    render(<InteractiveFlowPage deploymentMode="local" />)

    await screen.findByText('profile-step')
    await user.click(screen.getByRole('button', { name: t('flow.actions.back_level') }))

    await waitFor(() => {
      expect(mocks.applyInputMock).toHaveBeenCalledWith('session-42', {
        pauseId: '33333333-3333-4333-8333-333333333333',
        input: {
          action: 'go_back',
          targetPhase: 'requirements'
        }
      })
    })
  })
})
