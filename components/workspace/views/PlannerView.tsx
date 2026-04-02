'use client'

import React from 'react'
import { startTransition, useEffect, useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import { useRouter, useSearchParams } from 'next/navigation'

import PlanCalendar, { type CalendarView } from '@/components/PlanCalendar'
import { browserLapClient } from '@/src/lib/client/browser-http-client'
import { usePlanPackage } from '@/src/lib/client/use-plan-package'
import { t } from '@/src/i18n'
import type { PlanRow, ProgressRow } from '@/src/shared/types/lap-api'

import type { PlannerViewProps } from '../types'
import { PlannerProgressView } from './PlannerProgressView'

const LOCAL_PROFILE_ID_STORAGE_KEY = 'lap_profile_id'

type PlannerTab = 'calendar' | 'progress'

type PlannerQueryView = 'year' | 'month' | 'week' | 'day'

const VIEW_TABS: Array<{ labelKey: string, view: CalendarView, queryValue: PlannerQueryView }> = [
  { labelKey: 'dashboard.calendar_panel.view_annual', view: 'multiMonthYear', queryValue: 'year' },
  { labelKey: 'dashboard.calendar_panel.view_monthly', view: 'dayGridMonth', queryValue: 'month' },
  { labelKey: 'dashboard.calendar_panel.view_weekly', view: 'timeGridWeek', queryValue: 'week' },
  { labelKey: 'dashboard.calendar_panel.view_daily', view: 'timeGridDay', queryValue: 'day' }
]

export default function PlannerView({
  initialView = 'dayGridMonth',
  initialData = null
}: PlannerViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tasks, setTasks] = useState<ProgressRow[]>(initialData?.tasks ?? [])
  const [activePlan, setActivePlan] = useState<PlanRow | null>(initialData?.activePlan ?? null)
  const [isLoading, setIsLoading] = useState(initialData === null)
  const [currentView, setCurrentView] = useState<CalendarView>(initialView)
  const activeTab: PlannerTab = searchParams?.get('tab') === 'progress' ? 'progress' : 'calendar'
  const {
    package: planPackage,
    loading: isPackageLoading,
    error: packageError
  } = usePlanPackage(activeTab === 'progress' ? (activePlan?.id ?? undefined) : undefined)

  useEffect(() => {
    setCurrentView(initialView)
  }, [initialView])

  useEffect(() => {
    if (initialData) {
      setTasks(initialData.tasks)
      setActivePlan(initialData.activePlan)
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

  const updatePlanQuery = (nextTab: PlannerTab, nextView?: CalendarView) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('tab', nextTab)

    if (nextTab === 'calendar') {
      const resolvedView = VIEW_TABS.find((tab) => tab.view === (nextView ?? currentView))
      params.set('view', resolvedView?.queryValue ?? 'week')
    } else {
      params.delete('view')
    }

    const query = params.toString()
    router.replace(query ? `/plan?${query}` : '/plan')
  }

  const handleViewChange = (view: CalendarView) => {
    startTransition(() => {
      setCurrentView(view)
    })
    updatePlanQuery('calendar', view)
  }

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
            <h1 className="mt-2 font-display text-[26px] font-bold tracking-tight text-[#1f2937] sm:text-[30px] lg:text-[32px]">
              {activePlan?.nombre || t('dashboard.calendar_panel.title')}
            </h1>
          </div>

          <div className="min-w-0 flex-1 lg:max-w-[380px]">
            <div className="flex items-center justify-between gap-3 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
              <span>{t('planner.header.progress')}</span>
              <span className="text-[#1f2937]">{progressPercent}%</span>
            </div>
            <div className="mt-3 h-[6px] w-full overflow-hidden rounded-full bg-[rgba(31,41,55,0.08)]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPercent}%`,
                  background: 'linear-gradient(90deg, #1f2937, #0f766e)'
                }}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <nav className="flex flex-wrap items-center gap-2">
            {(['calendar', 'progress'] as PlannerTab[]).map((tab) => {
              const active = activeTab === tab

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => updatePlanQuery(tab)}
                  className={`inline-flex items-center rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] transition ${
                    active
                      ? 'bg-[#1f2937] text-white shadow-[0_20px_40px_-10px_rgba(17,24,39,0.18)]'
                      : 'bg-[rgba(255,253,249,0.86)] text-slate-500 hover:bg-white hover:text-slate-700'
                  }`}
                >
                  {t(`planner.tabs.${tab}`)}
                </button>
              )
            })}
          </nav>

          {activeTab === 'calendar' ? (
            <nav className="flex flex-wrap items-center gap-2">
              {VIEW_TABS.map((tab) => {
                const active = currentView === tab.view

                return (
                  <button
                    key={tab.view}
                    type="button"
                    onClick={() => handleViewChange(tab.view)}
                    className={`inline-flex items-center rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] transition ${
                      active
                        ? 'bg-[#1f2937] text-white shadow-[0_20px_40px_-10px_rgba(17,24,39,0.18)]'
                        : 'bg-[rgba(255,253,249,0.86)] text-slate-500 hover:bg-white hover:text-slate-700'
                    }`}
                  >
                    {t(tab.labelKey)}
                  </button>
                )
              })}
            </nav>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[18px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.92)] px-4 py-3 sm:px-5 sm:py-4">
            <span className="font-display text-[22px] font-bold leading-none text-[#1f2937] sm:text-[24px]">{taskCount}</span>
            <span className="mt-2 block font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400 sm:text-[11px]">
              {t('planner.header.activities')}
            </span>
          </div>

          <div className="rounded-[18px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.92)] px-4 py-3 sm:px-5 sm:py-4">
            <span className="font-display text-[22px] font-bold leading-none text-[#1f2937] sm:text-[24px]">{completedCount}</span>
            <span className="mt-2 block font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400 sm:text-[11px]">
              {t('planner.header.completed')}
            </span>
          </div>

          <div className="rounded-[18px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.92)] px-4 py-3 sm:px-5 sm:py-4">
            <span className="font-display text-[22px] font-bold leading-none text-[#1f2937] sm:text-[24px]">{pendingCount}</span>
            <span className="mt-2 block font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400 sm:text-[11px]">
              {t('planner.header.pending')}
            </span>
          </div>

          <div className="rounded-[18px] border border-[rgba(15,118,110,0.12)] bg-[rgba(15,118,110,0.08)] px-4 py-3 sm:px-5 sm:py-4">
            <span className="font-display text-[22px] font-bold leading-none text-[#0f766e] sm:text-[24px]">
              {progressPercent}%
            </span>
            <span className="mt-2 block font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400 sm:text-[11px]">
              {t('planner.header.progress')}
            </span>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex h-[520px] items-center justify-center rounded-[24px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl sm:h-[600px] sm:rounded-[32px]">
          <p className="font-display text-slate-400 animate-pulse">{t('ui.loading')}</p>
        </div>
      ) : !activePlan ? (
        <div className="flex flex-col items-center justify-center rounded-[24px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] py-16 text-center shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl sm:rounded-[32px] sm:py-20">
          <p className="text-lg font-bold text-slate-500">{t('dashboard.calendar_panel.empty_title')}</p>
          <p className="mt-2 text-slate-400">{t('dashboard.calendar_panel.empty_copy')}</p>
        </div>
      ) : activeTab === 'progress' ? (
        packageError ? (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 p-6 text-amber-900 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.14)] backdrop-blur-2xl sm:rounded-[32px]">
            <p className="font-display text-lg font-bold">{packageError}</p>
          </div>
        ) : isPackageLoading || !planPackage ? (
          <div className="flex h-[420px] items-center justify-center rounded-[24px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl sm:rounded-[32px]">
            <p className="font-display text-slate-400 animate-pulse">{t('ui.loading')}</p>
          </div>
        ) : (
          <PlannerProgressView package={planPackage} />
        )
      ) : (
        <div className="overflow-hidden rounded-[24px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl sm:rounded-[32px]">
          <PlanCalendar
            tasks={tasks}
            timezone={DateTime.local().zoneName ?? 'UTC'}
            defaultView={currentView}
            variant="light"
            showHeader={false}
          />
        </div>
      )}
    </div>
  )
}
