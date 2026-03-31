'use client'

import { DateTime } from 'luxon'
import { t } from '@/src/i18n'
import { useRouter } from 'next/navigation'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
import { MockupShell } from '../midnight-mint/MockupShell'
import { usePlanV5 } from '@/src/lib/client/use-plan-v5'

function DayRow({ time, title, place, color, height }: { time: string; title: string; place: string; color: string; height: string }) {
  return (
    <div className={`rounded-[18px] ${color} p-4 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]`} style={{ minHeight: height }}>
      <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-current/70">{time}</p>
      <h3 className="mt-2 text-[16px] font-semibold text-current">{title}</h3>
      <p className="mt-2 text-[12px] text-current/70">{place}</p>
    </div>
  )
}

export default function DailyCalendarMockup() {
  const { package: planPackage, loading } = usePlanV5()
  const router = useRouter()
  const allTasks = planPackage?.plan.detail.weeks.flatMap(w => w.scheduledEvents ?? []) ?? []
  
  const today = DateTime.fromObject({ year: 2023, month: 10, day: 4 }, { locale: 'es-AR' })

  return (
    <MockupShell
      sidebarLabel={t('mockups.common.digital_sanctuary')}
      sidebarNav={[
        { label: t('mockups.calendarDaily.nav.calendar'), icon: 'calendar_today', active: true, href: '/plan?view=day' },
        { label: t('mockups.calendarDaily.nav.events'), icon: 'event', href: '/plan?view=week' },
        { label: t('mockups.calendarDaily.nav.tasks'), icon: 'check_circle', href: '/flow?variant=tasks' },
        { label: t('mockups.calendarDaily.nav.analytics'), icon: 'analytics', href: '/flow?variant=simulation' },
        { label: t('mockups.calendarDaily.nav.sanctuary'), icon: 'spa', href: '/settings' }
      ]}
      sidebarPrimaryAction={{ label: t('mockups.calendarDaily.create_event'), icon: 'add', href: '/plan?view=month' }}
      sidebarFooter={[
        { label: t('mockups.common.help'), icon: 'help', href: '#' },
        { label: t('mockups.common.exit'), icon: 'logout', href: '#' }
      ]}
      topLeft={(
        <div className="font-display text-[22px] font-bold text-[#334155]">{t('mockups.calendarDaily.today')}</div>
      )}
      topTabs={[
        { label: t('mockups.calendarDaily.tabs.day'), active: true, href: '/plan?view=day' },
        { label: t('mockups.calendarDaily.tabs.week'), href: '/plan?view=week' },
        { label: t('mockups.calendarDaily.tabs.month'), href: '/plan?view=month' },
        { label: t('mockups.calendarDaily.tabs.year'), href: '/plan?view=year' }
      ]}
      topRight={(
        <>
          <button type="button" onClick={() => router.push('/flow?variant=tasks')} className="text-slate-500 transition hover:text-[#334155]"><MaterialIcon name="search" className="text-[20px]" /></button>
          <button type="button" onClick={() => router.push('/settings')} className="text-slate-500 transition hover:text-[#334155]"><MaterialIcon name="notifications" className="text-[20px]" /></button>
          <div className="h-8 w-8 rounded-full bg-[linear-gradient(135deg,#F59E0B,#FDE68A)]" />
        </>
      )}
      contentClassName="px-0"
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-[28px] bg-white/80 p-6 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
          <div className="mb-6 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-300">
            <MaterialIcon name="schedule" className="text-[16px]" />
            {today.toFormat('cccc d LLLL yyyy')}
          </div>

          <div className="space-y-4">
            {loading ? <p className="text-sm text-slate-400">Cargando eventos...</p> : allTasks.slice(0, 3).map((task, idx) => (
              <div key={idx}>
                {idx > 0 && (
                  <div className="flex items-center gap-4 py-2">
                    <div className="h-2 w-2 rounded-full bg-[#A7F3D0]" />
                    <div className="h-px flex-1 bg-[#A7F3D0]" />
                  </div>
                )}
                <DayRow
                  time={idx === 0 ? "09:00 — 10:30" : idx === 1 ? "11:00 — 12:00" : "13:00 — 14:00"}
                  title={task.title ?? t(`mockups.calendarDaily.event_${idx + 1}_title`)}
                  place={t(`mockups.calendarDaily.event_${idx + 1}_place`)}
                  color={idx === 0 ? "bg-[#A7F3D0]/55 text-[#166534]" : idx === 1 ? "bg-[#E9D5FF]/55 text-[#4C1D95]" : "bg-white text-[#334155] border border-slate-100"}
                  height={idx === 0 ? "108px" : idx === 1 ? "112px" : "88px"}
                />
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[24px] bg-white p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-[18px] font-bold text-[#334155]">{t('mockups.calendarDaily.month_title')}</h2>
              <div className="flex gap-2 text-slate-300">
                <MaterialIcon name="chevron_left" className="text-[18px]" />
                <MaterialIcon name="chevron_right" className="text-[18px]" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-[0.22em] text-slate-300">
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400">
              {Array.from({ length: 35 }, (_, index) => {
                const day = index - 2
                const active = day === 4
                const isOutside = day <= 0 || day > 30
                return (
                  <span
                    key={index}
                    className={`flex h-7 items-center justify-center rounded-full ${active ? 'bg-[#A7F3D0] font-bold text-[#166534]' : isOutside ? 'text-slate-200' : ''}`}
                  >
                    {isOutside ? '' : day}
                  </span>
                )
              })}
            </div>
          </section>

          <section className="rounded-[24px] bg-white p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{t('mockups.calendarDaily.quick_actions_title')}</p>
            <div className="mt-4 space-y-3">
              <button type="button" className="flex w-full items-center justify-between rounded-[18px] bg-slate-50 px-4 py-4 text-left">
                <span className="flex items-center gap-3 text-[14px] text-[#334155]">
                  <MaterialIcon name="replay" className="text-[18px] text-[#166534]" />
                  {t('mockups.calendarDaily.quick_1')}
                </span>
                <MaterialIcon name="chevron_right" className="text-[18px] text-slate-300" />
              </button>
              <button type="button" className="flex w-full items-center justify-between rounded-[18px] bg-slate-50 px-4 py-4 text-left">
                <span className="flex items-center gap-3 text-[14px] text-[#334155]">
                  <MaterialIcon name="archive" className="text-[18px] text-[#7C3AED]" />
                  {t('mockups.calendarDaily.quick_2')}
                </span>
                <MaterialIcon name="chevron_right" className="text-[18px] text-slate-300" />
              </button>
              <button type="button" className="flex w-full items-center justify-between rounded-[18px] bg-slate-50 px-4 py-4 text-left">
                <span className="flex items-center gap-3 text-[14px] text-[#EF4444]">
                  <MaterialIcon name="close" className="text-[18px]" />
                  {t('mockups.calendarDaily.quick_3')}
                </span>
                <MaterialIcon name="chevron_right" className="text-[18px] text-slate-300" />
              </button>
            </div>
          </section>

          <section className="rounded-[24px] bg-[#1E293B] p-5 text-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-300">{t('mockups.calendarDaily.vital_label')}</p>
                <h3 className="mt-2 font-display text-[18px] font-bold">{t('mockups.calendarDaily.vital_title')}</h3>
              </div>
              <span className="text-[24px] font-bold text-white">84%</span>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[84%] rounded-full bg-[#A7F3D0]" />
            </div>
            <p className="mt-4 text-[13px] italic leading-6 text-slate-300">{t('mockups.calendarDaily.vital_copy')}</p>
          </section>
        </aside>
      </div>
    </MockupShell>
  )
}
