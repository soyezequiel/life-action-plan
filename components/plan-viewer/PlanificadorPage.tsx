'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { DateTime } from 'luxon'
import { t } from '@/src/i18n'
import { MockupShell } from '../midnight-mint/MockupShell'
import { browserLapClient } from '@/src/lib/client/browser-http-client'
import PlanCalendar, { type CalendarView } from '../PlanCalendar'
import type { CalendarApi } from '@fullcalendar/core'
import type { PlanRow, ProgressRow } from '@/src/shared/types/lap-api'

interface PlanificadorPageProps {
  initialView?: CalendarView
  initialData?: {
    activePlan: PlanRow | null
    tasks: ProgressRow[]
  } | null
}

export default function PlanificadorPage({ initialView = 'dayGridMonth', initialData = null }: PlanificadorPageProps) {
  const [tasks, setTasks] = useState<ProgressRow[]>(initialData?.tasks ?? [])
  const [activePlan, setActivePlan] = useState<PlanRow | null>(initialData?.activePlan ?? null)
  const [isLoading, setIsLoading] = useState(initialData === null)
  const [currentView, setCurrentView] = useState<CalendarView>(initialView)
  const calendarRef = useRef<CalendarApi | null>(null)

  const LOCAL_PROFILE_ID_STORAGE_KEY = 'lap_profile_id'

  useEffect(() => {
    if (initialData) {
      setIsLoading(false)
      return
    }

    async function loadData() {
      setIsLoading(true)
      try {
        let profileId = await browserLapClient.profile.latest()
        if (!profileId) {
          profileId = window.localStorage.getItem(LOCAL_PROFILE_ID_STORAGE_KEY)
        }

        if (!profileId) {
          setIsLoading(false)
          return
        }

        const plans = await browserLapClient.plan.list(profileId)
        const active = plans[0] // Default to the first plan for now
        
        if (active) {
          setActivePlan(active)
          const allTasks = await browserLapClient.progress.list(active.id)
          setTasks(allTasks)
        }
      } catch (error) {
        console.error('Error loading planner data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData().catch(err => {
      console.error('[LAP] Unhandled error during planner data load:', err)
    })
  }, [initialData])

  const handleViewChange = (view: CalendarView) => {
    setCurrentView(view)
    if (calendarRef.current) {
      calendarRef.current.changeView(view)
    }
  }

  const viewTabs = [
    { label: t('dashboard.calendar_panel.view_annual'), active: currentView === 'multiMonthYear', onClick: () => handleViewChange('multiMonthYear') },
    { label: t('dashboard.calendar_panel.view_monthly'), active: currentView === 'dayGridMonth', onClick: () => handleViewChange('dayGridMonth') },
    { label: t('dashboard.calendar_panel.view_weekly'), active: currentView === 'timeGridWeek', onClick: () => handleViewChange('timeGridWeek') },
    { label: t('dashboard.calendar_panel.view_daily'), active: currentView === 'timeGridDay', onClick: () => handleViewChange('timeGridDay') }
  ]

  // Memoized task metrics to avoid O(N) filters on every render
  const taskCount = tasks.length
  const completedCount = useMemo(() => tasks.filter(t => t.completado).length, [tasks])
  const pendingCount = taskCount - completedCount
  const progressPercent = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0

  return (
    <MockupShell
      sidebarLabel={t('mockups.common.digital_sanctuary')}
      topTabs={viewTabs.map(tab => ({
        label: tab.label,
        active: tab.active,
        // We use onClick instead of href for smoother in-page transitions
        onClick: tab.onClick
      }))}
      contentClassName="p-0" // Full width for the calendar
    >
      <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <header className="mb-6 sm:mb-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400 sm:text-[11px]">
                {t('dashboard.calendar_panel.label')}
              </p>
              <h1 className="mt-2 font-display text-[26px] font-bold tracking-tight text-[#334155] sm:text-[30px] lg:text-[32px]">
                {activePlan?.nombre || t('dashboard.calendar_panel.title')}
              </h1>
            </div>

            <div className="min-w-0 flex-1 lg:max-w-[380px]">
              <div className="flex items-center justify-between gap-3 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                <span>{t('planner.header.progress')}</span>
                <span className="text-[#334155]">{progressPercent}%</span>
              </div>
              <div className="mt-3 h-[6px] w-full overflow-hidden rounded-full bg-[#e2e8f0]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${progressPercent}%`,
                    background: 'linear-gradient(90deg, #1e293b, #3b82f6)'
                  }}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[18px] border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 sm:px-5 sm:py-4">
              <span className="font-display text-[22px] font-bold leading-none text-[#334155] sm:text-[24px]">{taskCount}</span>
              <span className="mt-2 block font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400 sm:text-[11px]">
                {t('planner.header.activities')}
              </span>
            </div>

            <div className="rounded-[18px] border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 sm:px-5 sm:py-4">
              <span className="font-display text-[22px] font-bold leading-none text-[#334155] sm:text-[24px]">{completedCount}</span>
              <span className="mt-2 block font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400 sm:text-[11px]">
                {t('planner.header.completed')}
              </span>
            </div>

            <div className="rounded-[18px] border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 sm:px-5 sm:py-4">
              <span className="font-display text-[22px] font-bold leading-none text-[#334155] sm:text-[24px]">{pendingCount}</span>
              <span className="mt-2 block font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400 sm:text-[11px]">
                {t('planner.header.pending')}
              </span>
            </div>

            <div className="rounded-[18px] border border-[#dbeafe] bg-[#eff6ff] px-4 py-3 sm:px-5 sm:py-4">
              <span className="font-display text-[22px] font-bold leading-none text-[#1d4ed8] sm:text-[24px]">
                {progressPercent}%
              </span>
              <span className="mt-2 block font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400 sm:text-[11px]">
                {t('planner.header.progress')}
              </span>
            </div>
          </div>
        </header>

        {isLoading ? (
          <div className="flex h-[520px] items-center justify-center rounded-[24px] border border-slate-100 bg-white shadow-sm sm:h-[600px] sm:rounded-[32px]">
            <p className="text-slate-400 font-display animate-pulse">{t('ui.loading')}</p>
          </div>
        ) : activePlan ? (
          <div className="overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] sm:rounded-[32px]">
            <PlanCalendar
              calendarRef={calendarRef}
              tasks={tasks}
              timezone={DateTime.local().zoneName ?? 'UTC'}
              defaultView={currentView}
              variant="light"
              showHeader={false} // Hidden as we have our own header in PlanificadorPage
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-[24px] border border-slate-100 bg-white py-16 text-center shadow-sm sm:rounded-[32px] sm:py-20">
            <p className="text-slate-500 font-bold text-lg">{t('dashboard.calendar_panel.empty_title')}</p>
            <p className="text-slate-400 mt-2">{t('dashboard.calendar_panel.empty_copy')}</p>
          </div>
        )}
      </div>
    </MockupShell>
  )
}
