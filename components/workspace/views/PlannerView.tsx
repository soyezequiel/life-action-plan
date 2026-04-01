'use client'

import React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CalendarApi } from '@fullcalendar/core'
import { DateTime } from 'luxon'

import PlanCalendar, { type CalendarView } from '@/components/PlanCalendar'
import { browserLapClient } from '@/src/lib/client/browser-http-client'
import { t } from '@/src/i18n'
import type { PlanRow, ProgressRow } from '@/src/shared/types/lap-api'

import type { PlannerViewProps } from '../types'

const LOCAL_PROFILE_ID_STORAGE_KEY = 'lap_profile_id'

export default function PlannerView({
  initialView = 'dayGridMonth',
  initialData = null
}: PlannerViewProps) {
  const [tasks, setTasks] = useState<ProgressRow[]>(initialData?.tasks ?? [])
  const [activePlan, setActivePlan] = useState<PlanRow | null>(initialData?.activePlan ?? null)
  const [isLoading, setIsLoading] = useState(initialData === null)
  const [currentView, setCurrentView] = useState<CalendarView>(initialView)
  const calendarRef = useRef<CalendarApi | null>(null)

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
        const nextActivePlan = plans[0] ?? null

        setActivePlan(nextActivePlan)

        if (!nextActivePlan) {
          setTasks([])
          setIsLoading(false)
          return
        }

        setTasks(await browserLapClient.progress.list(nextActivePlan.id))
      } catch (error) {
        console.error('Error loading planner data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    void loadData()
  }, [initialData])

  const handleViewChange = (view: CalendarView) => {
    setCurrentView(view)

    if (calendarRef.current) {
      calendarRef.current.changeView(view)
    }
  }

  const viewTabs = [
    { label: t('dashboard.calendar_panel.view_annual'), view: 'multiMonthYear' as const },
    { label: t('dashboard.calendar_panel.view_monthly'), view: 'dayGridMonth' as const },
    { label: t('dashboard.calendar_panel.view_weekly'), view: 'timeGridWeek' as const },
    { label: t('dashboard.calendar_panel.view_daily'), view: 'timeGridDay' as const }
  ]

  const taskCount = tasks.length
  const completedCount = useMemo(() => tasks.filter((task) => task.completado).length, [tasks])
  const pendingCount = taskCount - completedCount
  const progressPercent = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0

  return (
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

        <nav className="mt-5 flex flex-wrap items-center gap-2">
          {viewTabs.map((tab) => {
            const active = currentView === tab.view

            return (
              <button
                key={tab.view}
                type="button"
                onClick={() => handleViewChange(tab.view)}
                className={`inline-flex items-center rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] transition ${
                  active
                    ? 'bg-[#1E293B] text-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.12)]'
                    : 'bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>

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
          <p className="font-display text-slate-400 animate-pulse">{t('ui.loading')}</p>
        </div>
      ) : activePlan ? (
        <div className="overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] sm:rounded-[32px]">
          <PlanCalendar
            calendarRef={calendarRef}
            tasks={tasks}
            timezone={DateTime.local().zoneName ?? 'UTC'}
            defaultView={currentView}
            variant="light"
            showHeader={false}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-[24px] border border-slate-100 bg-white py-16 text-center shadow-sm sm:rounded-[32px] sm:py-20">
          <p className="text-lg font-bold text-slate-500">{t('dashboard.calendar_panel.empty_title')}</p>
          <p className="mt-2 text-slate-400">{t('dashboard.calendar_panel.empty_copy')}</p>
        </div>
      )}
    </div>
  )
}
