// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateTime } from 'luxon'
import { describe, expect, it, vi } from 'vitest'

import PlanCalendar from '../components/PlanCalendar'
import { t } from '../src/i18n'
import type { ProgressRow } from '../src/shared/types/lap-api'

type MockEvent = {
  id?: string
  title?: string
  start?: string
  startStr?: string
  extendedProps?: Record<string, unknown>
}

const setMatchMedia = (matches: boolean): void => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  })
}

vi.mock('@fullcalendar/react', async () => {
  const ReactModule = await import('react')

  return {
    default: ReactModule.forwardRef(function FullCalendarMock(
      {
        events = [],
        eventContent,
        eventClick,
        initialView = 'dayGridMonth'
      }: {
        events?: MockEvent[]
        eventContent?: (arg: any) => React.ReactNode
        eventClick?: (arg: any) => void
        initialView?: string
      },
      ref: React.ForwardedRef<{ getApi: () => { view: { type: string }; changeView: (view: string) => void } }>
    ) {
      const [currentView, setCurrentView] = ReactModule.useState(initialView)

      ReactModule.useImperativeHandle(ref, () => ({
        getApi: () => ({
          view: { type: currentView },
          changeView: (nextView: string) => {
            setCurrentView(nextView)
          }
        })
      }), [currentView])

      return ReactModule.createElement(
        'div',
        { 'data-testid': `fullcalendar-${currentView}` },
        events.map((event) => {
          const normalizedEvent = {
            id: event.id ?? event.title ?? 'event',
            title: event.title ?? '',
            start: event.start ? new Date(event.start) : undefined,
            startStr: event.startStr ?? event.start ?? '',
            extendedProps: event.extendedProps ?? {}
          }

          const content = eventContent
            ? eventContent({
                event: normalizedEvent,
                view: { type: currentView },
                timeText: String(normalizedEvent.extendedProps.timeLabel ?? '')
              })
            : normalizedEvent.title

          return ReactModule.createElement(
            'button',
            {
              key: normalizedEvent.id,
              type: 'button',
              onClick: () => eventClick?.({
                event: normalizedEvent,
                jsEvent: {
                  preventDefault: () => {},
                  stopPropagation: () => {}
                }
              })
            },
            content
          )
        })
      )
    })
  }
})

vi.mock('@fullcalendar/daygrid', () => ({ default: {} }))
vi.mock('@fullcalendar/timegrid', () => ({ default: {} }))
vi.mock('@fullcalendar/interaction', () => ({ default: {} }))
vi.mock('@fullcalendar/multimonth', () => ({ default: {} }))
vi.mock('@fullcalendar/scrollgrid', () => ({ default: {} }))
vi.mock('@fullcalendar/core/locales/es', () => ({ default: {} }))

function buildTask(dateIso: string, description: string, hour: string, duration: number, category: string, completed = false): ProgressRow {
  return {
    id: `${description}-${dateIso}`,
    planId: 'plan-1',
    fecha: dateIso,
    tipo: 'habito',
    objetivoId: 'goal-1',
    descripcion: description,
    completado: completed,
    notas: JSON.stringify({
      hora: hour,
      duracion: duration,
      categoria: category
    }),
    createdAt: `${dateIso}T00:00:00.000Z`
  }
}

describe('PlanCalendar', () => {
  it('abre el detalle completo al tocar un evento y actualiza el dia seleccionado', async () => {
    setMatchMedia(false)

    const timezone = 'America/Argentina/Buenos_Aires'
    const todayIso = DateTime.now().setZone(timezone).toISODate() ?? '2026-04-01'
    const tomorrowIso = DateTime.fromISO(todayIso, { zone: timezone }).plus({ days: 1 }).toISODate() ?? todayIso
    const tasks = [
      buildTask(todayIso, 'Revisar el plan de hoy', '09:30', 45, 'trabajo'),
      buildTask(tomorrowIso, 'Caminar sin apuro por el parque', '11:00', 60, 'ejercicio', true)
    ]
    const user = userEvent.setup()

    render(
      <PlanCalendar
        tasks={tasks}
        timezone={timezone}
        defaultView="timeGridWeek"
        variant="light"
      />
    )

    expect(screen.getByTestId('fullcalendar-timeGridWeek')).toBeTruthy()
    expect(screen.getByText(DateTime.fromISO(todayIso, { zone: timezone }).setLocale('es-AR').toFormat('cccc d LLL'))).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Caminar sin apuro por el parque/ }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(screen.getByText('Caminar sin apuro por el parque')).toBeTruthy()
    expect(screen.getByText(DateTime.fromISO(tomorrowIso, { zone: timezone }).setLocale('es-AR').toFormat('cccc d LLL'))).toBeTruthy()
    expect(screen.getByText('11:00')).toBeTruthy()
    expect(screen.getByText(t('dashboard.minutes', { min: 60 }))).toBeTruthy()
    expect(screen.getByText(t('dashboard.category.ejercicio'))).toBeTruthy()
    expect(screen.getByText(t('dashboard.completed'))).toBeTruthy()
    expect(screen.getByRole('button', { name: t('dashboard.calendar_panel.detail_close') })).toBeTruthy()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText(DateTime.fromISO(tomorrowIso, { zone: timezone }).setLocale('es-AR').toFormat('cccc d LLL'))).toBeTruthy()
  })

  it('arranca en vista compacta en mobile y mantiene acceso al detalle', async () => {
    setMatchMedia(true)

    const timezone = 'America/Argentina/Buenos_Aires'
    const dateIso = DateTime.now().setZone(timezone).toISODate() ?? '2026-04-01'
    const task = buildTask(dateIso, 'Proyecto con un nombre largo que sigue y sigue para probar el resumen compacto', '07:15', 90, 'estudio')
    const user = userEvent.setup()

    render(
      <PlanCalendar
        tasks={[task]}
        timezone={timezone}
        variant="light"
      />
    )

    expect(screen.getByTestId('fullcalendar-timeGridDay')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Proyecto con un nombre largo que sigue y sigue para probar el resumen compacto/ })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Proyecto con un nombre largo que sigue y sigue para probar el resumen compacto/ }))

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText('07:15')).toBeTruthy()
    expect(screen.getByText(t('dashboard.category.estudio'))).toBeTruthy()
    expect(screen.getByRole('button', { name: t('dashboard.calendar_panel.detail_close') })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: t('dashboard.calendar_panel.detail_close') }))

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
