'use client'

import { useState, useEffect } from 'react'
import { DateTime } from 'luxon'
import { t } from '@/src/i18n'
import { MockupShell } from '../midnight-mint/MockupShell'
import { browserLapClient } from '@/src/lib/client/browser-http-client'
import PlanCalendar, { type CalendarView } from '../PlanCalendar'
import type { ProgressRow } from '@/src/shared/types/lap-api'

interface PlanificadorPageProps {
  initialView?: CalendarView
}

export default function PlanificadorPage({ initialView = 'dayGridMonth' }: PlanificadorPageProps) {
  const [tasks, setTasks] = useState<ProgressRow[]>([])
  const [activePlan, setActivePlan] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [currentView, setCurrentView] = useState<CalendarView>(initialView)

  const LOCAL_PROFILE_ID_STORAGE_KEY = 'lap_profile_id'

  useEffect(() => {
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
  }, [])

  const viewTabs = [
    { label: t('dashboard.calendar_panel.view_annual'), active: currentView === 'multiMonthYear', onClick: () => setCurrentView('multiMonthYear') },
    { label: t('dashboard.calendar_panel.view_monthly'), active: currentView === 'dayGridMonth', onClick: () => setCurrentView('dayGridMonth') },
    { label: t('dashboard.calendar_panel.view_weekly'), active: currentView === 'timeGridWeek', onClick: () => setCurrentView('timeGridWeek') },
    { label: t('dashboard.calendar_panel.view_daily'), active: currentView === 'timeGridDay', onClick: () => setCurrentView('timeGridDay') }
  ]

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
      <div className="mx-auto w-full max-w-[1400px] p-8">
        <header className="mb-8">
          <h1 className="font-display text-[32px] font-bold tracking-tight text-[#334155]">
            {activePlan?.nombre || t('dashboard.calendar_panel.title')}
          </h1>
          
          <div className="mt-4 h-[4px] w-full overflow-hidden rounded-full bg-[#e2e8f0]">
            <div 
              className="h-full transition-all duration-500 rounded-full"
              style={{ 
                width: `${tasks.length > 0 ? Math.round((tasks.filter(t => t.completado).length / tasks.length) * 100) : 0}%`,
                background: 'linear-gradient(90deg, #1e293b, #3b82f6)'
              }}
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-4">
            <div className="flex flex-col items-start justify-center rounded-[16px] border border-[#e2e8f0] bg-[#f1f5f9] px-[20px] py-[12px]">
              <span className="font-display text-lg font-bold text-[#334155]">{tasks.length}</span>
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400 mt-1">
                {t('planner.header.activities')}
              </span>
            </div>
            <div className="flex flex-col items-start justify-center rounded-[16px] border border-[#e2e8f0] bg-[#f1f5f9] px-[20px] py-[12px]">
              <span className="font-display text-lg font-bold text-[#334155]">{tasks.filter(t => t.completado).length}</span>
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400 mt-1">
                {t('planner.header.completed')}
              </span>
            </div>
            <div className="flex flex-col items-start justify-center rounded-[16px] border border-[#e2e8f0] bg-[#f1f5f9] px-[20px] py-[12px]">
              <span className="font-display text-lg font-bold text-[#334155]">{tasks.length - tasks.filter(t => t.completado).length}</span>
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400 mt-1">
                {t('planner.header.pending')}
              </span>
            </div>
            <div className="flex flex-col items-start justify-center rounded-[16px] border border-[#e2e8f0] bg-[#f1f5f9] px-[20px] py-[12px]">
              <span className="font-display text-lg font-bold text-[#334155]">
                {tasks.length > 0 ? Math.round((tasks.filter(t => t.completado).length / tasks.length) * 100) : 0}%
              </span>
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400 mt-1">
                {t('planner.header.progress')}
              </span>
            </div>
          </div>
        </header>

        {isLoading ? (
          <div className="flex h-[600px] items-center justify-center rounded-[32px] bg-white border border-slate-100 shadow-sm">
            <p className="text-slate-400 font-display animate-pulse">{t('ui.loading')}</p>
          </div>
        ) : activePlan ? (
          <div className="overflow-hidden rounded-[32px] bg-white border border-slate-100 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <PlanCalendar
              key={currentView}
              tasks={tasks}
              timezone={DateTime.local().zoneName ?? 'UTC'}
              defaultView={currentView}
              variant="light"
              showHeader={false} // Hidden as we have our own header in PlanificadorPage
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 rounded-[32px] bg-white border border-slate-100 shadow-sm text-center">
            <p className="text-slate-500 font-bold text-lg">{t('dashboard.calendar_panel.empty_title')}</p>
            <p className="text-slate-400 mt-2">{t('dashboard.calendar_panel.empty_copy')}</p>
          </div>
        )}
      </div>
    </MockupShell>
  )
}
