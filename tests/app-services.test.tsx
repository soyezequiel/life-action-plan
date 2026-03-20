// @vitest-environment jsdom

import React from 'react'
import type { PropsWithChildren } from 'react'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { LapAPI } from '../src/shared/types/lap-api'
import { AppServicesProvider, useLapClient } from '../src/lib/client/app-services'
import { browserLapClient } from '../src/lib/client/browser-http-client'

describe('app services', () => {
  it('usa el cliente browser por defecto', () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <AppServicesProvider>{children}</AppServicesProvider>
    )

    const { result } = renderHook(() => useLapClient(), { wrapper })

    expect(result.current).toBe(browserLapClient)
  })

  it('permite inyectar un cliente custom via provider', () => {
    const stubClient = {} as LapAPI
    const wrapper = ({ children }: PropsWithChildren) => (
      <AppServicesProvider services={{ lapClient: stubClient }}>{children}</AppServicesProvider>
    )

    const { result } = renderHook(() => useLapClient(), { wrapper })

    expect(result.current).toBe(stubClient)
  })
})
