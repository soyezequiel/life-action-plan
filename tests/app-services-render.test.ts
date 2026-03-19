import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { t } from '../src/i18n'
import IntakeExpress from '../src/renderer/src/components/IntakeExpress'
import { AppServicesProvider, useLapClient } from '../src/renderer/src/app-services'
import { createTestAppServices } from '../src/renderer/src/app-services/testing'
import { mockLapApi } from '../src/renderer/src/mock-api'
import type { LapAPI } from '../src/shared/types/lap-api'

function Probe({ expectedClient }: { expectedClient: LapAPI }) {
  const client = useLapClient()
  return createElement('span', null, client === expectedClient ? 'resolved' : 'mismatch')
}

describe('app services render', () => {
  it('injects the configured lap client through the provider', () => {
    const html = renderToStaticMarkup(
      createElement(
        AppServicesProvider,
        { services: createTestAppServices(mockLapApi) },
        createElement(Probe, { expectedClient: mockLapApi })
      )
    )

    expect(html).toContain('resolved')
  })

  it('lets renderer components render with injected services and no globals', () => {
    const html = renderToStaticMarkup(
      createElement(
        AppServicesProvider,
        { services: createTestAppServices(mockLapApi) },
        createElement(IntakeExpress, { onComplete: vi.fn() })
      )
    )

    expect(html).toContain(t('intake.questions.nombre'))
    expect(html).toContain(t('intake.buttons.next'))
  })
})
