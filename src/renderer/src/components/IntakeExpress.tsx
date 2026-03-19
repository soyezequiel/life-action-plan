import { useState } from 'react'
import { t } from '../../../i18n'

interface IntakeExpressProps {
  onComplete: (profileId: string) => void
}

const QUESTIONS = [
  { key: 'nombre', type: 'text' },
  { key: 'edad', type: 'number' },
  { key: 'ubicacion', type: 'text' },
  { key: 'ocupacion', type: 'text' },
  { key: 'objetivo', type: 'textarea' }
] as const

type QuestionKey = (typeof QUESTIONS)[number]['key']

function IntakeExpress({ onComplete }: IntakeExpressProps): JSX.Element {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<QuestionKey, string>>({
    nombre: '',
    edad: '',
    ubicacion: '',
    ocupacion: '',
    objetivo: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const current = QUESTIONS[step]
  const isLast = step === QUESTIONS.length - 1

  function handleChange(value: string): void {
    setAnswers((prev) => ({ ...prev, [current.key]: value }))
  }

  function handleBack(): void {
    if (step > 0) setStep(step - 1)
  }

  async function handleNext(): Promise<void> {
    if (!isLast) {
      setStep(step + 1)
      return
    }

    // Save to DB via IPC
    setSaving(true)
    setError('')

    try {
      const result = await window.api.intake.save({
        nombre: answers.nombre,
        edad: parseInt(answers.edad) || 25,
        ubicacion: answers.ubicacion,
        ocupacion: answers.ocupacion,
        objetivo: answers.objetivo
      })

      if (result.success) {
        onComplete(result.profileId)
      } else {
        setError(result.error || 'Error guardando perfil')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  const value = answers[current.key]

  return (
    <div data-component="intake-express">
      <p>{step + 1} / {QUESTIONS.length}</p>
      <label>{t(`intake.questions.${current.key}`)}</label>

      {current.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          rows={3}
          autoFocus
        />
      ) : (
        <input
          type={current.type}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          autoFocus
        />
      )}

      {error && <p style={{ color: '#c47a20' }}>{error}</p>}

      <div>
        {step > 0 && (
          <button onClick={handleBack} disabled={saving}>
            ←
          </button>
        )}
        <button onClick={handleNext} disabled={saving || !value.trim()}>
          {saving ? '...' : isLast ? '✓' : '→'}
        </button>
      </div>
    </div>
  )
}

export default IntakeExpress
