import WeeklyCalendarMockup from '../mockups/WeeklyCalendarMockup'

interface WeekViewProps {
  operational?: unknown
  goalIds?: string[]
  items?: unknown[]
}

export function WeekView(_props: WeekViewProps) {
  void _props
  return <WeeklyCalendarMockup />
}
