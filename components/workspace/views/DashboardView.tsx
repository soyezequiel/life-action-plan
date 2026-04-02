'use client'

import React from 'react'
import Link from 'next/link'
import { startTransition, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DateTime } from 'luxon'

import { t } from '@/src/i18n'
import { useLapClient } from '@/src/lib/client/app-services'
import type { DashboardSummaryResult } from '@/src/shared/types/lap-api'
import { useUserStatusContext } from '@/src/lib/client/UserStatusProvider'

import { MaterialIcon } from '../../midnight-mint/MaterialIcon'
import type { DashboardViewProps } from '../types'

const LOCAL_PROFILE_ID_STORAGE_KEY = 'lap_profile_id'

function formatCountdown(totalMinutes: number | null): string {
  if (totalMinutes === null) return '--:--'
  const safeMinutes = Math.max(0, Math.ceil(totalMinutes))
  return `${Math.floor(safeMinutes / 60).toString().padStart(2, '0')}:${(safeMinutes % 60).toString().padStart(2, '0')}`
}

function formatTimeRange(startAt: string, endAt: string): string {
  return `${DateTime.fromISO(startAt).toFormat('HH:mm')} - ${DateTime.fromISO(endAt).toFormat('HH:mm')}`
}

function getTrendCopy(direction: DashboardSummaryResult['trend']['direction']): string {
  if (direction === 'up') return t('dashboard.trend.up')
  if (direction === 'down') return t('dashboard.trend.down')
  if (direction === 'flat') return t('dashboard.trend.flat')
  return t('dashboard.trend.unavailable')
}

function getFocusCopy(summary: DashboardSummaryResult): string {
  if (summary.focus.status === 'no_events') return t('dashboard.focus.no_events')
  if (summary.focus.status === 'in_event') return t('dashboard.focus.current')
  if (summary.focus.status === 'before_next') return t('dashboard.focus.next')
  return t('dashboard.focus.after')
}

function applyTaskToggle(summary: DashboardSummaryResult, taskId: string, completado: boolean): DashboardSummaryResult {
  const tasks = summary.tasks.map((task) => (
    task.id === taskId ? { ...task, completado } : task
  ))
  const tasksCompleted = tasks.filter((task) => task.completado).length
  const tasksTotal = tasks.length
  const progressPercentage = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0
  const todayIso = summary.date
  const week = {
    days: summary.week.days.map((day) => {
      if (day.date !== todayIso) {
        return day
      }

      return {
        ...day,
        completedCount: tasksCompleted,
        totalCount: tasksTotal,
        percentage: progressPercentage,
      }
    })
  }

  return {
    ...summary,
    tasks,
    tasksCompleted,
    tasksTotal,
    tasksActive: Math.max(0, tasksTotal - tasksCompleted),
    progressPercentage,
    week,
  }
}

