'use client'

import { t } from '@/src/i18n'
import { useRouter } from 'next/navigation'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
import { MockupShell } from '../midnight-mint/MockupShell'
import { usePlanV5 } from '@/src/lib/client/use-plan-v5'

const HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00']

export default function WeeklyCalendarMockup() {
  const { package: planPackage, loading } = usePlanV5()
  const router = useRouter()
  const allTasks = planPackage?.plan.detail.weeks.flatMap(w => w.scheduledEvents ?? []) ?? []

  const days = [
    ['LUN', 15],
    ['MAR', 16],
    ['MIÉ', 17],
    ['JUE', 18],
    ['VIE', 19],
    ['SÁB', 20],
    ['DOM', 21]
  ]

  return (
    <MockupShell
      sidebarLabel={t('mockups.common.digital_sanctuary')}
      sidebarNav={[
        { label: t('mockups.calendarWeekly.nav.dashboard'), icon: 'dashboard', href: '/' },
        { label: t('mockups.calendarWeekly.nav.calendar'), icon: 'calendar_today', active: true, href: '/plan?view=week' },
        { label: t('mockups.calendarWeekly.nav.tasks'), icon: 'check_circle', href: '/flow?variant=tasks' },
        { label: t('mockups.calendarWeekly.nav.analytics'), icon: 'analytics', href: '/flow?variant=simulation' },
        { label: t('mockups.calendarWeekly.nav.sanctuary'), icon: 'spa', href: '/settings' }
      ]}
      sidebarPrimaryAction={{ label: t('mockups.calendarWeekly.create_event'), icon: 'add', href: '/plan?view=day' }}
      sidebarFooter={[
        { label: t('mockups.common.help'), icon: 'help', href: '#' },
        { label: t('mockups.common.exit'), icon: 'logout', href: '#' }
      ]}
      topLeft={(
        <div className="font-display text-[24px] font-bold text-[#334155]">
          {t('mockups.calendarWeekly.title')}
        </div>
      )}
      topTabs={[
        { label: t('mockups.calendarWeekly.tabs.overview'), href: '#' },
        { label: t('mockups.calendarWeekly.tabs.calendar'), active: true, href: '/plan?view=week' },
        { label: t('mockups.calendarWeekly.tabs.reports'), href: '#' }
      ]}
      topRight={(
        <>
          <button type="button" className="text-slate-500"><MaterialIcon name="search" className="text-[20px]" /></button>
          <button type="button" className="text-slate-500"><MaterialIcon name="notifications" className="text-[20px]" /></button>
          <div className="h-8 w-8 rounded-full bg-[linear-gradient(135deg,#1E293B,#94A3B8)]" />
        </>
      )}
      contentClassName="px-0"
    >
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="mb-8">
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.26em] text-slate-400">
            {t('mockups.calendarWeekly.eyebrow')}
          </p>
          <h1 className="mt-4 font-display text-[32px] font-bold tracking-tight text-[#334155]">{t('mockups.calendarWeekly.heading')}</h1>
        </div>

        <section className="rounded-[28px] bg-white/80 p-4 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
          <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))]">
            <div className="border-r border-slate-100" />
            {days.map(([label, day]) => (
              <div key={label} className="border-r border-slate-100 px-3 pb-3 text-center">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-300">{label}</div>
                <div className="mt-1 text-[18px] font-bold text-[#334155]">{day}</div>
              </div>
            ))}

            {HOURS.map((hour) => (
              <div key={hour} className="col-span-8 grid grid-cols-[72px_repeat(7,minmax(0,1fr))] border-t border-slate-100">
                <div className="flex h-[88px] items-start justify-end pr-3 pt-2 text-[11px] text-slate-300">{hour}</div>
                {days.map(() => (
                  <div key={`${hour}-${Math.random()}`} className="h-[88px] border-l border-slate-100" />
                ))}
              </div>
            ))}
          </div>

          <div className="pointer-events-none -mt-[440px] grid grid-cols-[72px_repeat(7,minmax(0,1fr))]">
            <div />
            <div className="col-start-2 col-end-3 mt-[66px]">
              <div className="h-[110px] rounded-[18px] border border-[#E9D5FF]/70 bg-[#E9D5FF]/55 p-3 text-[#4C1D95] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                <p className="text-[12px] font-bold">{loading ? '...' : (allTasks[0]?.title ?? t('mockups.calendarWeekly.event_1_title'))}</p>
                <p className="mt-1 text-[11px]">08:00 - 09:30</p>
              </div>
            </div>
            <div className="col-start-3 col-end-4 mt-[108px]">
              <div className="h-[82px] rounded-[18px] border border-[#A7F3D0]/70 bg-[#A7F3D0]/25 p-3 text-[#166534] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                <p className="text-[12px] font-bold">{loading ? '...' : (allTasks[1]?.title ?? t('mockups.calendarWeekly.event_2_title'))}</p>
                <p className="mt-1 text-[11px]">10:00 - 11:00</p>
              </div>
            </div>
            <div className="col-start-4 col-end-5 mt-[72px]">
              <div className="h-[96px] rounded-[18px] bg-slate-200 p-3 text-[#334155] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                <p className="text-[12px] font-bold">{loading ? '...' : (allTasks[2]?.title ?? t('mockups.calendarWeekly.event_3_title'))}</p>
                <p className="mt-1 text-[11px]">09:00 - 10:30</p>
              </div>
            </div>
            <div className="col-start-5 col-end-6 mt-[60px]">
              <div className="h-[132px] rounded-[18px] border border-[#E9D5FF]/80 bg-[#E9D5FF]/70 p-3 text-[#4C1D95] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                <MaterialIcon name="palette" className="text-[18px]" />
                <p className="mt-2 text-[12px] font-bold">{loading ? '...' : (allTasks[3]?.title ?? t('mockups.calendarWeekly.event_4_title'))}</p>
                <p className="mt-1 text-[11px]">11:00 - 12:30</p>
              </div>
            </div>
            <div className="col-start-6 col-end-7 mt-[118px]">
              <div className="h-[74px] rounded-[18px] border border-[#A7F3D0]/70 bg-[#A7F3D0]/25 p-3 text-[#166534] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                <p className="text-[12px] font-bold">{loading ? '...' : (allTasks[4]?.title ?? t('mockups.calendarWeekly.event_5_title'))}</p>
                <p className="mt-1 text-[11px]">{t('mockups.calendarWeekly.event_5_tag')}</p>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-4 lg:grid-cols-[0.8fr_1fr_1fr]">
          <article className="rounded-[24px] bg-white p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#A7F3D0]/20 text-[#166534]">
                <MaterialIcon name="target" className="text-[18px]" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{t('mockups.calendarWeekly.focus_label')}</p>
                <p className="text-[24px] font-bold text-[#334155]">{loading ? '...' : '84%'}</p>
              </div>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[#1E293B]" style={{ width: '84%' }} />
            </div>
          </article>

          <article className="rounded-[24px] bg-[#1E293B] p-5 text-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-300">{t('mockups.calendarWeekly.next_task_label')}</p>
            <h3 className="mt-3 text-[22px] font-semibold leading-8">{t('mockups.calendarWeekly.next_task_title')}</h3>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex -space-x-2">
                <div className="h-8 w-8 rounded-full bg-[linear-gradient(135deg,#94A3B8,#E2E8F0)]" />
                <div className="h-8 w-8 rounded-full bg-[linear-gradient(135deg,#F9A8D4,#FDBA74)]" />
                <div className="h-8 w-8 rounded-full bg-[linear-gradient(135deg,#86EFAC,#34D399)]" />
              </div>
              <button type="button" onClick={() => router.push('/flow?variant=tasks')} className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#334155] transition hover:bg-slate-50">
                {t('mockups.calendarWeekly.join')}
              </button>
            </div>
          </article>

          <article className="rounded-[24px] bg-white p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{t('mockups.calendarWeekly.notes_label')}</p>
              <MaterialIcon name="more_horiz" className="text-[18px] text-slate-400" />
            </div>
            <ul className="mt-4 space-y-3 text-[14px] text-[#334155]">
              <li className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-[#E9D5FF]" />
                {t('mockups.calendarWeekly.note_1')}
              </li>
              <li className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-[#A7F3D0]" />
                {t('mockups.calendarWeekly.note_2')}
              </li>
            </ul>
          </article>
        </div>
      </div>
    </MockupShell>
  )
}
