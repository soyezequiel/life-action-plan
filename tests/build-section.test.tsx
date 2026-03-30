// @vitest-environment jsdom

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BuildSection from '../components/settings/BuildSection'
import { t } from '../src/i18n'

describe('build section', () => {
  it('avisa al contenedor cuando se abre el inspector', () => {
    const handleToggleInspector = vi.fn()

    render(
      <BuildSection
        title="Preparar asistente"
        hint="Hint"
        selectedProviderLabel="OpenAI"
        inspectorVisible={false}
        shouldBuild
        buildBusy={false}
        buildUsageLoading={false}
        canBuild
        buildNotice=""
        buildError=""
        buildProgress={null}
        buildUsage={null}
        showAdvancedDetails
        walletStatus={{
          configured: false,
          connected: false,
          canUseSecureStorage: true
        }}
        onToggleInspector={handleToggleInspector}
        onBuild={async () => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: t('debug.panel_title') }))

    expect(handleToggleInspector).toHaveBeenCalledTimes(1)
  })
})
