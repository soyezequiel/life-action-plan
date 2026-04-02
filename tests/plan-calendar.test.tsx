// @vitest-environment jsdom

import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
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

type MockCalendarRange = {
  start: string
  end: string
}

type MockCalendarRangeMap = Record<string, MockCalendarRange>

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires'

function buildMockCalendarRanges(baseDateIso: string, timezone: string): MockCalendarRangeMap {
  const base = DateTime.fromISO(baseDateIso, { zone: timezone }).startOf('day')
  const weekStart = base.minus({ days: base.weekday - 1 })
  const monthStart = base.startOf('month')
  const yearStart = base.startOf('year')

  return {
    dayGridMonth: {
      start: monthStart.toISO() ?? '',
      end: monthStart.plus({ months: 1 }).toISO() ?? ''
    },
    timeGridWeek: {
      start: weekStart.toISO() ?? '',
      end: weekStart.plus({ days: 7 }).toISO() ?? ''
    },
    timeGridDay: {
      start: base.toISO() ?? '',
      end: base.plus({ days: 1 }).toISO() ?? ''
    },
    multiMonthYear: {
      start: yearStart.toISO() ?? '',
      end: yearStart.plus({ years: 1 }).toISO() ?? ''
    }
  }
}

let mockCalendarRanges: MockCalendarRangeMap = buildMockCalendarRanges('2026-04-01', DEFAULT_TIMEZONE)

function setMockCalendarRanges(baseDateIso: string, timezone: string): void {
  mockCalendarRanges = buildMockCalendarRanges(baseDateIso, timezone)
}

