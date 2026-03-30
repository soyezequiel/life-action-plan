import AnnualCalendarMockup from '../mockups/AnnualCalendarMockup'
import DailyCalendarMockup from '../mockups/DailyCalendarMockup'
import MonthlyCalendarMockup from '../mockups/MonthlyCalendarMockup'
import WeeklyCalendarMockup from '../mockups/WeeklyCalendarMockup'

export type PlanMockupView = 'day' | 'week' | 'month' | 'year'

interface PlanMockupPageProps {
  view: PlanMockupView
}

export default function PlanMockupPage({ view }: PlanMockupPageProps) {
  if (view === 'day') {
    return <DailyCalendarMockup />
  }

  if (view === 'week') {
    return <WeeklyCalendarMockup />
  }

  if (view === 'month') {
    return <MonthlyCalendarMockup />
  }

  return <AnnualCalendarMockup />
}
