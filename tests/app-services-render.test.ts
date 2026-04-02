import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SessionProvider } from 'next-auth/react'
import { describe, expect, it } from 'vitest'
import { t } from '../src/i18n'
import IntakeExpress from '../components/IntakeExpress'
import { AppServicesProvider, useLapClient } from '../src/lib/client/app-services'
import { UserStatusProvider } from '../src/lib/client/UserStatusProvider'
import type { LapAPI } from '../src/shared/types/lap-api'

const mockLapApi = {
  intake: { save: async () => ({ success: true, profileId: 'profile-1' }) }
} as unknown as LapAPI

function Probe({ expectedClient }: { expectedClient: LapAPI }) {
  const client = useLapClient()
  return createElement('span', null, client === expectedClient ? 'resolved' : 'mismatch')
}

describe('app services render', () => {
  it('injects the configured lap client through the provider', () => {
    const html = renderToStaticMarkup(
      createElement(
        AppServicesProvider,
        { services: { lapClient: mockLapApi } },
        createElement(Probe, { expectedClient: mockLapApi })
      )
    )

    expect(html).toContain('resolved')
  })

  it('lets renderer components render with injected services and no globals', () => {
    const html = renderToStaticMarkup(
      createElement(
        AppServicesProvider,
        { services: { lapClient: mockLapApi } },
        createElement(
          SessionProvider,
          {
            session: null,
            children: createElement(UserStatusProvider, null, createElement(IntakeExpress, { onComplete: () => {} }))
          }
        )
      )
    )

    expect(html).toContain('Pulso')
    expect(html).toContain(t('ui.loading'))
  })
})
