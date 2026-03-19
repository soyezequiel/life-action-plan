import { useState, useEffect } from 'react'
import IntakeExpress from './components/IntakeExpress'
import Dashboard from './components/Dashboard'
import { t } from '../../i18n'

type AppView = 'dashboard' | 'intake' | 'building' | 'plan' | 'apikey'

function App(): JSX.Element {
  const [view, setView] = useState<AppView>('dashboard')
  const [profileId, setProfileId] = useState<string | null>(null)
  const [plan, setPlan] = useState<{ nombre: string; resumen: string } | null>(null)
  const [buildError, setBuildError] = useState('')
  const [pendingProvider, setPendingProvider] = useState<'openai' | 'ollama' | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(true)

  // Restore session on mount
  useEffect(() => {
    window.api.profile.latest().then((id) => {
      if (id) setProfileId(id)
    }).finally(() => setLoading(false))
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
    } else {
      runBuildPlan('ollama', '')
    }
  }

  async function runBuildPlan(provider: 'openai' | 'ollama', key: string): Promise<void> {
    if (!profileId) return
    const modelId = provider === 'ollama' ? 'ollama:qwen3:8b' : 'openai:gpt-4o-mini'

    setView('building')
    setBuildError('')

    try {
      const result = await window.api.plan.build(profileId, key, modelId)
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

  if (loading) {
    return (
      <div id="app">
        <p>{t('ui.loading')}</p>
      </div>
    )
  }

  if (view === 'intake') {
    return <IntakeExpress onComplete={handleIntakeComplete} />
  }

  if (view === 'apikey') {
    return (
      <div id="app">
        <h2>{t('settings.apikey_title')}</h2>
        <p>{t('settings.apikey_hint')}</p>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={t('settings.apikey_placeholder')}
          autoFocus
        />
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => {
              if (!apiKey.trim()) return
              runBuildPlan(pendingProvider!, apiKey.trim())
              setApiKey('')
            }}
            disabled={!apiKey.trim()}
          >
            {t('settings.apikey_confirm')}
          </button>
          {' '}
          <button onClick={() => { setView('dashboard'); setApiKey('') }}>
            {t('ui.cancel')}
          </button>
        </div>
      </div>
    )
  }

  if (view === 'building') {
    return (
      <div id="app">
        <p>{t('builder.generating')}</p>
      </div>
    )
  }

  if (view === 'plan' && plan) {
    return (
      <div id="app">
        <h1>{plan.nombre}</h1>
        <p>{plan.resumen}</p>
        <button onClick={() => setView('dashboard')}>{t('ui.close')}</button>
      </div>
    )
  }

  if (profileId) {
    return (
      <Dashboard
        profileId={profileId}
        onStartIntake={() => setView('intake')}
        onBuildPlan={handleBuildPlan}
        buildError={buildError}
      />
    )
  }

  return (
    <div id="app">
      <h1>{t('app.name')}</h1>
      <p>{t('app.tagline')}</p>
      <p>{t('dashboard.empty')}</p>
      <button onClick={() => setView('intake')}>{t('dashboard.start')}</button>
    </div>
  )
}

export default App
