// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PlanFlow } from '../components/flow/PlanFlow'

const mocks = vi.hoisted(() => ({
  startMock: vi.fn(),
  resumeMock: vi.fn(),
}))

vi.mock('../src/lib/client/plan-client', () => ({
  startPlanBuild: mocks.startMock,
  resumePlanBuild: mocks.resumeMock,
}))

;(globalThis as { React?: typeof React }).React = React

describe('PlanFlow', () => {
  beforeEach(() => {
    mocks.startMock.mockReset()
    mocks.resumeMock.mockReset()
  })

  it('usa el planId exacto que devuelve la corrida v6', async () => {
    const user = userEvent.setup()
    mocks.startMock.mockImplementation(async (_goalText, _profileId, _provider, callbacks) => {
      callbacks.onComplete('plan-v6-123', 78, 3)
    })

    render(<PlanFlow profileId="profile-1" provider="openai" />)

    await user.type(screen.getByRole('textbox', { name: '¿Qué te gustaría lograr?' }), 'Ordenar mi semana')
    await user.click(screen.getByRole('button', { name: 'Crear mi plan' }))

    const link = await screen.findByRole('link', { name: 'Abrir mi plan' })

    expect(link.getAttribute('href')).toBe('/plan/v5?planId=plan-v6-123')
    expect(screen.getByText('Buen plan')).toBeTruthy()
  })

  it('muestra un mensaje claro cuando falta configurar el proveedor', async () => {
    const user = userEvent.setup()
    mocks.startMock.mockImplementation(async (_goalText, _profileId, _provider, callbacks) => {
      callbacks.onError('Necesitás configurar tu conexión primero.')
    })

    render(<PlanFlow profileId="profile-1" provider="openai" />)

    await user.type(screen.getByRole('textbox', { name: '¿Qué te gustaría lograr?' }), 'Aprender ingles')
    await user.click(screen.getByRole('button', { name: 'Crear mi plan' }))

    expect(
      await screen.findByText('Necesitás configurar esta conexión antes de usar este asistente.')
    ).toBeTruthy()
  })
  it('muestra un mensaje claro cuando el proveedor se queda sin cupo', async () => {
    const user = userEvent.setup()
    mocks.startMock.mockImplementation(async (_goalText, _profileId, _provider, callbacks) => {
      callbacks.onError(
        'Provider error [provider_quota_exceeded]. El backend respondio, pero no puede procesar la corrida por limite de uso o cuota. Raw: Failed after 3 attempts. Last error: The usage limit has been reached.'
      )
    })

    render(<PlanFlow profileId="profile-1" provider="codex" />)

    await user.type(screen.getByRole('textbox', { name: /gustar[ií]a lograr/i }), 'Ganar 1000 usd')
    await user.click(screen.getByRole('button', { name: 'Crear mi plan' }))

    expect(await screen.findByText('Se acabaron las consultas disponibles por ahora.')).toBeTruthy()
  })

  it('muestra la advertencia cuando la corrida llega degradada', async () => {
    const user = userEvent.setup()
    mocks.startMock.mockImplementation(async (_goalText, _profileId, _provider, callbacks) => {
      callbacks.onDegraded?.({
        message: 'Plan degradado',
        failedAgents: 'goal-interpreter: unauthorized',
        agentOutcomes: [],
      })
      callbacks.onComplete('plan-v6-999', 65, 2)
    })

    render(<PlanFlow profileId="profile-1" provider="openai" />)

    await user.type(screen.getByRole('textbox', { name: /gustar[ií]a lograr/i }), 'Aprender guitarra')
    await user.click(screen.getByRole('button', { name: 'Crear mi plan' }))

    expect(await screen.findByText('Atencion: el plan uso datos de respaldo')).toBeTruthy()
    expect(screen.getByText(/goal-interpreter: unauthorized/i)).toBeTruthy()
  })
})
