'use client'

import { useState, useEffect } from 'react'
import { DateTime } from 'luxon'
import { useRouter, useSearchParams } from 'next/navigation'
import { t } from '@/src/i18n'
import type { DeploymentMode } from '@/src/lib/env/deployment'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
import { MockupShell } from '../midnight-mint/MockupShell'
import { browserLapClient } from '@/src/lib/client/browser-http-client'
import { readPlanV5Manifest } from '@/src/shared/utils/plan-manifest'

interface DashboardMockupProps {
  deploymentMode?: DeploymentMode
}

export default function DashboardMockup({ deploymentMode }: DashboardMockupProps) {
  void deploymentMode
  const [timeRemaining, setTimeRemaining] = useState<string>('')
  const [dateStr, setDateStr] = useState<string>('')
  const [isClient, setIsClient] = useState(false)
  const [hydrationProgress, setHydrationProgress] = useState(0)
  const [readingProgress, setReadingProgress] = useState(0)
  const [activePlan, setActivePlan] = useState<any>(null)
  const [tasks, setTasks] = useState<any[]>([])
  const [weeklySummary, setWeeklySummary] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [riskStatus, setRiskStatus] = useState<'green' | 'amber' | 'red'>('green')

  const router = useRouter()
  const searchParams = useSearchParams()
  const planIdParam = searchParams.get('planId')
  const LOCAL_PROFILE_ID_STORAGE_KEY = 'lap_profile_id'

  const calculateRisk = (currentTasks: any[]) => {
    const now = DateTime.local()
    const completedCount = currentTasks.filter(t => t.completado).length
    const totalCount = currentTasks.length
    
    if (totalCount === 0) return 'green'
    
    const progress = completedCount / totalCount
    
    // ROJO (Critical): < 20% completed and it is after 17:00.
    if (now.hour >= 17 && progress < 0.2) return 'red'
    // ÁMBAR (Warning): < 50% completed and it is after 14:00.
    if (now.hour >= 14 && progress < 0.5) return 'amber'
    
    return 'green'
  }

  useEffect(() => {
    async function loadDashboardData() {
      setIsLoading(true)
      try {
        // 1. Resolve Profile ID (Backend session > URL > LocalStorage)
        let profileId: string | null = await browserLapClient.profile.latest()
        
        if (profileId) {
          window.localStorage.setItem(LOCAL_PROFILE_ID_STORAGE_KEY, profileId)
        } else {
          profileId = window.localStorage.getItem(LOCAL_PROFILE_ID_STORAGE_KEY)
        }

        console.log(`[Dashboard] Resolviendo datos para perfil: ${profileId}, planIdParam: ${planIdParam}`)

        if (!profileId) {
          setIsLoading(false)
          return
        }

        // 2. Resolve Plan list
        const plans = await browserLapClient.plan.list(profileId)
        
        // 3. Select Active Plan
        let active = plans.find(p => p.id === planIdParam) || plans[0]
        
        console.log(`[Dashboard] Planes encontrados: ${plans.length}, Seleccionado: ${active?.id} (${active?.nombre})`)

        if (!active) {
          setIsLoading(false)
          return
        }

        setActivePlan(active)
        const today = DateTime.local().toISODate()!
        const [progressRows, summary] = await Promise.all([
          browserLapClient.progress.list(active.id, today),
          browserLapClient.progress.summary(active.id, 5)
        ])

        setTasks(progressRows)
        setWeeklySummary(summary)
        setRiskStatus(calculateRisk(progressRows))

        // 4. Clean up URL if we were forced to a specific plan
        if (planIdParam) {
          window.history.replaceState({}, '', '/')
        }

        // Basic metrics calculation
        if (progressRows.length > 0) {
          const completedCount = progressRows.filter(t => t.completado).length
          const totalCount = progressRows.length
          const generalProgress = Math.round((completedCount / totalCount) * 100)
          
          setHydrationProgress(generalProgress)
          setReadingProgress(Math.min(100, Math.round(generalProgress * 1.2)))
        }
      } catch (error) {
        console.error('Error loading dashboard data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadDashboardData()
  }, [planIdParam])

  const handleToggleTask = async (taskId: string) => {
    try {
      const result = await browserLapClient.progress.toggle(taskId)
      setTasks(current => {
        const newTasks = current.map(t => t.id === taskId ? { ...t, completado: result.completado } : t)
        setRiskStatus(calculateRisk(newTasks))
        return newTasks
      })
    } catch (error) {
      console.error('Error toggling task:', error)
    }
  }

  useEffect(() => {
    const updateTime = () => {
      const now = DateTime.local()
      const endOfDay = now.endOf('day')
      const diff = endOfDay.diff(now, ['hours', 'minutes']).toObject()
      
      const h = Math.floor(diff.hours ?? 0).toString().padStart(2, '0')
      const m = Math.floor(diff.minutes ?? 0).toString().padStart(2, '0')
      
      setTimeRemaining(`${h}:${m} restante`)
      setDateStr(now.toFormat('cccc d LLLL yyyy', { locale: 'es-AR' }))
    }

    setIsClient(true)
    updateTime()
    const interval = setInterval(updateTime, 60000)
    return () => clearInterval(interval)
  }, [])

  if (!isClient) return null // Prevent hydration mismatch by not rendering time-sensitive content on server

  return (
    <MockupShell
      sidebarLabel={t('mockups.common.santuario_digital')}
      sidebarNav={[
        { label: t('dashboard.shell_nav.dashboard'), icon: 'dashboard', active: true, href: '/' },
        { label: t('dashboard.shell_nav.calendar'), icon: 'calendar_today', href: '/plan' },
        { label: t('dashboard.shell_nav.flow'), icon: 'check_circle', href: '/intake' },
        { label: t('dashboard.shell_nav.plan'), icon: 'description', href: '/plan?view=week' },
        { label: t('dashboard.shell_nav.system'), icon: 'settings', href: '/settings' }
      ]}
      sidebarPrimaryAction={{ label: t('mockups.common.new_entry'), icon: 'add', href: '/intake' }}
      sidebarFooter={[
        { label: t('mockups.common.help'), icon: 'help', href: '#' },
        { label: t('mockups.common.exit'), icon: 'logout', href: '#' }
      ]}
      topTabs={[]}
      topRight={(
        <>
          <div className="flex h-9 items-center rounded-full bg-slate-100/80 px-4 text-[14px] text-slate-400 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            {t('mockups.common.search')}
          </div>
          <button type="button" onClick={() => router.push('/settings')} className="text-slate-500 transition hover:text-[#334155]">
            <MaterialIcon name="notifications" className="text-[20px]" />
          </button>
          <button type="button" onClick={() => router.push('/settings')} className="text-slate-500 transition hover:text-[#334155]">
            <MaterialIcon name="account_circle" className="text-[20px]" />
          </button>
        </>
      )}
    >
      <div className="mx-auto w-full max-w-[1360px]">
        <header className="mb-10">
          <h1 className="font-display text-[32px] font-bold tracking-tight text-[#334155]">
            {activePlan?.nombre || t('mockups.dashboard.title')}
          </h1>
          <p className="mt-2 text-[15px] leading-7 text-slate-500">
            {isLoading ? 'Cargando tu progreso...' : (activePlan ? t('mockups.dashboard.copy') : 'Comienza hoy mismo creando tu primer plan.')}
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
          <section className="overflow-hidden rounded-[24px] bg-white p-8 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] xl:col-span-4">
            <div className="mb-8 flex items-center justify-between">
              <h2 className="font-display text-[18px] font-bold text-[#334155]">{dateStr || t('mockups.dashboard.daily.title')}</h2>
              <MaterialIcon name="today" className="text-[20px] text-slate-400" />
            </div>

            <div className="space-y-6">
              {isLoading ? (
                <div className="py-8 text-center text-slate-400">Cargando horario...</div>
              ) : (activePlan && readPlanV5Manifest(activePlan.manifest)?.package?.plan.detail.weeks[0]?.scheduledEvents?.length) ? (
                (() => {
                  const v5 = readPlanV5Manifest(activePlan.manifest)
                  const events = v5?.package?.plan.detail.weeks[0]?.scheduledEvents || []
                  // For the mockup, we just show the first 3 events of the first week
                  // In a real app, we would filter by the current day of the week
                  return events.slice(0, 3).map((event: any, idx: number) => {
                    const colors = ['#A7F3D0', '#E9D5FF', '#1E293B33']
                    const color = colors[idx % colors.length]
                    return (
                      <article key={idx} className="border-l-4 pl-4 py-1" style={{ borderColor: color }}>
                        <h3 className="text-[16px] font-semibold text-[#334155]">{event.title}</h3>
                        <p className="text-[12px] text-slate-500">{event.startAt ? DateTime.fromISO(event.startAt).toFormat('HH:mm') : 'Horario flexible'}</p>
                      </article>
                    )
                  })
                })()
              ) : (
                <div className="py-8 text-center text-slate-400 italic">
                  {activePlan ? 'Sin eventos para hoy.' : 'Crea un plan para ver tu horario.'}
                </div>
              )}
            </div>

            <div className="mt-8 border-t border-slate-100 pt-6">
              <div className="flex items-center gap-4 rounded-[18px] bg-[#FAFAF9] p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#A7F3D0]">
                  <MaterialIcon name="timer" className="text-[18px] text-[#334155]" />
                </div>
                <div>
                  <p className="text-[11px] font-display font-bold uppercase tracking-[0.22em] text-slate-400">
                    {t('mockups.dashboard.daily.focus_mode')}
                  </p>
                  <p className="font-display text-[15px] font-bold text-[#334155]">{timeRemaining}</p>
                </div>
              </div>
            </div>
          </section>

          <div className="xl:col-span-8">
            <section className="rounded-[24px] bg-white p-8 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <div className="mb-8 flex items-center justify-between">
                <h2 className="font-display text-[18px] font-bold text-[#334155]">{t('mockups.dashboard.checklist.title')}</h2>
                <div className="flex gap-2">
                  <span className="rounded bg-[#E9D5FF] px-2 py-1 text-[10px] font-display font-bold uppercase tracking-[0.2em] text-[#581C87]">
                    {t('mockups.dashboard.checklist.priority')}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-display font-bold uppercase tracking-[0.2em] text-slate-500">
                    {t('mockups.dashboard.checklist.active')}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                {isLoading ? (
                  <div className="py-12 text-center text-slate-400">Buscando tareas...</div>
                ) : tasks.length > 0 ? (
                  tasks.map((task) => (
                    <div 
                      key={task.id}
                      onClick={() => handleToggleTask(task.id)}
                      className={`group flex cursor-pointer items-center gap-4 rounded-[18px] border border-transparent p-4 transition ${
                        task.completado ? 'border-[#A7F3D0]/20 bg-[#A7F3D0]/10' : 'hover:border-slate-100 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`flex h-6 w-6 items-center justify-center rounded-md border-2 ${
                        task.completado ? 'bg-[#1E293B] border-[#1E293B] text-white' : 'border-slate-200'
                      }`}>
                        <MaterialIcon name="check" className={`text-[14px] ${task.completado ? 'text-white' : 'text-transparent group-hover:text-[#334155]'}`} />
                      </div>
                      <h3 className={`flex-1 text-[16px] text-[#334155] ${task.completado ? 'line-through opacity-50' : ''}`}>
                        {task.descripcion}
                      </h3>
                      {task.completado ? (
                        <MaterialIcon name="verified" className="text-[18px] text-[#A7F3D0]" />
                      ) : (
                        <MaterialIcon name="drag_indicator" className="text-[18px] text-slate-300" />
                      )}
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center">
                    <p className="text-slate-400">{t('mockups.dashboard.checklist.empty', { defaultValue: 'No hay tareas programadas para hoy.' })}</p>
                    {!activePlan && (
                      <button 
                        onClick={() => router.push('/flow')}
                        className="mt-4 rounded-full bg-[#1E293B] px-6 py-2 text-sm font-bold text-white transition hover:bg-[#334155]"
                      >
                        {t('mockups.common.new_entry')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>

            <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-2">
              <section className="rounded-[24px] bg-white p-8 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                <h2 className="mb-8 font-display text-[18px] font-bold text-[#334155]">{t('mockups.dashboard.metrics.title')}</h2>
                <div className="space-y-6">
                  <div>
                    <div className="mb-2 flex justify-between">
                      <h3 className="text-[16px] font-medium text-slate-600">{t('mockups.dashboard.metrics.hydration')}</h3>
                      <span className="text-[12px] font-display font-bold text-[#334155]">{hydrationProgress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-[#A7F3D0]" style={{ width: `${hydrationProgress}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex justify-between">
                      <h3 className="text-[16px] font-medium text-slate-600">{t('mockups.dashboard.metrics.technical_reading')}</h3>
                      <span className="text-[12px] font-display font-bold text-[#334155]">{readingProgress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-[#E9D5FF]" style={{ width: `${readingProgress}%` }} />
                    </div>
                  </div>
                  <div className="flex justify-around pt-4">
                    {weeklySummary.slice(0, 5).map((item, index) => {
                      const dayLetter = ['L', 'M', 'M', 'J', 'V'][index] || '?'
                      const percentage = item.percentage
                      const isToday = item.date === DateTime.local().toISODate()
                      const isComplete = percentage >= 80

                      return (
                        <div
                          key={index}
                          className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-500 text-[10px] font-bold ${
                            isComplete 
                              ? 'border-[#A7F3D0] bg-[#A7F3D0]/10 text-[#334155]' 
                              : percentage > 0 
                                ? 'border-[#E9D5FF] bg-[#E9D5FF]/5 text-[#334155]'
                                : 'border-slate-100 text-slate-400'
                          } ${isToday ? 'ring-2 ring-slate-100 ring-offset-2' : ''}`}
                          title={`${percentage}% completado`}
                        >
                          {dayLetter}
                        </div>
                      )
                    })}
                    {weeklySummary.length === 0 && ['L', 'M', 'M', 'J', 'V'].map((letter, index) => (
                      <div key={index} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-slate-100 text-[10px] font-bold text-slate-300 opacity-50">
                        {letter}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
              <section className="relative overflow-hidden rounded-[24px] bg-white p-8 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] group">
                <div className={`absolute top-0 right-0 w-32 h-32 blur-3xl -mr-16 -mt-16 transition-colors duration-1000 ${
                  riskStatus === 'red' ? 'bg-red-500/10' : riskStatus === 'amber' ? 'bg-amber-500/10' : 'bg-[#A7F3D0]/10'
                }`} />
                
                <h2 className="mb-6 font-display text-[18px] font-bold text-[#334155] tracking-tight">{t('mockups.dashboard.risk.title')}</h2>
                
                <div className="flex flex-col items-center justify-center py-2 relative z-10">
                  <div className="flex items-center gap-6 mb-6">
                    <div className="relative flex items-center justify-center">
                      <div className={`absolute h-16 w-16 rounded-full animate-ping opacity-20 ${
                        riskStatus === 'red' ? 'bg-red-500' : riskStatus === 'amber' ? 'bg-amber-500' : 'bg-[#A7F3D0]'
                      }`} />
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center shadow-lg transition-colors duration-500 ${
                        riskStatus === 'red' ? 'bg-red-500' : riskStatus === 'amber' ? 'bg-amber-500' : 'bg-[#A7F3D0]'
                      }`}>
                        <MaterialIcon 
                          name={riskStatus === 'red' ? 'priority_high' : riskStatus === 'amber' ? 'warning' : 'check'} 
                          className="text-white text-[24px]" 
                        />
                      </div>
                    </div>
                  </div>

                  <div className="text-center">
                    <h3 className="text-[17px] font-bold text-[#1E293B] mb-1">
                      <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 mr-2">
                        {t('mockups.dashboard.risk.status_prefix')}
                      </span>
                      <span className={`transition-colors duration-500 ${
                        riskStatus === 'red' ? 'text-red-600' : riskStatus === 'amber' ? 'text-amber-600' : 'text-[#059669]'
                      }`}>
                        {t(`mockups.dashboard.risk.status_${riskStatus}`)}
                      </span>
                    </h3>
                    <p className="max-w-[240px] text-[13px] leading-relaxed text-slate-500">
                      {t(`mockups.dashboard.risk.copy_${riskStatus}`)}
                    </p>
                  </div>
                </div>
              </section>

            </div>

            <footer className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
              {[
                { value: tasks.length.toString(), label: t('mockups.dashboard.footer.tasks'), icon: 'task_alt' },
                { value: `${tasks.length > 0 ? Math.round((tasks.filter(t => t.completado).length / tasks.length) * 100) : 0}%`, label: t('mockups.dashboard.footer.productivity'), icon: 'bolt' },
                { value: tasks.filter(t => t.completado).length > 0 ? `0${tasks.filter(t => t.completado).length}:00` : '00:00', label: t('mockups.dashboard.footer.focus'), icon: 'timer' },
                { value: activePlan ? '+14%' : '--', label: t('mockups.dashboard.footer.variation'), icon: 'trending_up' }
              ].map((item) => (
                <article
                  key={item.label}
                  className="flex items-center gap-4 rounded-[20px] bg-white/80 px-6 py-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-white">
                    <MaterialIcon name={item.icon} className="text-[20px] text-[#334155]" />
                  </div>
                  <div>
                    <p className="font-display text-[24px] font-bold leading-none text-[#334155]">{item.value}</p>
                    <p className="mt-1 text-[10px] font-display font-bold uppercase tracking-[0.24em] text-slate-400">{item.label}</p>
                  </div>
                </article>
              ))}
            </footer>
          </div>
        </div>
      </div>
    </MockupShell>
  )
}
