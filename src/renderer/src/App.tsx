import { useState } from 'react'
import IntakeExpress from './components/IntakeExpress'

type AppView = 'dashboard' | 'intake' | 'building' | 'plan'

function App(): JSX.Element {
  const [view, setView] = useState<AppView>('dashboard')
  const [profileId, setProfileId] = useState<string | null>(null)
  const [plan, setPlan] = useState<{ nombre: string; resumen: string } | null>(null)
  const [buildError, setBuildError] = useState('')

  function handleIntakeComplete(id: string): void {
    setProfileId(id)
    setView('dashboard')
  }

  async function handleBuildPlan(): Promise<void> {
    if (!profileId) return

    // TODO: Get API key from secure storage (electron.safeStorage)
    // For hackathon, prompt user or use env
    const apiKey = prompt('API Key de OpenAI:') || ''
    if (!apiKey) return

    setView('building')
    setBuildError('')

    try {
      const result = await window.api.plan.build(profileId, apiKey)
      if (result.success) {
        setPlan({ nombre: result.nombre!, resumen: result.resumen! })
        setView('plan')
      } else {
        setBuildError(result.error || 'Error')
        setView('dashboard')
      }
    } catch {
      setBuildError('Error de conexión')
      setView('dashboard')
    }
  }

  if (view === 'intake') {
    return <IntakeExpress onComplete={handleIntakeComplete} />
  }

  if (view === 'building') {
    return (
      <div id="app">
        <p>Armando tu plan personalizado...</p>
      </div>
    )
  }

  if (view === 'plan' && plan) {
    return (
      <div id="app">
        <h1>{plan.nombre}</h1>
        <p>{plan.resumen}</p>
        <button onClick={() => setView('dashboard')}>Volver</button>
      </div>
    )
  }

  // Dashboard
  return (
    <div id="app">
      <h1>LAP</h1>

      {!profileId ? (
        <div>
          <p>Todavía no tenés un plan armado.</p>
          <button onClick={() => setView('intake')}>Crear mi plan</button>
        </div>
      ) : (
        <div>
          <p>Perfil listo.</p>
          <button onClick={handleBuildPlan}>Armar mi plan</button>
          {buildError && <p style={{ color: '#c47a20' }}>{buildError}</p>}
        </div>
      )}
    </div>
  )
}

export default App
