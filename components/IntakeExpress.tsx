'use client'

import React, { useState } from 'react'
import type { JSX } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { t } from '../src/i18n'
import { useLapClient } from '../src/lib/client/app-services'
import { toUserFacingErrorMessage } from '../src/lib/client/error-utils'

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

export default function IntakeExpress({ onComplete }: IntakeExpressProps): JSX.Element {
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
  const progressId = `${inputId}-progress`
  const hintId = `${inputId}-hint`
  const nextLabel = saving
    ? t('intake.saving')
    : isLast
      ? t('intake.buttons.finish')
      : t('intake.buttons.next')
  const progressValue = ((step + 1) / QUESTIONS.length) * 100

  function handleChange(nextValue: string): void {
    if (error) {
      setError('')
    }

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
        edad: Number.parseInt(answers.edad, 10) || 25,
        ubicacion: answers.ubicacion,
        ocupacion: answers.ocupacion,
        objetivo: answers.objetivo
      })

      if (result.success) {
        onComplete(result.profileId)
      } else {
        setError(result.error || t('intake.error'))
      }
    } catch (error) {
      setError(toUserFacingErrorMessage(error, 'intake.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-component="intake-express" className="intake-shell">
      <form
        className="intake-card"
        onSubmit={(event) => {
          event.preventDefault()
          void handleNext()
        }}
      >
        <div className="intake-header">
          <p className="intake-kicker">{t('intake.title')}</p>
          <p className="intake-copy">{t('intake.subtitle')}</p>
          <p id={progressId} className="intake-progress">{t('intake.progress', { current: step + 1, total: QUESTIONS.length })}</p>
          <div
            className="intake-progressbar"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={QUESTIONS.length}
            aria-valuenow={step + 1}
            aria-valuetext={t('intake.progress', { current: step + 1, total: QUESTIONS.length })}
          >
            <span className="intake-progressbar__fill" style={{ width: `${progressValue}%` }} />
          </div>
          <div className="intake-progressdots" aria-hidden="true">
            {QUESTIONS.map((question, index) => (
              <span
                key={question.key}
                className={[
                  'intake-progressdots__dot',
                  index === step ? 'intake-progressdots__dot--current' : '',
                  index < step ? 'intake-progressdots__dot--done' : ''
                ].join(' ')}
              />
            ))}
          </div>
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
                onChange={(event) => handleChange(event.target.value)}
                placeholder={t(`intake.placeholders.${current.key}`)}
                aria-describedby={`${progressId} ${hintId}`}
                rows={4}
                autoFocus
              />
            ) : (
              <input
                id={inputId}
                className="intake-control"
                type={current.type}
                value={value}
                onChange={(event) => handleChange(event.target.value)}
                placeholder={t(`intake.placeholders.${current.key}`)}
                aria-describedby={`${progressId} ${hintId}`}
                inputMode={current.type === 'number' ? 'numeric' : undefined}
                min={current.type === 'number' ? 1 : undefined}
                max={current.type === 'number' ? 120 : undefined}
                autoFocus
              />
            )}
            <p id={hintId} className="intake-step__hint">
              {isLast ? t('intake.tip_finish') : t('intake.tip_enter')}
            </p>
          </motion.div>
        </AnimatePresence>

        {error && <p className="status-message status-message--warning" role="status" aria-live="polite">{error}</p>}

        <div className="intake-actions">
          {step > 0 && (
            <button className="app-button app-button--secondary intake-button" type="button" onClick={handleBack} disabled={saving}>
              {t('intake.buttons.back')}
            </button>
          )}
          <button
            className="app-button app-button--primary intake-button intake-button--next"
            type="submit"
            disabled={saving || !value.trim()}
          >
            {nextLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
