// @vitest-environment jsdom

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LlmModeSelector from '../components/settings/LlmModeSelector'
import { t } from '../src/i18n'

describe('llm mode selector', () => {
  it('permite alternar entre conexion propia y servicio', () => {
    const onChange = vi.fn()

    render(<LlmModeSelector value="own" onChange={onChange} />)

    expect(screen.getByText(t('settings.llm_mode.own_key_title'))).toBeTruthy()
    expect(screen.getByText(t('settings.llm_mode.service_title'))).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('settings.llm_mode.service_title')) }))

    expect(onChange).toHaveBeenCalledWith('service')
  })
})
