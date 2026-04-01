'use client'

import { DateTime } from 'luxon'
import { t } from '@/src/i18n'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
import { MockupOrchestrator as MockupShell } from '../midnight-mint/MockupOrchestrator'
import { usePlanV5 } from '@/src/lib/client/use-plan-v5'

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

function buildMonthGrid(month: number): Array<Array<number | null>> {
  const firstDay = DateTime.fromObject({ year: 2024, month, day: 1 }, { locale: 'es-AR' })
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

const highlightedDays: Record<number, Record<number, string>> = {
  1: { 5: 'bg-[#A7F3D0]/70', 12: 'bg-[#A7F3D0]/70', 22: 'bg-[#A7F3D0]/70' },
  4: { 5: 'bg-[#E9D5FF]/70', 12: 'bg-[#E9D5FF]/70', 22: 'bg-[#E9D5FF]/70' },
  7: { 5: 'bg-[#A7F3D0]/70', 12: 'bg-[#A7F3D0]/70', 22: 'bg-[#A7F3D0]/70' },
  10: { 5: 'bg-[#E9D5FF]/70', 12: 'bg-[#E9D5FF]/70', 22: 'bg-[#E9D5FF]/70' }
}

export default function AnnualCalendarMockup() {
  const { package: planPackage, loading } = usePlanV5()
  const allTasks = planPackage?.plan.detail.weeks.flatMap(w => w.scheduledEvents ?? []) ?? []
  const allMilestones = planPackage?.plan.skeleton.milestones ?? []

  const totalEvents = allTasks.length || 124
  const totalMilestones = allMilestones.length || 18

  const sidebar = [
    { label: t('mockups.calendarAnnual.nav.calendar'), icon: 'calendar_today', active: true, href: '/plan?view=year' },
    { label: t('mockups.calendarAnnual.nav.events'), icon: 'event', href: '/plan?view=month' },
    { label: t('mockups.calendarAnnual.nav.tasks'), icon: 'check_circle', href: '/flow?variant=tasks' },
    { label: t('mockups.calendarAnnual.nav.analytics'), icon: 'analytics', href: '/flow?variant=simulation' },
    { label: t('mockups.calendarAnnual.nav.sanctuary'), icon: 'spa', href: '/settings' }
  ]

  return (
    <MockupShell
      sidebarLabel={t('mockups.common.digital_sanctuary')}
      sidebarNav={sidebar}
      sidebarPrimaryAction={{ label: t('mockups.calendarAnnual.create_event'), icon: 'add', href: '/plan?view=month' }}
      sidebarFooter={[
        { label: t('mockups.common.help'), icon: 'help', href: '#' },
        { label: t('mockups.common.exit'), icon: 'logout', href: '#' }
      ]}
      topLeft={<div className="font-display text-[24px] font-bold text-[#334155]">2024</div>}
      topTabs={[
        { label: t('mockups.calendarAnnual.tabs.day'), href: '/plan?view=day' },
        { label: t('mockups.calendarAnnual.tabs.week'), href: '/plan?view=week' },
        { label: t('mockups.calendarAnnual.tabs.month'), href: '/plan?view=month' },
        { label: t('mockups.calendarAnnual.tabs.year'), active: true, href: '/plan?view=year' }
      ]}
      topRight={(
        <>
          <button type="button" className="text-slate-500"><MaterialIcon name="search" className="text-[20px]" /></button>
          <button type="button" className="text-slate-500"><MaterialIcon name="notifications" className="text-[20px]" /></button>
          <button type="button" className="text-slate-500"><MaterialIcon name="settings" className="text-[20px]" /></button>
          <div className="h-8 w-8 rounded-full bg-[linear-gradient(135deg,#F8FAFC,#94A3B8)]" />
        </>
      )}
      contentClassName="px-0"
    >
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="mb-8">
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">{t('mockups.calendarAnnual.eyebrow')}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {MONTHS.map((month) => {
            const monthLabel = DateTime.fromObject({ year: 2024, month, day: 1 }, { locale: 'es-AR' }).toFormat('LLLL')
            const weeks = buildMonthGrid(month)
            const highlights = highlightedDays[month] ?? {}

            return (
              <article key={month} className="rounded-[20px] bg-white/80 p-4 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                <h3 className="mb-4 font-display text-[12px] font-bold uppercase tracking-[0.26em] text-[#334155]">{monthLabel}</h3>
                <div className="grid grid-cols-7 gap-1 text-center text-[8px] font-bold uppercase tracking-[0.22em] text-slate-300">
                  {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day) => <span key={day}>{day}</span>)}
                </div>
                <div className="mt-1 space-y-1">
                  {weeks.map((week, weekIndex) => (
                    <div key={weekIndex} className="grid grid-cols-7 gap-1">
                      {week.map((day, dayIndex) => {
                        const highlightClass = day ? highlights[day] ?? '' : ''
                        return (
                          <div
                            key={`${weekIndex}-${dayIndex}`}
                            className={`flex h-5 items-center justify-center text-[9px] text-slate-300 ${day ? '' : 'text-transparent'}`}
                          >
                            <span className={`flex h-4 w-4 items-center justify-center rounded-full ${highlightClass}`}>
                              {day ?? ''}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </article>
            )
          })}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <section className="rounded-[20px] bg-white p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{t('mockups.calendarAnnual.legend_title')}</p>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#A7F3D0]/20 text-[#166534]">
                  <MaterialIcon name="spa" className="text-[16px]" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-[#334155]">{t('mockups.calendarAnnual.legend_growth_title')}</p>
                  <p className="text-[12px] text-slate-400">{t('mockups.calendarAnnual.legend_growth_copy')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#E9D5FF]/20 text-[#7C3AED]">
                  <MaterialIcon name="self_improvement" className="text-[16px]" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-[#334155]">{t('mockups.calendarAnnual.legend_sanctuary_title')}</p>
                  <p className="text-[12px] text-slate-400">{t('mockups.calendarAnnual.legend_sanctuary_copy')}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="flex items-stretch rounded-[20px] bg-[#1E293B] p-6 text-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <div className="flex flex-1 items-center justify-between gap-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-300">{t('mockups.calendarAnnual.summary_title')}</p>
                <div className="mt-4 flex gap-10">
                  <div>
                    <strong className="block font-display text-[32px] font-bold">{loading ? '...' : totalEvents}</strong>
                    <span className="text-[12px] text-slate-300">{t('mockups.calendarAnnual.summary_events')}</span>
                  </div>
                  <div>
                    <strong className="block font-display text-[32px] font-bold">{loading ? '...' : totalMilestones}</strong>
                    <span className="text-[12px] text-slate-300">{t('mockups.calendarAnnual.summary_milestones')}</span>
                  </div>
                </div>
              </div>
              <div className="flex h-28 w-36 flex-col items-center justify-center rounded-[20px] bg-white/5">
                <button type="button" className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold text-[#334155]">
                  {t('mockups.calendarAnnual.export')}
                  <MaterialIcon name="download" className="text-[16px]" />
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </MockupShell>
  )
}
