import { useState, useEffect, useCallback } from 'react'
import type { JSX } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { t } from '../../../i18n'
import { DateTime } from 'luxon'
import type { ProgressRow, PlanRow, StreakResult } from '../../../shared/types/ipc'

interface DashboardProps {
  profileId: string
  onStartIntake: () => void
  onBuildPlan: (provider: 'openai' | 'ollama') => void
  buildError: string
}

interface TaskMeta {
  hora?: string
  duracion?: number
  categoria?: string
}

const cardTransition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as const
}

function parseMeta(notas: string | null): TaskMeta {
  if (!notas) return {}

  try {
    return JSON.parse(notas)
  } catch {
    return {}
  }
}

function Dashboard({
  profileId,
  onStartIntake: _onStartIntake,
  onBuildPlan,
  buildError
}: DashboardProps): JSX.Element {
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [tasks, setTasks] = useState<ProgressRow[]>([])
  const [streak, setStreak] = useState<StreakResult>({ current: 0, best: 0 })
  const [loading, setLoading] = useState(true)
  const [nombre, setNombre] = useState('')

  const today = DateTime.now().toISODate()!

  const loadData = useCallback(async () => {
    setLoading(true)

    try {
      const profile = await window.api.profile.get(profileId)
      if (profile) {
        setNombre(profile.participantes[0]?.datosPersonales?.nombre || '')
      }

      const planList = await window.api.plan.list(profileId)
      setPlans(planList)

      if (planList.length > 0) {
        const latestPlan = planList[planList.length - 1]
        const [progressList, streakResult] = await Promise.all([
          window.api.progress.list(latestPlan.id, today),
          window.api.streak.get(latestPlan.id)
        ])
        setTasks(progressList)
        setStreak(streakResult)
      } else {
        setTasks([])
        setStreak({ current: 0, best: 0 })
      }
    } finally {
      setLoading(false)
    }
  }, [profileId, today])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function handleToggle(taskId: string): Promise<void> {
    const toggledTask = tasks.find((task) => task.id === taskId)
    const result = await window.api.progress.toggle(taskId)
    if (result.success) {
      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? { ...task, completado: result.completado } : task))
      )

      if (toggledTask?.tipo === 'habito') {
        const nextStreak = await window.api.streak.get(toggledTask.planId)
        setStreak(nextStreak)
      }
    }
  }

  if (loading) {
    return (
      <div id="app" className="app-shell app-shell--centered">
        <div className="dashboard-layout dashboard-layout--loading">
          <p className="app-status">{t('ui.loading')}</p>
        </div>
      </div>
    )
  }

  const doneCount = tasks.filter((task) => task.completado).length
  const hasPlan = plans.length > 0
  const latestPlan = hasPlan ? plans[plans.length - 1] : null
  const progressMessage = doneCount === tasks.length
    ? t('dashboard.all_done')
    : t('dashboard.done_count', { done: doneCount, total: tasks.length })
  const sortedTasks = [...tasks].sort((a, b) => {
    const metaA = parseMeta(a.notas)
    const metaB = parseMeta(b.notas)
    return (metaA.hora || '').localeCompare(metaB.hora || '')
  })

  return (
    <div id="app" className="app-shell dashboard-shell">
      <div className="dashboard-layout">
        <header className="dashboard-header">
          <h1 className="dashboard-greeting">{nombre ? t('dashboard.greeting', { nombre }) : t('app.name')}</h1>
          <h2 className="dashboard-title">{t('dashboard.title')}</h2>
        </header>

        {!hasPlan ? (
          <section className="dashboard-panel dashboard-panel--empty">
            <p className="dashboard-copy">{t('dashboard.empty')}</p>
            <div className="dashboard-actions">
              <button className="app-button app-button--primary" onClick={() => onBuildPlan('openai')}>
                {t('dashboard.build_openai')}
              </button>
              <button className="app-button app-button--secondary" onClick={() => onBuildPlan('ollama')}>
                {t('dashboard.build_ollama')}
              </button>
            </div>
            {buildError && <p className="status-message status-message--warning">{buildError}</p>}
          </section>
        ) : (
          <section className="dashboard-panel">
            <p className="dashboard-plan-name">{t('dashboard.plan_name', { nombre: latestPlan!.nombre })}</p>
            <div className="dashboard-summary-grid">
              <div className="dashboard-streak">
                <span className="dashboard-streak__label">{t('dashboard.streak_title')}</span>
                <strong className="dashboard-streak__value">
                  {streak.current > 0
                    ? t('dashboard.streak_current', { count: streak.current })
                    : t('dashboard.streak_empty')}
                </strong>
                {streak.best > 0 && (
                  <span className="dashboard-streak__best">
                    {t('dashboard.streak_best', { count: streak.best })}
                  </span>
                )}
              </div>
            </div>

            {tasks.length === 0 ? (
              <p className="dashboard-copy">{t('dashboard.no_tasks_today')}</p>
            ) : (
              <>
                <p className="dashboard-progress">
                  <AnimatePresence initial={false} mode="wait">
                    <motion.span
                      key={`${doneCount}-${tasks.length}`}
                      className="dashboard-progress-value"
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.98 }}
                      transition={cardTransition}
                    >
                      {progressMessage}
                    </motion.span>
                  </AnimatePresence>
                </p>

                <motion.ul layout className="task-list">
                  {sortedTasks.map((task) => {
                    const meta = parseMeta(task.notas)
                    const categoria = meta.categoria || 'otro'
                    const cardClassName = [
                      'task-card',
                      `task-card--${categoria}`,
                      task.completado ? 'task-card--completed' : ''
                    ].filter(Boolean).join(' ')
                    const toggleClassName = [
                      'app-button',
                      'task-toggle',
                      task.completado ? 'app-button--secondary' : 'app-button--primary'
                    ].join(' ')

                    return (
                      <motion.li
                        key={task.id}
                        layout
                        className={cardClassName}
                        initial={{ opacity: 0, y: 16, scale: 0.985 }}
                        animate={{ opacity: task.completado ? 0.76 : 1, y: 0, scale: 1 }}
                        transition={cardTransition}
                      >
                        <div className="task-card__row">
                          <div className="task-card__text">
                            <strong className="task-card__title">{task.descripcion}</strong>
                            <small className="task-card__meta">
                              {meta.hora && `${meta.hora} · `}
                              {meta.duracion && t('dashboard.minutes', { min: meta.duracion })}
                              {` · ${t(`dashboard.category.${categoria}`)}`}
                            </small>
                          </div>

                          <AnimatePresence initial={false} mode="wait">
                            <motion.button
                              key={`${task.id}-${task.completado ? 'done' : 'todo'}`}
                              layout
                              className={toggleClassName}
                              onClick={() => {
                                void handleToggle(task.id)
                              }}
                              initial={{ opacity: 0.55, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.86 }}
                              transition={cardTransition}
                              whileTap={{ scale: 0.96 }}
                            >
                              {task.completado ? t('dashboard.undo') : t('dashboard.check_in')}
                            </motion.button>
                          </AnimatePresence>
                        </div>
                      </motion.li>
                    )
                  })}
                </motion.ul>
              </>
            )}

            <hr className="dashboard-divider" />
            <div className="dashboard-actions">
              <button className="app-button app-button--primary" onClick={() => onBuildPlan('openai')}>
                {t('dashboard.build_openai')}
              </button>
              <button className="app-button app-button--secondary" onClick={() => onBuildPlan('ollama')}>
                {t('dashboard.build_ollama')}
              </button>
            </div>
            {buildError && <p className="status-message status-message--warning">{buildError}</p>}
          </section>
        )}
      </div>
    </div>
  )
}

export default Dashboard
