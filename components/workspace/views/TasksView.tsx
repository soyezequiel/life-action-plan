'use client'

import React from 'react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { MaterialIcon } from '@/components/midnight-mint/MaterialIcon'
import { browserLapClient } from '@/src/lib/client/browser-http-client'
import { t } from '@/src/i18n'
import type { ProgressRow } from '@/src/shared/types/lap-api'

import type { TasksViewProps } from '../types'

export default function TasksView({ initialTasks }: TasksViewProps) {
  const [tasks, setTasks] = useState<ProgressRow[]>(initialTasks ?? [])
  const [loading, setLoading] = useState(initialTasks === undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (initialTasks !== undefined) {
      setLoading(false)
      return
    }

    browserLapClient.profile.latest()
      .then((profileId) => {
        if (!profileId) {
          setLoading(false)
          return null
        }

        return browserLapClient.plan.list(profileId).then((plans) => {
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
      })
      .catch(() => setLoading(false))
  }, [initialTasks])

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

  return (
    <div className="mx-auto w-full max-w-[1360px]">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-8">
          <header>
            <h1 className="font-display text-[32px] font-bold tracking-tight text-[#334155]">
              {t('mockups.flow.tasks.title')}
            </h1>
            <p className="mt-3 max-w-3xl text-[16px] leading-7 text-slate-500">
              {t('mockups.flow.tasks.copy')}
            </p>
          </header>

          <section className="rounded-[24px] bg-white p-8 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1E293B] text-white">
                  <MaterialIcon name="flash_on" className="text-[20px]" />
                </div>
                <h2 className="font-display text-[18px] font-bold text-[#334155]">
                  {t('mockups.flow.tasks.priority_title')}
                </h2>
              </div>
              <MaterialIcon name="filter_list" className="text-[18px] text-slate-400" />
            </div>

            <div className="space-y-4">
              {loading ? <p className="text-slate-400">{t('ui.loading')}</p> : null}

              {!loading && tasks.length === 0 ? (
                <p className="text-slate-400">{t('dashboard.tasks.empty')}</p>
              ) : null}

              {!loading ? tasks.slice(0, 5).map((task, index) => (
                <article key={task.id} className="rounded-[22px] bg-white p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.22em]">
                    <div className="flex gap-2">
                      {index === 0 ? (
                        <span className="rounded-full bg-[#FCA5A5]/20 px-2 py-1 text-[#EF4444]">
                          {t('mockups.flow.tasks.urgent')}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-500">
                          {t('mockups.flow.tasks.important')}
                        </span>
                      )}
                    </div>
                    <span className="text-slate-400">{task.completado ? '100%' : '0%'}</span>
                  </div>

                  <h3 className="mt-3 text-[18px] font-semibold text-[#334155]">{task.descripcion}</h3>

                  <div className="mt-5 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[13px] text-slate-400">
                      <MaterialIcon name="schedule" className="text-[16px]" />
                      <span>{t('mockups.flow.tasks.task_1_meta')}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleToggle(task.id)}
                      disabled={togglingId === task.id}
                      className={`inline-flex h-11 items-center gap-2 rounded-full px-4 text-[11px] font-bold uppercase tracking-[0.22em] text-white transition ${
                        task.completado ? 'bg-[#166534]' : 'bg-[#1E293B]'
                      } ${togglingId === task.id ? 'opacity-50' : ''}`}
                    >
                      {task.completado ? 'Completado' : t('mockups.flow.tasks.begin')}
                    </button>
                  </div>
                </article>
              )) : null}
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-center gap-3">
              <MaterialIcon name="waves" className="text-[20px] text-[#A7F3D0]" />
              <h2 className="font-display text-[22px] font-bold text-[#334155]">
                {t('mockups.flow.tasks.fluid_title')}
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                [t('mockups.flow.tasks.fluid_1_title'), t('mockups.flow.tasks.fluid_1_tag')],
                [t('mockups.flow.tasks.fluid_2_title'), t('mockups.flow.tasks.fluid_2_tag')]
              ].map(([title, tag]) => (
                <article key={title} className="rounded-[18px] bg-white p-4 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                  <p className="text-[15px] font-semibold text-[#334155]">{title}</p>
                  <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                    {tag}
                  </span>
                </article>
              ))}
              <article className="rounded-[18px] bg-white p-4 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] md:col-span-2">
                <div className="flex items-center gap-2 text-slate-500">
                  <MaterialIcon name="check_circle" className="text-[18px] text-[#A7F3D0]" />
                  <span className="line-through">{t('mockups.flow.tasks.fluid_done')}</span>
                </div>
              </article>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-[24px] bg-[#1E293B] p-6 text-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#A7F3D0]/20 text-[#A7F3D0]">
                  <MaterialIcon name="explore" className="text-[18px]" />
                </div>
                <h2 className="font-display text-[18px] font-bold">{t('mockups.flow.tasks.explore_title')}</h2>
              </div>
              <span className="rounded-full bg-[#334155] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-300">75%</span>
            </div>
            <p className="text-[14px] leading-7 text-slate-300">{t('mockups.flow.tasks.explore_copy')}</p>
            <div className="mt-6 space-y-4">
              {[
                [t('mockups.flow.tasks.explore_1'), '35%'],
                [t('mockups.flow.tasks.explore_2'), '12%'],
                [t('mockups.flow.tasks.explore_3'), '65%']
              ].map(([label, percent]) => (
                <div key={label}>
                  <div className="mb-2 flex items-center justify-between text-[13px] text-slate-300">
                    <span>{label}</span>
                    <span>{percent}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-[#A7F3D0]" style={{ width: percent }} />
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => router.push('/flow?variant=spatial')}
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-[16px] border border-white/10 text-[11px] font-bold uppercase tracking-[0.22em] text-white transition hover:bg-white/5"
            >
              {t('mockups.flow.tasks.library')}
            </button>
          </section>

          <section className="rounded-[22px] bg-white p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
              {t('mockups.flow.tasks.wisdom_title')}
            </h3>
            <p className="mt-3 text-[14px] leading-7 italic text-slate-500">
              {t('mockups.flow.tasks.wisdom_copy')}
            </p>
          </section>

          <section className="overflow-hidden rounded-[24px] bg-[#0F172A] p-0 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <div className="relative min-h-[170px] overflow-hidden rounded-[24px]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.25),transparent_45%),linear-gradient(135deg,#0F172A,#1E293B)]" />
              <div className="relative flex min-h-[170px] flex-col justify-end p-5 text-white">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-300">
                  {t('mockups.flow.tasks.next_milestone_label')}
                </p>
                <h3 className="mt-2 text-[18px] font-semibold leading-7">
                  {t('mockups.flow.tasks.next_milestone_title')}
                </h3>
              </div>
              <button
                type="button"
                className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#1E293B] text-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]"
              >
                <MaterialIcon name="add" className="text-[18px]" />
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
