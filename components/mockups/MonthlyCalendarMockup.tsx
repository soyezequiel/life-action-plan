import { DateTime } from 'luxon'
import { t } from '@/src/i18n'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
import { MockData } from '../midnight-mint/MockData'
import { MockupShell } from '../midnight-mint/MockupShell'

function buildMonthGrid(month: number): Array<Array<number | null>> {
  const firstDay = DateTime.fromObject({ year: 2023, month, day: 1 }, { locale: 'es-AR' })
  const daysInMonth = firstDay.daysInMonth ?? 30
  const startOffset = (firstDay.weekday + 6) % 7
  const cells: Array<number | null> = Array.from({ length: startOffset }, () => null)

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day)
  }

  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  const weeks: Array<Array<number | null>> = []
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7))
  }

  return weeks
}

const highlights: Record<number, string> = {
  4: 'bg-[#A7F3D0] text-[#166534]',
  12: 'bg-[#E9D5FF] text-[#7C3AED]',
  22: 'bg-[#A7F3D0] text-[#166534]',
  31: 'bg-[#E9D5FF] text-[#7C3AED]'
}

export default function MonthlyCalendarMockup() {
  const month = 10
  const monthTitle = DateTime.fromObject({ year: 2023, month, day: 1 }, { locale: 'es-AR' }).toFormat('LLLL')
  const weeks = buildMonthGrid(month)

  return (
    <MockupShell
      sidebarLabel={t('mockups.common.santuario_digital')}
      sidebarNav={[
        { label: t('mockups.calendarMonthly.nav.calendar'), icon: 'calendar_today', active: true, href: '/plan?view=month' },
        { label: t('mockups.calendarMonthly.nav.events'), icon: 'event', href: '/plan?view=week' },
        { label: t('mockups.calendarMonthly.nav.tasks'), icon: 'check_circle', href: '/flow?variant=tasks' },
        { label: t('mockups.calendarMonthly.nav.analytics'), icon: 'analytics', href: '/flow?variant=simulation' },
        { label: t('mockups.calendarMonthly.nav.sanctuary'), icon: 'spa', href: '/settings' }
      ]}
      sidebarPrimaryAction={{ label: t('mockups.calendarMonthly.create_event'), icon: 'add', href: '/plan?view=day' }}
      sidebarFooter={[
        { label: t('mockups.common.help'), icon: 'help', href: '#' },
        { label: t('mockups.common.exit'), icon: 'logout', href: '#' }
      ]}
      topLeft={<div className="font-display text-[20px] font-bold text-[#334155]"><MockData>{monthTitle}</MockData></div>}
      topTabs={[
        { label: t('mockups.calendarMonthly.tabs.day'), href: '/plan?view=day' },
        { label: t('mockups.calendarMonthly.tabs.week'), href: '/plan?view=week' },
        { label: t('mockups.calendarMonthly.tabs.month'), active: true, href: '/plan?view=month' },
        { label: t('mockups.calendarMonthly.tabs.year'), href: '/plan?view=year' }
      ]}
      topRight={(
        <>
          <button type="button" className="text-slate-500"><MaterialIcon name="search" className="text-[20px]" /></button>
          <button type="button" className="text-slate-500"><MaterialIcon name="notifications" className="text-[20px]" /></button>
          <button type="button" className="text-slate-500"><MaterialIcon name="settings" className="text-[20px]" /></button>
          <div className="h-8 w-8 rounded-full bg-[linear-gradient(135deg,#1E293B,#94A3B8)]" />
        </>
      )}
      contentClassName="px-0"
    >
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="rounded-[28px] bg-white/80 p-4 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-[0.22em] text-slate-300">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {weeks.flatMap((week, weekIndex) =>
              week.map((day, dayIndex) => {
                const isToday = day === 16
                const activeClass = day ? highlights[day] ?? 'text-[#334155]' : 'text-transparent'

                return (
                  <div
                    key={`${weekIndex}-${dayIndex}`}
                    className="min-h-[128px] rounded-[24px] bg-white/70 p-3 text-[14px] text-slate-400 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]"
                  >
                    <span className={isToday ? 'inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#A7F3D0]/30 text-[#166534]' : activeClass}>
                      {day ?? ''}
                    </span>
                    {day === 10 && <span className="mt-8 block h-2 w-2 rounded-full bg-[#A7F3D0]" />}
                    {day === 16 && <span className="mt-8 block h-2 w-2 rounded-full bg-slate-400" />}
                    {day === 23 && <span className="mt-8 block h-2 w-2 rounded-full bg-[#A7F3D0]" />}
                    {day === 31 && <span className="mt-8 block h-2 w-2 rounded-full bg-[#E9D5FF]" />}
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
          <article className="rounded-[24px] bg-white p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{t('mockups.calendarMonthly.next_event_label')}</p>
            <div className="mt-4 flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E9D5FF]/30 text-[#7C3AED]">
                <MaterialIcon name="event" className="text-[18px]" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-[#334155]">{t('mockups.calendarMonthly.next_event_title')}</p>
                <p className="text-[12px] text-slate-400">{t('mockups.calendarMonthly.next_event_subtitle')}</p>
              </div>
            </div>
          </article>

          <article className="rounded-[24px] bg-white p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{t('mockups.calendarMonthly.pending_label')}</p>
            <div className="mt-4 flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#A7F3D0]/30 text-[#166534]">
                <MaterialIcon name="check_circle" className="text-[18px]" />
              </div>
              <div>
                <p className="text-[24px] font-bold text-[#334155]"><MockData>12</MockData></p>
                <p className="text-[12px] text-slate-400">{t('mockups.calendarMonthly.pending_copy')}</p>
              </div>
            </div>
          </article>

          <article className="rounded-[24px] bg-[#1E293B] p-6 text-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-300">{t('mockups.calendarMonthly.focus_label')}</p>
                <h3 className="mt-2 font-display text-[22px] font-bold">{t('mockups.calendarMonthly.focus_title')}</h3>
              </div>
              <MaterialIcon name="arrow_forward" className="text-[20px]" />
            </div>
          </article>
        </div>
      </div>
    </MockupShell>
  )
}
