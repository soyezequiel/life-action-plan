import { useState } from 'react'
import type { JSX } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { t } from '../../../i18n'
import { useLapClient } from '../app-services'

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

const stepTransition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as const
}

function IntakeExpress({ onComplete }: IntakeExpressProps): JSX.Element {
  const client = useLapClient()
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
  const value = answers[current.key]
  const inputId = `intake-${current.key}`
  const nextLabel = saving
    ? t('intake.saving')
    : isLast
      ? t('intake.buttons.finish')
      : t('intake.buttons.next')

  function handleChange(nextValue: string): void {
    setAnswers((prev) => ({ ...prev, [current.key]: nextValue }))
  }

  function handleBack(): void {
    if (step > 0) setStep(step - 1)
  }

  async function handleNext(): Promise<void> {
    if (!isLast) {
      setStep(step + 1)
      return
    }

    setSaving(true)
    setError('')

    try {
      const result = await client.intake.save({
        nombre: answers.nombre,
        edad: parseInt(answers.edad) || 25,
        ubicacion: answers.ubicacion,
        ocupacion: answers.ocupacion,
        objetivo: answers.objetivo
      })

      if (result.success) {
        onComplete(result.profileId)
      } else {
        setError(result.error || t('intake.error'))
      }
    } catch {
      setError(t('errors.connection_busy'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-component="intake-express" className="intake-shell">
      <div className="intake-card">
        <div className="intake-header">
          <p className="intake-kicker">{t('intake.title')}</p>
          <p className="intake-copy">{t('intake.subtitle')}</p>
          <p className="intake-progress">{t('intake.progress', { current: step + 1, total: QUESTIONS.length })}</p>
        </div>

        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={current.key}
            className="intake-step"
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.985 }}
            transition={stepTransition}
          >
            <label className="intake-label" htmlFor={inputId}>
              {t(`intake.questions.${current.key}`)}
            </label>

            {current.type === 'textarea' ? (
              <textarea
                id={inputId}
                className="intake-control intake-control--textarea"
                value={value}
                onChange={(e) => handleChange(e.target.value)}
                placeholder={t(`intake.placeholders.${current.key}`)}
                rows={4}
                autoFocus
              />
            ) : (
              <input
                id={inputId}
                className="intake-control"
                type={current.type}
                value={value}
                onChange={(e) => handleChange(e.target.value)}
                placeholder={t(`intake.placeholders.${current.key}`)}
                autoFocus
              />
            )}
          </motion.div>
        </AnimatePresence>

        {error && <p className="status-message status-message--warning">{error}</p>}

        <div className="intake-actions">
          {step > 0 && (
            <button className="app-button app-button--secondary intake-button" onClick={handleBack} disabled={saving}>
              {t('intake.buttons.back')}
            </button>
          )}
          <button
            className="app-button app-button--primary intake-button intake-button--next"
            onClick={() => {
              void handleNext()
            }}
            disabled={saving || !value.trim()}
          >
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default IntakeExpress
