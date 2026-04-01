import PlanificadorPage from './PlanificadorPage'
import type { CalendarView } from '../PlanCalendar'
import type { PlanRow, ProgressRow } from '@/src/shared/types/lap-api'

export type PlanMockupView = 'day' | 'week' | 'month' | 'year'

interface PlanMockupPageProps {
  view: PlanMockupView
  initialData?: {
    activePlan: PlanRow | null
    tasks: ProgressRow[]
  } | null
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

export default function PlanMockupPage({ view, initialData = null }: PlanMockupPageProps) {
  return <PlanificadorPage initialView={mapToCalendarView(view)} initialData={initialData} />
}