async function expectCalendarBounds(testId: string, minTime: string, maxTime: string): Promise<void> {
  await waitFor(() => {
    const calendar = screen.getByTestId(testId)
    expect(calendar.getAttribute('data-slot-min')).toBe(minTime)
    expect(calendar.getAttribute('data-slot-max')).toBe(maxTime)
  })
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
        datesSet,
        initialView = 'dayGridMonth',
        slotMinTime,
        slotMaxTime
      }: {
        events?: MockEvent[]
        eventContent?: (arg: any) => React.ReactNode
        eventClick?: (arg: any) => void
        datesSet?: (arg: { start: Date; end: Date; view: { type: string } }) => void
        initialView?: string
        slotMinTime?: string
        slotMaxTime?: string
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

      ReactModule.useEffect(() => {
        const range = mockCalendarRanges[currentView] ?? mockCalendarRanges.dayGridMonth

        datesSet?.({
          start: new Date(range.start),
          end: new Date(range.end),
          view: { type: currentView }
        })
      }, [currentView, datesSet])

      return ReactModule.createElement(
        'div',
        {
          'data-testid': `fullcalendar-${currentView}`,
          'data-slot-min': slotMinTime ?? '',
          'data-slot-max': slotMaxTime ?? '',
          'data-view-type': currentView
        },
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
    const timezone = 'America/Argentina/Buenos_Aires'
    const todayIso = DateTime.now().setZone(timezone).toISODate() ?? '2026-04-01'
    const tomorrowIso = DateTime.fromISO(todayIso, { zone: timezone }).plus({ days: 1 }).toISODate() ?? todayIso
    setMockCalendarRanges(todayIso, timezone)
    setMatchMedia(false)
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

    await expectCalendarBounds('fullcalendar-timeGridWeek', '09:00:00', '12:30:00')
    expect(screen.getByText(DateTime.fromISO(todayIso, { zone: timezone }).setLocale('es-AR').toFormat('cccc d LLL'))).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Caminar sin apuro por el parque/ }))

    const dialog = await screen.findByRole('dialog')
    const dialogScope = within(dialog)
    expect(dialog).toBeTruthy()
    expect(dialogScope.getByText('Caminar sin apuro por el parque')).toBeTruthy()
    expect(dialog.textContent ?? '').toContain(DateTime.fromISO(tomorrowIso, { zone: timezone }).setLocale('es-AR').toFormat('cccc d LLL'))
    expect(dialogScope.getByText('11:00')).toBeTruthy()
    expect(dialogScope.getByText(t('dashboard.minutes', { min: 60 }))).toBeTruthy()
    expect(dialogScope.getByText(t('dashboard.category.ejercicio'))).toBeTruthy()
    expect(dialogScope.getByText(t('dashboard.completed'))).toBeTruthy()
    expect(screen.getByRole('button', { name: t('dashboard.calendar_panel.detail_close') })).toBeTruthy()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText(DateTime.fromISO(tomorrowIso, { zone: timezone }).setLocale('es-AR').toFormat('cccc d LLL'))).toBeTruthy()
  })

  it('arranca en vista compacta en mobile y mantiene acceso al detalle', async () => {
    setMatchMedia(true)

    const timezone = DEFAULT_TIMEZONE
    const dateIso = DateTime.now().setZone(timezone).toISODate() ?? '2026-04-01'
    setMockCalendarRanges(dateIso, timezone)
    const task = buildTask(dateIso, 'Proyecto con un nombre largo que sigue y sigue para probar el resumen compacto', '05:30', 30, 'estudio')
    const user = userEvent.setup()

    render(
      <PlanCalendar
        tasks={[task]}
        timezone={timezone}
        variant="light"
      />
    )

    await expectCalendarBounds('fullcalendar-timeGridDay', '05:00:00', '06:30:00')
    expect(screen.getByRole('button', { name: /Proyecto con un nombre largo que sigue y sigue para probar el resumen compacto/ })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Proyecto con un nombre largo que sigue y sigue para probar el resumen compacto/ }))

    const dialog = await screen.findByRole('dialog')
    const dialogScope = within(dialog)
    expect(dialog).toBeTruthy()
    expect(dialogScope.getByText('05:30')).toBeTruthy()
    expect(dialogScope.getByText(t('dashboard.category.estudio'))).toBeTruthy()
    expect(screen.getByRole('button', { name: t('dashboard.calendar_panel.detail_close') })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: t('dashboard.calendar_panel.detail_close') }))

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('expande el rango semanal para incluir eventos tardios y mantiene 24:00 como tope', async () => {
    const timezone = DEFAULT_TIMEZONE
    const dateIso = DateTime.now().setZone(timezone).toISODate() ?? '2026-04-01'
    setMockCalendarRanges(dateIso, timezone)
    const task = buildTask(dateIso, 'Cierre que cae tarde', '23:30', 30, 'trabajo')

    render(
      <PlanCalendar
        tasks={[task]}
        timezone={timezone}
        defaultView="timeGridWeek"
        variant="light"
      />
    )

    await expectCalendarBounds('fullcalendar-timeGridWeek', '23:00:00', '24:00:00')
  })

  it('recalcula el rango visible cuando cambia de semana a dia', async () => {
    const timezone = DEFAULT_TIMEZONE
    const mondayIso = '2026-04-06'
    const tuesdayIso = '2026-04-07'
    setMockCalendarRanges(mondayIso, timezone)

    const mondayTask = buildTask(mondayIso, 'Bloque de arranque', '09:00', 30, 'trabajo')
    const tuesdayTask = buildTask(tuesdayIso, 'Bloque temprano del martes', '05:30', 30, 'estudio')

    const { rerender } = render(
      <PlanCalendar
        tasks={[mondayTask, tuesdayTask]}
        timezone={timezone}
        defaultView="timeGridWeek"
        variant="light"
      />
    )

    await expectCalendarBounds('fullcalendar-timeGridWeek', '05:00:00', '10:00:00')

    setMockCalendarRanges(mondayIso, timezone)
    rerender(
      <PlanCalendar
        tasks={[mondayTask, tuesdayTask]}
        timezone={timezone}
        defaultView="timeGridDay"
        variant="light"
      />
    )

    await expectCalendarBounds('fullcalendar-timeGridDay', '08:30:00', '10:00:00')
  })

  it('mantiene los valores por defecto en vistas mensuales y anuales', async () => {
    const timezone = DEFAULT_TIMEZONE
    const dateIso = '2026-04-01'
    setMockCalendarRanges(dateIso, timezone)
    const task = buildTask(dateIso, 'Evento de referencia', '11:00', 60, 'otro')

    const { rerender } = render(
      <PlanCalendar
        tasks={[task]}
        timezone={timezone}
        defaultView="dayGridMonth"
        variant="light"
      />
    )

    await expectCalendarBounds('fullcalendar-dayGridMonth', '06:00:00', '23:00:00')

    rerender(
      <PlanCalendar
        tasks={[task]}
        timezone={timezone}
        defaultView="multiMonthYear"
        variant="light"
      />
    )

    await expectCalendarBounds('fullcalendar-multiMonthYear', '06:00:00', '23:00:00')
  })
})
