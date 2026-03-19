import { useState, useEffect } from 'react'
import type { JSX } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import IntakeExpress from './components/IntakeExpress'
import Dashboard from './components/Dashboard'
import DebugPanel from './components/DebugPanel'
import { useLapClient } from './app-services'
import { t } from '../../i18n'
import type { PlanBuildProgress } from '../../shared/types/ipc'

type AppView = 'dashboard' | 'intake' | 'building' | 'plan' | 'apikey'
type BuildStage = PlanBuildProgress['stage']

const viewTransition = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as const
}

const buildStages: BuildStage[] = ['preparing', 'generating', 'validating', 'saving']

function App(): JSX.Element {
  const client = useLapClient()
  const [view, setView] = useState<AppView>('dashboard')
  const [profileId, setProfileId] = useState<string | null>(null)
  const [plan, setPlan] = useState<{ nombre: string; resumen: string } | null>(null)
  const [buildError, setBuildError] = useState('')
  const [pendingProvider, setPendingProvider] = useState<'openai' | 'ollama' | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [debugPanelVisible, setDebugPanelVisible] = useState(false)
  const [buildProgress, setBuildProgress] = useState<PlanBuildProgress | null>(null)

  useEffect(() => {
    async function init(): Promise<void> {
      try {
        const [id, debugStatus] = await Promise.all([
          client.profile.latest().catch(() => null),
          client.debug.status().catch(() => ({ enabled: false, panelVisible: false }))
        ])

        if (id) setProfileId(id)

        setDebugPanelVisible(debugStatus.panelVisible)
      } finally {
        setLoading(false)
      }
    }

    void init()
  }, [client])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isToggleShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'd'

      if (!isToggleShortcut) {
        return
      }

      event.preventDefault()
      setDebugPanelVisible((current) => {
        return !current
      })
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    return client.plan.onBuildProgress((progress) => {
      if (!profileId || progress.profileId !== profileId) {
        return
      }

      setBuildProgress(progress)
    })
  }, [client, profileId])

  function handleIntakeComplete(id: string): void {
    setProfileId(id)
    setView('dashboard')
  }

  function handleBuildPlan(provider: 'openai' | 'ollama'): void {
    if (!profileId) return

    if (provider === 'openai') {
      setPendingProvider('openai')
      setView('apikey')
      return
    }

    void runBuildPlan('ollama', '')
  }

  async function runBuildPlan(provider: 'openai' | 'ollama', key: string): Promise<void> {
    if (!profileId) return
    const modelId = provider === 'ollama' ? 'ollama:qwen3:8b' : 'openai:gpt-4o-mini'

    setBuildProgress({
      profileId,
      provider: modelId,
      stage: 'preparing',
      current: 1,
      total: buildStages.length,
      charCount: 0
    })
    setView('building')
    setBuildError('')

    try {
      const result = await client.plan.build(profileId, key, modelId)

      if (result.success) {
        setBuildProgress(null)
        setPlan({ nombre: result.nombre!, resumen: result.resumen! })
        setView('plan')
      } else {
        setBuildProgress(null)
        setBuildError(result.error || t('errors.generic'))
        setView('dashboard')
      }
    } catch {
      setBuildProgress(null)
      setBuildError(t('errors.connection_busy'))
      setView('dashboard')
    }
  }

  let activeViewKey = 'landing'
  let activeView: JSX.Element
  const activeBuildProgress = buildProgress ?? {
    profileId: profileId ?? '',
    provider: pendingProvider === 'ollama' ? 'ollama:qwen3:8b' : 'openai:gpt-4o-mini',
    stage: 'preparing' as BuildStage,
    current: 1,
    total: buildStages.length,
    charCount: 0
  }

  if (loading) {
    activeViewKey = 'loading'
    activeView = (
      <div id="app" className="app-shell app-shell--centered">
        <div className="app-screen app-screen--card app-screen--loading">
          <p className="app-status">{t('ui.loading')}</p>
        </div>
      </div>
    )
  } else if (view === 'intake') {
    activeViewKey = 'intake'
    activeView = <IntakeExpress onComplete={handleIntakeComplete} />
  } else if (view === 'apikey') {
    activeViewKey = 'apikey'
    activeView = (
      <div id="app" className="app-shell app-shell--centered">
        <div className="app-screen app-screen--card app-screen--compact">
          <h2 className="app-title app-title--section">{t('settings.apikey_title')}</h2>
          <p className="app-copy">{t('settings.apikey_hint')}</p>
          <input
            className="app-input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t('settings.apikey_placeholder')}
            autoFocus
          />
          <div className="app-actions">
            <button
              className="app-button app-button--primary"
              onClick={() => {
                if (!apiKey.trim()) return
                void runBuildPlan(pendingProvider!, apiKey.trim())
                setApiKey('')
              }}
              disabled={!apiKey.trim()}
            >
              {t('settings.apikey_confirm')}
            </button>
            <button
              className="app-button app-button--secondary"
              onClick={() => {
                setView('dashboard')
                setApiKey('')
              }}
            >
              {t('ui.cancel')}
            </button>
          </div>
        </div>
      </div>
    )
  } else if (view === 'building') {
    activeViewKey = 'building'
    activeView = (
      <div id="app" className="app-shell app-shell--centered">
        <div className="app-screen app-screen--card app-screen--loading app-screen--build" aria-live="polite">
          <div className="build-progress">
            <p className="app-status app-status--eyebrow">
              {t('builder.progress_current', {
                current: activeBuildProgress.current,
                total: activeBuildProgress.total
              })}
            </p>
            <h2 className="app-title app-title--section build-progress__title">
              {t('builder.progress_title')}
            </h2>
            <p className="app-copy build-progress__copy">
              {t(`builder.progress_steps.${activeBuildProgress.stage}`)}
            </p>
            <div
              className="build-progress__track"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={activeBuildProgress.total}
              aria-valuenow={activeBuildProgress.current}
              aria-valuetext={t(`builder.progress_steps.${activeBuildProgress.stage}`)}
            >
              <div
                className="build-progress__fill"
                style={{ width: `${(activeBuildProgress.current / activeBuildProgress.total) * 100}%` }}
              />
            </div>
            <div className="build-progress__steps">
              {buildStages.map((stage, index) => {
                const stepNumber = index + 1
                const state = activeBuildProgress.current > stepNumber
                  ? 'done'
                  : activeBuildProgress.current === stepNumber
                    ? 'current'
                    : 'upcoming'

                return (
                  <div key={stage} className={`build-progress__step build-progress__step--${state}`}>
                    <span className="build-progress__step-index">{stepNumber}</span>
                    <span className="build-progress__step-label">{t(`builder.progress_steps.${stage}`)}</span>
                  </div>
                )
              })}
            </div>
            {activeBuildProgress.charCount > 0 && (
              <p className="app-status app-status--busy build-progress__meta">
                {t('builder.progress_chars', { count: activeBuildProgress.charCount })}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  } else if (view === 'plan' && plan) {
    activeViewKey = 'plan'
    activeView = (
      <div id="app" className="app-shell app-shell--centered">
        <div className="app-screen app-screen--card app-screen--plan">
          <h1 className="app-title">{plan.nombre}</h1>
          <p className="app-copy">{plan.resumen}</p>
          <div className="app-actions">
            <button className="app-button app-button--secondary" onClick={() => setView('dashboard')}>
              {t('ui.close')}
            </button>
          </div>
        </div>
      </div>
    )
  } else if (profileId) {
    activeViewKey = 'dashboard'
    activeView = (
      <Dashboard
        profileId={profileId}
        onStartIntake={() => setView('intake')}
        onBuildPlan={handleBuildPlan}
        buildError={buildError}
      />
    )
  } else {
    activeViewKey = 'landing'
    activeView = (
      <div id="app" className="app-shell app-shell--centered">
        <div className="app-screen app-screen--card app-screen--hero">
          <h1 className="app-title">{t('app.name')}</h1>
          <p className="app-subtitle">{t('app.tagline')}</p>
          <p className="app-copy">{t('dashboard.empty')}</p>
          <div className="app-actions">
            <button className="app-button app-button--primary" onClick={() => setView('intake')}>
              {t('dashboard.start')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
      <>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeViewKey}
            className="view-layer"
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.99 }}
            transition={viewTransition}
          >
            {activeView}
          </motion.div>
        </AnimatePresence>

        <AnimatePresence>
          {debugPanelVisible && (
            <DebugPanel
              onClose={() => {
                setDebugPanelVisible(false)
              }}
            />
          )}
        </AnimatePresence>
      </>
    </MotionConfig>
  )
}

export default App
