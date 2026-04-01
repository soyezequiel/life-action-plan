// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PlanDashboardV5Content } from '../components/plan-viewer/PlanDashboardV5Content'
import { t } from '../src/i18n'

vi.mock('../components/plan-viewer/AdaptiveChangesPanel', () => ({
  AdaptiveChangesPanel: () => <div>adaptive</div>
}))

vi.mock('../components/plan-viewer/PlanSummaryBar', () => ({
  PlanSummaryBar: () => <div>summary</div>
}))

vi.mock('../components/plan-viewer/ProgressView', () => ({
  ProgressView: () => <div>progress-view</div>
}))

vi.mock('../components/plan-viewer/TradeoffDialog', () => ({
  TradeoffDialog: () => null
}))

vi.mock('../components/plan-viewer/WeekView', () => ({
  WeekView: () => <div>week-view</div>
}))

vi.mock('../components/plan-viewer/CalendarView', () => ({
  CalendarView: () => <div>calendar-view</div>
}))

describe('plan dashboard v5 tabs', () => {
  it('ya no expone un panorama que compita con el dashboard principal', () => {
    render(
      <PlanDashboardV5Content
        pkg={{
          summary_esAR: 'Plan semanal',
          warnings: [],
          tradeoffs: [],
          items: [],
          plan: {
            goalIds: [],
            timezone: 'America/Argentina/Buenos_Aires',
            skeleton: { phases: [] },
            detail: { weeks: [], scheduledEvents: [] },
            operational: { days: [], scheduledEvents: [] }
          }
        } as never}
        adaptive={null}
        adaptiveStatus="pending"
        activeTab="calendar"
        calendarView="week"
        onTabChange={() => undefined}
        onCalendarViewChange={() => undefined}
      />
    )

    expect(screen.queryByRole('tab', { name: t('planV5.tabs.overview') })).toBeNull()
    expect(screen.getByRole('tab', { name: t('planV5.tabs.calendar') }).getAttribute('aria-selected')).toBe('true')
  })
})
