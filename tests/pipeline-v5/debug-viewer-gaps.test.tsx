// @vitest-environment jsdom

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FlowViewerSurface } from '../../components/debug/FlowViewer'
import { createEmptyPipelineRuntimeData } from '../../src/lib/flow/pipeline-runtime-data'
import { t } from '../../src/i18n'

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react')

  function createMotionComponent(tagName: string) {
    return ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(function MotionComponent(props, ref) {
      const {
        children,
        initial,
        animate,
        exit,
        transition,
        ...rest
      } = props

      void initial
      void animate
      void exit
      void transition

      return ReactModule.createElement(tagName, { ...rest, ref }, children as React.ReactNode)
    })
  }

  return {
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement(ReactModule.Fragment, null, children),
    motion: new Proxy({}, {
      get: (_target, property) => createMotionComponent(String(property))
    })
  }
})

function createViewerSnapshot() {
  const snapshot = createEmptyPipelineRuntimeData({
    source: 'api-build',
    modelId: 'openai:gpt-4o-mini',
    goalText: 'Aprender guitarra'
  })

  snapshot.run.status = 'running'
  snapshot.run.startedAt = '2026-03-26T00:00:00.000Z'
  snapshot.phaseStatuses.classify = 'success'
  snapshot.phaseStatuses.requirements = 'running'
  snapshot.phaseStatuses.profile = 'pending'
  snapshot.phaseTimeline = {
    classify: {
      startedAt: '2026-03-26T00:00:00.000Z',
      finishedAt: '2026-03-26T00:00:01.000Z',
      durationMs: 1000
    },
    requirements: {
      startedAt: '2026-03-26T00:00:01.000Z',
      finishedAt: null,
      durationMs: null
    }
  }
  snapshot.phases.classify = {
    input: { text: 'Aprender guitarra' },
    output: { goalType: 'SKILL_ACQUISITION' },
    processing: 'Clasifica el objetivo.',
    startedAt: '2026-03-26T00:00:00.000Z',
    finishedAt: '2026-03-26T00:00:01.000Z',
    durationMs: 1000
  }
  snapshot.phases.requirements = {
    input: { classification: { goalType: 'SKILL_ACQUISITION' } },
    output: {
      questions: ['q1', 'q2', 'q3', 'q4']
    },
    processing: 'Genera preguntas.',
    startedAt: '2026-03-26T00:00:01.000Z',
    finishedAt: '2026-03-26T00:00:01.000Z',
    durationMs: 0
  }
  snapshot.progress = {
    phase: 'requirements',
    message: 'Generando preguntas base.',
    updatedAt: '2026-03-26T00:00:01.500Z'
  }

  return snapshot
}

describe('debug viewer v5 surface', () => {
  it('opens the drawer, switches phases, supports keyboard nav, and resizes', async () => {
    const user = userEvent.setup()
    window.localStorage.clear()

    const { container } = render(<FlowViewerSurface snapshot={createViewerSnapshot()} />)

    expect((await screen.findAllByText('Requirements')).length).toBeGreaterThan(0)
    expect(screen.getByRole('tab', { name: t('debug.flow.tab_summary') })).toBeTruthy()
    expect(screen.getAllByText('4 preguntas').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByRole('slider', { name: t('debug.flow.scale_label') }), {
      target: { value: '80' }
    })

    await waitFor(() => {
      const viewer = container.querySelector('.flow-viewer') as HTMLElement
      expect(viewer.style.getPropertyValue('--flow-density')).toBe('0.8')
      expect(window.localStorage.getItem('pipeline-v5-debug-viewer-scale')).toBe('0.80')
    })

    await user.click(screen.getByRole('button', { name: /Classify/i }))

    await waitFor(() => {
      expect(screen.getAllByText('SKILL_ACQUISITION').length).toBeGreaterThan(0)
    })

    await user.click(screen.getByRole('tab', { name: t('debug.flow.tab_output') }))

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: t('debug.flow.tab_output') }).getAttribute('aria-selected')).toBe('true')
      expect(window.localStorage.getItem('pipeline-v5-debug-viewer-drawer-tab')).toBe('output')
    })

    fireEvent.keyDown(window, { key: 'ArrowDown' })

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: t('debug.flow.tab_output') }).getAttribute('aria-selected')).toBe('true')
      expect(screen.getAllByText('q1').length).toBeGreaterThan(0)
    })

    const drawer = document.querySelector('.flow-drawer') as HTMLElement
    const beforeHeight = drawer.style.height
    const separator = screen.getByRole('separator', { name: t('debug.flow.drawer_resize') })

    fireEvent.mouseDown(separator, { clientY: 500 })
    fireEvent.mouseMove(window, { clientY: 420 })
    fireEvent.mouseUp(window)

    await waitFor(() => {
      expect((document.querySelector('.flow-drawer') as HTMLElement).style.height).not.toBe(beforeHeight)
    })

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => {
      expect(document.querySelector('.flow-drawer')).toBeNull()
    })
  })
})
