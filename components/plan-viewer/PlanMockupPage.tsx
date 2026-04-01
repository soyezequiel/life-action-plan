import PlanificadorPage from './PlanificadorPage'
import type { CalendarView } from '../PlanCalendar'

export type PlanMockupView = 'day' | 'week' | 'month' | 'year'

interface PlanMockupPageProps {
  view: PlanMockupView
}

function mapToCalendarView(view: PlanMockupView): CalendarView {
  switch (view) {
    case 'year':
      return 'multiMonthYear'
    case 'month':
      return 'dayGridMonth'
    case 'week':
      return 'timeGridWeek'
    case 'day':
      return 'timeGridDay'
    default:
      return 'dayGridMonth'
  }
}

export default function PlanMockupPage({ view }: PlanMockupPageProps) {
  return <PlanificadorPage initialView={mapToCalendarView(view)} />
}
