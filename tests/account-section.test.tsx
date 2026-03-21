// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AccountSection from '../components/settings/AccountSection'
import { t } from '../src/i18n'

const fetchMock = vi.fn()
const onAuthChangeMock = vi.fn(async () => {})

describe('account section', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    onAuthChangeMock.mockReset()
    window.localStorage.clear()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('cambia el titulo cuando se pasa a crear cuenta', async () => {
    const user = userEvent.setup()

    render(
      <AccountSection
        authState={{ loading: false, authenticated: false, user: null }}
        onAuthChange={onAuthChangeMock}
      />
    )

    expect(screen.getByText(t('auth.login_title'))).toBeTruthy()

    await user.click(screen.getByRole('button', { name: t('auth.register_button') }))

    expect(screen.getByText(t('auth.register_title'))).toBeTruthy()
    expect(screen.getByText(t('auth.or_login'))).toBeTruthy()
    expect(screen.getByText(t('auth.password_requirements'))).toBeTruthy()
  })

  it('muestra un mensaje claro cuando la cuenta ya existe', async () => {
    const user = userEvent.setup()

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      authenticated: false,
      error: 'ACCOUNT_ALREADY_EXISTS'
    }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' }
    }))

    render(
      <AccountSection
        authState={{ loading: false, authenticated: false, user: null }}
        onAuthChange={onAuthChangeMock}
      />
    )

    await user.click(screen.getByRole('button', { name: t('auth.register_button') }))
    await user.type(screen.getByLabelText(t('auth.username_label')), 'soynaranja@gmail.com')
    await user.type(screen.getByLabelText(t('auth.password_label')), 'segura1234')
    await user.click(screen.getByRole('button', { name: t('auth.register_button') }))

    expect(await screen.findByText(t('auth.account_exists'))).toBeTruthy()
  })

  it('valida la clave de alta antes de llamar a la API', async () => {
    const user = userEvent.setup()

    render(
      <AccountSection
        authState={{ loading: false, authenticated: false, user: null }}
        onAuthChange={onAuthChangeMock}
      />
    )

    await user.click(screen.getByRole('button', { name: t('auth.register_button') }))
    await user.type(screen.getByLabelText(t('auth.username_label')), 'soynaranja@gmail.com')
    await user.type(screen.getByLabelText(t('auth.password_label')), 'corta12')
    await user.click(screen.getByRole('button', { name: t('auth.register_button') }))

    expect(await screen.findByText(t('auth.password_too_short'))).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('muestra un mensaje claro cuando los datos no coinciden', async () => {
    const user = userEvent.setup()

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      authenticated: false,
      error: 'INVALID_CREDENTIALS'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    }))

    render(
      <AccountSection
        authState={{ loading: false, authenticated: false, user: null }}
        onAuthChange={onAuthChangeMock}
      />
    )

    await user.type(screen.getByLabelText(t('auth.username_label')), 'soynaranja@gmail.com')
    await user.type(screen.getByLabelText(t('auth.password_label')), 'segura1234')
    await user.click(screen.getByRole('button', { name: t('auth.login_button') }))

    expect(await screen.findByText(t('auth.invalid_credentials'))).toBeTruthy()
  })

  it('muestra un mensaje claro cuando se bloquean demasiados intentos', async () => {
    const user = userEvent.setup()

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      authenticated: false,
      error: 'AUTH_RATE_LIMITED'
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    }))

    render(
      <AccountSection
        authState={{ loading: false, authenticated: false, user: null }}
        onAuthChange={onAuthChangeMock}
      />
    )

    await user.type(screen.getByLabelText(t('auth.username_label')), 'soynaranja@gmail.com')
    await user.type(screen.getByLabelText(t('auth.password_label')), 'segura1234')
    await user.click(screen.getByRole('button', { name: t('auth.login_button') }))

    expect(await screen.findByText(t('auth.too_many_attempts'))).toBeTruthy()
  })
})