export default function DashboardView({ initialData = null }: DashboardViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const lapClient = useLapClient()
  const { latestProfileId: latestProfileIdFromStatus } = useUserStatusContext()
  const requestedPlanId = searchParams?.get('planId') ?? null
  const [summary, setSummary] = useState<DashboardSummaryResult | null>(initialData)
  const [isLoading, setIsLoading] = useState(initialData === null)
  const [error, setError] = useState<string | null>(null)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const shouldResolveFromServer = !summary || (requestedPlanId !== null && requestedPlanId !== summary.planId)

  const resolvePlanId = async (): Promise<string | null> => {
    let profileId = latestProfileIdFromStatus

    if (!profileId) {
      profileId = window.localStorage.getItem(LOCAL_PROFILE_ID_STORAGE_KEY)
    }

    if (!profileId) return null
    const plans = await lapClient.plan.list(profileId)
    const selected = requestedPlanId ? plans.find((plan) => plan.id === requestedPlanId) ?? plans[0] ?? null : plans[0] ?? null
    return selected?.id ?? null
  }

  const loadSummary = async (planId: string, showLoader = true): Promise<void> => {
    if (showLoader) {
      setIsLoading(true)
    }
    setError(null)
    try {
      setSummary(await lapClient.dashboard.summary(planId))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('dashboard.error'))
    } finally {
      if (showLoader) {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    let isMounted = true
    if (!shouldResolveFromServer) return () => { isMounted = false }
    const bootstrap = async (): Promise<void> => {
      setIsLoading(true)
      setError(null)
      try {
        const planId = await resolvePlanId()
        if (!isMounted) return
        if (!planId) {
          setSummary(null)
          return
        }
        const nextSummary = await lapClient.dashboard.summary(planId)
        if (!isMounted) return
        setSummary(nextSummary)
      } catch (nextError) {
        if (!isMounted) return
        setError(nextError instanceof Error ? nextError.message : t('dashboard.error'))
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }
    void bootstrap()
    return () => { isMounted = false }
  }, [requestedPlanId, shouldResolveFromServer, latestProfileIdFromStatus])

  const handleToggleTask = async (taskId: string): Promise<void> => {
    if (!summary) return
    setBusyTaskId(taskId)
    const currentTask = summary.tasks.find((task) => task.id === taskId)
    const nextCompleted = currentTask ? !currentTask.completado : false

    if (currentTask) {
      setSummary((current) => (current ? applyTaskToggle(current, taskId, nextCompleted) : current))
    }

    try {
      await lapClient.progress.toggle(taskId)
      startTransition(() => {
        void loadSummary(summary.planId, false)
      })
    } catch (nextError) {
      setSummary(summary)
      setError(nextError instanceof Error ? nextError.message : t('dashboard.error'))
    } finally {
      setBusyTaskId(null)
    }
  }

  const handleLogout = async (): Promise<void> => {
    setIsLoggingOut(true)
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      if (!response.ok) throw new Error(t('dashboard.error'))
      router.replace('/auth/signin')
      router.refresh()
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="grid gap-6">
      <header className="rounded-[36px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.9)] p-5 shadow-[0_26px_58px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="grid gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#0f766e]">{t('dashboard.title')}</span>
            <h1 className="font-display text-[32px] font-bold leading-none tracking-[-0.05em] text-[#1f2937] sm:text-[42px]">{summary?.planName ?? t('dashboard.title')}</h1>
            <p className="max-w-3xl text-[15px] leading-7 text-slate-500 sm:text-[17px]">{summary ? t('dashboard.copy') : t('dashboard.empty')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 xl:justify-end">
            <Link href="/help" className="app-button app-button--secondary">{t('dashboard.actions.help')}</Link>
            <button type="button" className="app-button app-button--secondary" onClick={() => void handleLogout()} disabled={isLoggingOut}>{t('dashboard.actions.logout')}</button>
          </div>
        </div>
      </header>

      {error ? <div className="rounded-[30px] border border-amber-200 bg-amber-50/80 p-6 text-amber-900 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.14)] backdrop-blur-2xl"><p className="font-display text-lg font-bold">{error}</p><p className="mt-2 text-sm text-amber-800">{t('dashboard.error')}</p></div> : null}

      {isLoading && !summary ? <div className="rounded-[30px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] p-6 text-slate-500 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl">{t('ui.loading')}</div> : null}

      {!isLoading && !summary ? (
        <div className="grid gap-4 rounded-[30px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] p-6 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl md:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.6fr)]">
          <div className="grid gap-4">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{t('dashboard.empty_title')}</span>
            <h2 className="font-display text-3xl font-bold tracking-tight text-[#1f2937]">{t('dashboard.empty_title')}</h2>
            <p className="max-w-2xl text-[15px] leading-7 text-slate-500">{t('dashboard.empty_copy')}</p>
          </div>
          <div className="grid gap-3 self-start">
            <Link href="/intake" className="app-button app-button--primary">{t('dashboard.start')}</Link>
            <Link href="/help" className="app-button app-button--secondary">{t('dashboard.actions.help')}</Link>
          </div>
        </div>
      ) : null}

      {summary ? (
        <div className="grid gap-4 xl:grid-cols-12">
          <section className="xl:col-span-8 rounded-[30px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] p-6 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="grid gap-3">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{t('dashboard.today_label')}</span>
                <h2 className="font-display text-3xl font-bold tracking-tight text-[#1f2937]">{summary.dateLabel}</h2>
                <p className="max-w-2xl text-[15px] leading-7 text-slate-500">{t('dashboard.plan_label', { name: summary.planName })}</p>
              </div>
              <div className="rounded-[22px] bg-[rgba(255,253,249,0.96)] px-4 py-3 text-right"><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{t('dashboard.progress.title')}</div><div className="mt-1 font-display text-4xl font-bold tracking-tight text-[#1f2937]">{summary.progressPercentage}%</div></div>
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-4">
              <div className="rounded-[20px] bg-[rgba(255,253,249,0.96)] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{t('dashboard.tasks_total')}</div><div className="mt-2 font-display text-2xl font-bold text-[#1f2937]">{summary.tasksTotal}</div></div>
              <div className="rounded-[20px] bg-[rgba(255,253,249,0.96)] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{t('dashboard.tasks_active')}</div><div className="mt-2 font-display text-2xl font-bold text-[#1f2937]">{summary.tasksActive}</div></div>
              <div className="rounded-[20px] bg-[rgba(255,253,249,0.96)] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{t('dashboard.streak_title')}</div><div className="mt-2 font-display text-2xl font-bold text-[#1f2937]">{t('dashboard.streak_current', { count: summary.streak.current })}</div></div>
              <div className="rounded-[20px] bg-[rgba(255,253,249,0.96)] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{t('dashboard.trend.title')}</div><div className="mt-2 font-display text-2xl font-bold text-[#1f2937]">{summary.trend.deltaPercentagePoints === null ? '-' : `${summary.trend.deltaPercentagePoints > 0 ? '+' : ''}${summary.trend.deltaPercentagePoints} pts`}</div><div className="mt-1 text-xs text-slate-500">{getTrendCopy(summary.trend.direction)}</div></div>
            </div>
          </section>

          <section className="xl:col-span-4 rounded-[30px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] p-6 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{t('dashboard.focus.title')}</span><h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#334155]">{getFocusCopy(summary)}</h3></div><div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#A7F3D0]/25 text-[#334155]"><MaterialIcon name="timer" className="text-[24px]" /></div></div>
            <div className="mt-6 rounded-[24px] bg-[rgba(255,253,249,0.96)] p-5"><div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{summary.focus.title ?? t('dashboard.focus.no_events')}</div><div className="mt-2 font-display text-4xl font-bold tracking-tight text-[#1f2937]">{formatCountdown(summary.focus.remainingMinutes)}</div><p className="mt-2 text-sm leading-6 text-slate-500">{summary.focus.status === 'no_events' ? t('dashboard.focus.no_schedule_copy') : summary.focus.targetAt ? summary.focus.status === 'in_event' ? t('dashboard.focus.ends_at', { time: DateTime.fromISO(summary.focus.targetAt).toFormat('HH:mm') }) : summary.focus.status === 'after_last_event' ? t('dashboard.focus.after_time', { time: DateTime.fromISO(summary.focus.targetAt).toFormat('HH:mm') }) : t('dashboard.focus.next_time', { time: DateTime.fromISO(summary.focus.targetAt).toFormat('HH:mm') }) : t('dashboard.focus.no_schedule_copy')}</p></div>
            <div className="mt-4"><Link href="/help" className="inline-flex items-center gap-2 text-sm font-bold text-[#334155] transition hover:text-[#1E293B]"><MaterialIcon name="help" className="text-[18px]" />{t('dashboard.help.cta')}</Link></div>
          </section>

          <section className="xl:col-span-7 rounded-[30px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] p-6 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{t('dashboard.schedule.title')}</span><h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#334155]">{t('dashboard.schedule.today')}</h3></div><span className="rounded-full bg-[#FAFAF9] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{summary.schedule.events.length}</span></div>
            <div className="mt-6 space-y-4">{summary.schedule.isEmpty ? <p className="text-sm leading-6 text-slate-500">{t('dashboard.schedule.empty')}</p> : summary.schedule.events.map((event) => <article key={`${event.startAt}-${event.title}`} className="rounded-[22px] bg-[#FAFAF9] p-4"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><h4 className="truncate font-display text-[17px] font-bold text-[#334155]">{event.title}</h4><p className="mt-1 text-sm text-slate-500">{formatTimeRange(event.startAt, event.endAt)}</p></div><div className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{t('dashboard.schedule.duration', { count: event.durationMin })}</div></div></article>)}</div>
          </section>

          <section className="xl:col-span-5 rounded-[30px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] p-6 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{t('dashboard.tasks.title')}</span><h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#334155]">{t('dashboard.tasks.today')}</h3></div><span className="rounded-full bg-[#FAFAF9] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{t('dashboard.tasks.total_short', { count: summary.tasksTotal })}</span></div>
            <div className="mt-6 space-y-3">{summary.tasks.length === 0 ? <p className="text-sm leading-6 text-slate-500">{t('dashboard.tasks.empty')}</p> : summary.tasks.map((task) => <button key={task.id} type="button" onClick={() => void handleToggleTask(task.id)} className={`flex w-full items-center gap-4 rounded-[20px] border p-4 text-left transition ${task.completado ? 'border-[#A7F3D0]/30 bg-[#A7F3D0]/10' : 'border-transparent bg-[#FAFAF9] hover:border-slate-200'}`} disabled={busyTaskId === task.id}><div className={`flex h-6 w-6 items-center justify-center rounded-md border-2 ${task.completado ? 'border-[#1E293B] bg-[#1E293B] text-white' : 'border-slate-300'}`}><MaterialIcon name="check" className={`text-[14px] ${task.completado ? 'text-white' : 'text-transparent'}`} /></div><div className="min-w-0 flex-1"><div className={`font-display text-[16px] font-semibold text-[#334155] ${task.completado ? 'line-through opacity-50' : ''}`}>{task.descripcion}</div></div><MaterialIcon name={task.completado ? 'verified' : 'drag_indicator'} className="text-[18px] text-slate-300" /></button>)}</div>
          </section>

          <section className="xl:col-span-7 rounded-[30px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] p-6 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{t('dashboard.week.title')}</span><h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#334155]">{t('dashboard.week.summary')}</h3></div><span className="rounded-full bg-[#FAFAF9] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{getTrendCopy(summary.trend.direction)}</span></div>
            <div className="mt-6 grid grid-cols-7 gap-2">{summary.week.days.map((day) => <div key={day.date} className={`rounded-[18px] border p-3 text-center ${day.isToday ? 'border-slate-300 bg-[#FAFAF9]' : 'border-slate-100 bg-[#FAFAF9]/40'}`}><div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{day.weekdayLabel}</div><div className="mt-3 flex h-24 items-end"><div className="h-full w-full rounded-full bg-slate-100"><div className={`w-full rounded-full ${day.percentage >= 80 ? 'bg-[#A7F3D0]' : day.percentage > 0 ? 'bg-[#E9D5FF]' : 'bg-slate-200'}`} style={{ height: `${Math.max(8, day.percentage)}%` }} /></div></div><div className="mt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{day.percentage}%</div></div>)}</div>
          </section>

          <section className="xl:col-span-5 rounded-[30px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] p-6 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl">
            <div><span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{t('dashboard.help.title')}</span><h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#334155]">{t('dashboard.help.copy')}</h3><p className="mt-3 text-sm leading-6 text-slate-500">{t('dashboard.help.detail')}</p></div>
            <div className="mt-6 grid gap-3"><Link href="/help" className="app-button app-button--primary">{t('dashboard.help.cta')}</Link><Link href="/intake" className="app-button app-button--secondary">{t('dashboard.actions.flow')}</Link></div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
