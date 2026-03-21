// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import IntakeExpress from '../components/IntakeExpress'
import { AppServicesProvider } from '../src/lib/client/app-services'
import { t } from '../src/i18n'
import type { LapAPI } from '../src/shared/types/lap-api'

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react')

  function createMotionComponent(tagName: string) {
    return ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(function MotionComponent(props, ref) {
      const {
        children,
        layout,
        initial,
        animate,
        exit,
        transition,
        whileTap,
        whileHover,
        ...rest
      } = props

      void layout
      void initial
      void animate
      void exit
      void transition
      void whileTap
      void whileHover

      return ReactModule.createElement(tagName, { ...rest, ref }, children as React.ReactNode)
    })
  }

  return {
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement(ReactModule.Fragment, null, children),
    MotionConfig: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement(ReactModule.Fragment, null, children),
    motion: new Proxy({}, {
      get: (_target, property) => createMotionComponent(String(property))
    })
  }
})

function createLapClientStub(): LapAPI {
  return {
    intake: {
      save: vi.fn(async () => ({ success: true, profileId: 'profile-1' }))
    }
  } as unknown as LapAPI
}

describe('intake express interaction', () => {
  it('permite avanzar con Enter en preguntas de una sola linea', async () => {
    const user = userEvent.setup()

    render(
      <AppServicesProvider services={{ lapClient: createLapClientStub() }}>
        <IntakeExpress onComplete={() => {}} />
      </AppServicesProvider>
    )

    await user.type(screen.getByLabelText(t('intake.questions.nombre')), 'Ada')
    await user.keyboard('{Enter}')

    expect(screen.getByLabelText(t('intake.questions.edad'))).toBeTruthy()
    expect(screen.getByText(t('intake.tip_enter'))).toBeTruthy()
  })
})
