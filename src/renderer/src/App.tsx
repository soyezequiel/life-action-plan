import { useState, useEffect } from 'react'
import type { JSX } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import IntakeExpress from './components/IntakeExpress'
import Dashboard from './components/Dashboard'
import DebugPanel from './components/DebugPanel'
import { useLapClient } from './app-services'
import { t } from '../../i18n'

type AppView = 'dashboard' | 'intake' | 'building' | 'plan' | 'apikey'

const viewTransition = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as const
}

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

    setView('building')
    setBuildError('')

    try {
      const result = await client.plan.build(profileId, key, modelId)

      if (result.success) {
        setPlan({ nombre: result.nombre!, resumen: result.resumen! })
        setView('plan')
      } else {
        setBuildError(result.error || t('errors.generic'))
        setView('dashboard')
      }
    } catch {
      setBuildError(t('errors.connection_busy'))
      setView('dashboard')
    }
  }

  let activeViewKey = 'landing'
  let activeView: JSX.Element

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
        <div className="app-screen app-screen--card app-screen--loading">
          <p className="app-status app-status--busy">{t('builder.generating')}</p>
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
