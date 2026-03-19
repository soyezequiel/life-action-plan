import { useState, useEffect, useCallback } from 'react'
import { t } from '../../../i18n'
import { DateTime } from 'luxon'
import type { ProgressRow, PlanRow } from '../../../shared/types/ipc'

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

function parseMeta(notas: string | null): TaskMeta {
  if (!notas) return {}
  try {
    return JSON.parse(notas)
  } catch {
    return {}
  }
}

function Dashboard({ profileId, onStartIntake, onBuildPlan, buildError }: DashboardProps): JSX.Element {
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [tasks, setTasks] = useState<ProgressRow[]>([])
  const [loading, setLoading] = useState(true)
  const [nombre, setNombre] = useState('')

  const today = DateTime.now().toISODate()!

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // Load profile name
      const profile = await window.api.profile.get(profileId)
      if (profile) {
        setNombre(profile.participantes[0]?.datosPersonales?.nombre || '')
      }

      // Load plans
      const planList = await window.api.plan.list(profileId)
      setPlans(planList)

      // Load today's tasks for the most recent plan
      if (planList.length > 0) {
        const latestPlan = planList[planList.length - 1]
        const progressList = await window.api.progress.list(latestPlan.id, today)
        setTasks(progressList)
      }
    } finally {
      setLoading(false)
    }
  }, [profileId, today])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleToggle(taskId: string): Promise<void> {
    const result = await window.api.progress.toggle(taskId)
    if (result.success) {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, completado: result.completado } : t))
      )
    }
  }

  if (loading) {
    return (
      <div id="app">
        <p>{t('ui.loading')}</p>
      </div>
    )
  }

  const doneCount = tasks.filter((t) => t.completado).length
  const hasPlan = plans.length > 0
  const latestPlan = hasPlan ? plans[plans.length - 1] : null

  return (
    <div id="app">
      <h1>{nombre ? t('dashboard.greeting', { nombre }) : t('app.name')}</h1>
      <h2>{t('dashboard.title')}</h2>

      {!hasPlan ? (
        <div>
          <p>{t('dashboard.empty')}</p>
          <button onClick={() => onBuildPlan('openai')}>{t('dashboard.build_openai')}</button>
          {' '}
          <button onClick={() => onBuildPlan('ollama')}>{t('dashboard.build_ollama')}</button>
          {buildError && <p style={{ color: '#c47a20' }}>{buildError}</p>}
        </div>
      ) : (
        <div>
          <p>{t('dashboard.plan_name', { nombre: latestPlan!.nombre })}</p>

          {tasks.length === 0 ? (
            <p>{t('dashboard.no_tasks_today')}</p>
          ) : (
            <>
              <p>
                {doneCount === tasks.length
                  ? t('dashboard.all_done')
                  : t('dashboard.done_count', { done: doneCount, total: tasks.length })}
              </p>

              <ul style={{ listStyle: 'none', padding: 0 }}>
                {tasks
                  .sort((a, b) => {
                    const metaA = parseMeta(a.notas)
                    const metaB = parseMeta(b.notas)
                    return (metaA.hora || '').localeCompare(metaB.hora || '')
                  })
                  .map((task) => {
                    const meta = parseMeta(task.notas)
                    const categoria = meta.categoria || 'otro'
                    return (
                      <li
                        key={task.id}
                        style={{
                          padding: '12px',
                          marginBottom: '8px',
                          border: '1px solid #333',
                          borderRadius: '8px',
                          opacity: task.completado ? 0.6 : 1,
                          textDecoration: task.completado ? 'line-through' : 'none'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong>{task.descripcion}</strong>
                            <br />
                            <small>
                              {meta.hora && `${meta.hora} · `}
                              {meta.duracion && t('dashboard.minutes', { min: meta.duracion })}
                              {` · ${t(`dashboard.category.${categoria}`)}`}
                            </small>
                          </div>
                          <button onClick={() => handleToggle(task.id)}>
                            {task.completado ? t('dashboard.undo') : t('dashboard.check_in')}
                          </button>
                        </div>
                      </li>
                    )
                  })}
              </ul>
            </>
          )}

          <hr style={{ margin: '16px 0', border: '1px solid #333' }} />
          <button onClick={() => onBuildPlan('openai')}>{t('dashboard.build_openai')}</button>
          {' '}
          <button onClick={() => onBuildPlan('ollama')}>{t('dashboard.build_ollama')}</button>
          {buildError && <p style={{ color: '#c47a20' }}>{buildError}</p>}
        </div>
      )}
    </div>
  )
}

export default Dashboard
