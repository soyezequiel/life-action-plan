import AnnualCalendarMockup from '../mockups/AnnualCalendarMockup'
import DailyCalendarMockup from '../mockups/DailyCalendarMockup'
import MonthlyCalendarMockup from '../mockups/MonthlyCalendarMockup'
import WeeklyCalendarMockup from '../mockups/WeeklyCalendarMockup'
import { DayView } from './DayView'

type CalendarViewMode = 'day' | 'week' | 'month' | 'year'

interface CalendarViewProps {
  detail?: unknown
  milestones?: unknown[]
  goalIds?: string[]
  activeView: CalendarViewMode
  onViewChange?: (view: CalendarViewMode) => void
}

export function CalendarView({ activeView }: CalendarViewProps) {
  if (activeView === 'day') {
    return <DayView />
  }

  if (activeView === 'week') {
    return <WeeklyCalendarMockup />
  }

  if (activeView === 'month') {
    return <MonthlyCalendarMockup />
  }

  if (activeView === 'year') {
    return <AnnualCalendarMockup />
  }

  return <DailyCalendarMockup />
}
