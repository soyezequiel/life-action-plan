'use client'

import React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { MaterialIcon } from '@/components/midnight-mint/MaterialIcon'
import { browserLapClient } from '@/src/lib/client/browser-http-client'
import { useUserStatusContext } from '@/src/lib/client/UserStatusProvider'
import { t } from '@/src/i18n'
import type { ProgressRow } from '@/src/shared/types/lap-api'

import type { TasksViewProps } from '../types'

export default function TasksView({ initialTasks }: TasksViewProps) {
  const [tasks, setTasks] = useState<ProgressRow[]>(initialTasks ?? [])
  const [loading, setLoading] = useState(initialTasks === undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const router = useRouter()
  const { latestProfileId } = useUserStatusContext()

  useEffect(() => {
    if (initialTasks !== undefined) {
      setLoading(false)
      return
    }

    if (!latestProfileId) {
      setLoading(false)
      return
    }

    browserLapClient.plan.list(latestProfileId)
      .then((plans) => {
        const activePlan = plans[0]

        if (!activePlan) {
          setLoading(false)
          return null
        }

        return browserLapClient.progress.list(activePlan.id).then((progressRows) => {
          setTasks(progressRows)
          setLoading(false)
        })
      })
      .catch(() => setLoading(false))
  }, [initialTasks, latestProfileId])

  const handleToggle = async (taskId: string) => {
    if (togglingId) {
      return
    }

    setTogglingId(taskId)

    try {
      const result = await browserLapClient.progress.toggle(taskId)

      if (result.success) {
        setTasks((previous) => previous.map((task) => (
          task.id === taskId ? { ...task, completado: result.completado } : task
        )))
      }
    } catch (error) {
      console.error('Failed to toggle task', error)
    } finally {
      setTogglingId(null)
    }
  }

  const completedCount = useMemo(() => tasks.filter((task) => task.completado).length, [tasks])
  const pendingCount = tasks.length - completedCount

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-6">
          <header>
            <p className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
              {t('tasks.kicker')}
            </p>
            <h1 className="mt-2 font-display text-[32px] font-bold tracking-tight text-[#1f2937]">
              {t('tasks.title')}
            </h1>
            <p className="mt-3 max-w-3xl text-[16px] leading-7 text-slate-500">
              {t('tasks.copy')}
            </p>
          </header>

          <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-[22px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.92)] px-5 py-4 shadow-[0_20px_40px_-24px_rgba(17,24,39,0.16)] backdrop-blur-2xl">
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{t('tasks.summary.total')}</span>
              <p className="mt-2 font-display text-[26px] font-bold text-[#1f2937]">{tasks.length}</p>
            </article>
            <article className="rounded-[22px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.92)] px-5 py-4 shadow-[0_20px_40px_-24px_rgba(17,24,39,0.16)] backdrop-blur-2xl">
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{t('tasks.summary.pending')}</span>
              <p className="mt-2 font-display text-[26px] font-bold text-[#1f2937]">{pendingCount}</p>
            </article>
            <article className="rounded-[22px] border border-[rgba(15,118,110,0.12)] bg-[rgba(15,118,110,0.08)] px-5 py-4 shadow-[0_20px_40px_-24px_rgba(17,24,39,0.16)] backdrop-blur-2xl">
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{t('tasks.summary.completed')}</span>
              <p className="mt-2 font-display text-[26px] font-bold text-[#0f766e]">{completedCount}</p>
            </article>
          </div>

          <section className="rounded-[30px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] p-6 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1f2937] text-white">
                  <MaterialIcon name="check_circle" className="text-[20px]" />
                </div>
                <h2 className="font-display text-[20px] font-bold text-[#334155]">{t('tasks.list_title')}</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {t('tasks.summary.total_count', { count: tasks.length })}
              </span>
            </div>

            <div className="space-y-4">
              {loading ? <p className="text-slate-400">{t('ui.loading')}</p> : null}

              {!loading && tasks.length === 0 ? (
                <p className="text-slate-400">{t('dashboard.tasks.empty')}</p>
              ) : null}

              {!loading ? tasks.map((task, index) => (
                <article key={task.id} className="rounded-[22px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.96)] p-5 shadow-[0_20px_40px_-24px_rgba(17,24,39,0.16)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${
                        index === 0 && !task.completado
                          ? 'bg-[#FCA5A5]/20 text-[#EF4444]'
                          : task.completado
                            ? 'bg-[#A7F3D0]/30 text-[#166534]'
                            : 'bg-slate-100 text-slate-500'
                      }`}>
                        {task.completado
                          ? t('tasks.status.completed')
                          : index === 0
                            ? t('tasks.status.next')
                            : t('tasks.status.pending')}
                      </span>
                      <span className="text-[12px] text-slate-400">{task.fecha}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleToggle(task.id)}
                      disabled={togglingId === task.id}
                      className={`inline-flex h-11 items-center gap-2 rounded-full px-4 text-[11px] font-bold uppercase tracking-[0.22em] text-white transition ${
                        task.completado ? 'bg-[#166534]' : 'bg-[#1f2937]'
                      } ${togglingId === task.id ? 'opacity-50' : ''}`}
                    >
                      {task.completado ? t('tasks.action_reopen') : t('tasks.action_complete')}
                    </button>
                  </div>

                  <h3 className={`mt-4 text-[18px] font-semibold text-[#1f2937] ${task.completado ? 'line-through opacity-60' : ''}`}>
                    {task.descripcion}
                  </h3>
                </article>
              )) : null}
            </div>
          </section>
        </section>

        <aside className="space-y-6">
          <section className="rounded-[30px] border border-[rgba(31,41,55,0.08)] bg-[#1f2937] p-6 text-white shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)]">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-[#A7F3D0]">
                <MaterialIcon name="explore" className="text-[18px]" />
              </div>
              <h2 className="font-display text-[18px] font-bold">{t('tasks.side_title')}</h2>
            </div>
            <p className="text-[14px] leading-7 text-slate-300">{t('tasks.side_copy')}</p>
            <button
              type="button"
              onClick={() => router.push('/intake')}
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-[16px] border border-white/10 text-[11px] font-bold uppercase tracking-[0.22em] text-white transition hover:bg-white/5"
            >
              {t('tasks.side_cta')}
            </button>
          </section>

          <section className="rounded-[22px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.92)] p-5 shadow-[0_20px_40px_-24px_rgba(17,24,39,0.16)] backdrop-blur-2xl">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{t('tasks.note_title')}</h3>
            <p className="mt-3 text-[14px] leading-7 italic text-slate-500">{t('tasks.note_copy')}</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
