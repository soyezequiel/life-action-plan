'use client'

import { useState } from 'react'
import { motion, MotionConfig } from 'framer-motion'
import { t } from '@/src/i18n'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
import { MockupShell } from '../midnight-mint/MockupShell'
import { browserLapClient } from '@/src/lib/client/browser-http-client'
import { logPlanificadorDebug } from '@/src/lib/client/debug-logger'
import { PipelineVisualizer } from '../pipeline-visualizer/PipelineVisualizer'
import { usePipelineState } from '../pipeline-visualizer/use-pipeline-state'

interface IntakeMockupProps {
  onComplete?: (profileId: string) => void
  onCancel?: () => void
}

export default function IntakeMockup({ onComplete, onCancel }: IntakeMockupProps) {
  const [value, setValue] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const { state: pState, callbacks: pCallbacks, reset: pReset } = usePipelineState()

  // Clarification states
  const [clarification, setClarification] = useState<import('@/src/lib/pipeline/v6/types').ClarificationRound | null>(null)
  const [sessionId, setSessionId] = useState<string>('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [isResuming, setIsResuming] = useState(false)

  const handleComplete = async () => {
    if (!value.trim() || isGenerating) return
    setIsGenerating(true)
    
    try {
      const intakeRes = await browserLapClient.intake.save({
        nombre: 'Usuario',
        edad: 30,
        ubicacion: 'Local',
        ocupacion: 'Profesional',
        objetivo: value
      })

      if (intakeRes.profileId) {
        const { startPlanBuild } = await import('@/src/lib/client/plan-client')
        pReset()

        await startPlanBuild(value, intakeRes.profileId, 'codex', {
          ...pCallbacks,
          onNeedsInput: (sid: string, questions: import('@/src/lib/pipeline/v6/types').ClarificationRound) => { 
            setSessionId(sid)
            setClarification(questions)
            setIsGenerating(false) // pause generation while waiting input
            pCallbacks.onNeedsInput(sid, questions)
          },
          onComplete: (planId: string, score: number, iterations: number) => { 
            pCallbacks.onComplete(planId, score, iterations)
            onComplete?.(planId || intakeRes.profileId!) 
          },
          onError: (msg: string) => { 
            pCallbacks.onError(msg)
            setIsGenerating(false) 
          }
        })
      }
    } catch {
      setIsGenerating(false)
    }
  }

  const handleResume = async () => {
    if (!sessionId || isResuming) return
    setIsResuming(true)
    setClarification(null)
    setIsGenerating(true)

    try {
      const { resumePlanBuild } = await import('@/src/lib/client/plan-client')
      await resumePlanBuild(sessionId, answers, {
        ...pCallbacks,
        onNeedsInput: (sid, questions) => {
          setSessionId(sid)
          setClarification(questions)
          setIsGenerating(false)
          setIsResuming(false)
          pCallbacks.onNeedsInput(sid, questions)
        },
        onComplete: (planId: string, score: number, iterations: number) => { 
          pCallbacks.onComplete(planId, score, iterations)
          onComplete?.(planId) 
        },
        onError: (msg: string) => { 
          pCallbacks.onError(msg)
          setIsGenerating(false)
          setIsResuming(false) 
        }
      })
    } catch {
      setIsGenerating(false)
      setIsResuming(false)
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <MockupShell
        sidebarLabel={t('mockups.common.santuario_digital')}
        sidebarNav={[
          { label: t('mockups.intake.nav.goals'), icon: 'target', active: true, href: '/intake' },
          { label: t('mockups.intake.nav.spatial'), icon: 'dashboard_customize', href: '/flow?variant=spatial' },
          { label: t('mockups.intake.nav.refinement'), icon: 'tune', href: '/flow' },
          { label: t('mockups.intake.nav.costs'), icon: 'analytics', href: '/flow?variant=simulation' },
          { label: t('mockups.intake.nav.balances'), icon: 'scale', href: '/plan?view=week' }
        ]}
        sidebarPrimaryAction={{ label: t('mockups.common.new_flow'), icon: 'add', href: '/flow' }}
        sidebarFooter={[{ label: t('mockups.common.help'), icon: 'help', href: '#' }]}
        topTabs={[
          { label: t('mockups.intake.top_tabs.flow'), active: true, href: '/flow' },
          { label: t('mockups.intake.top_tabs.canvas'), href: '/flow?variant=spatial' },
          { label: t('mockups.intake.top_tabs.analysis'), href: '/flow?variant=simulation' },
          { label: t('mockups.intake.top_tabs.archive'), href: '/plan?view=month' }
        ]}
        topRight={(
          <>
            <button type="button" className="text-slate-500 transition hover:text-slate-700">
              <MaterialIcon name="notifications" className="text-[20px]" />
            </button>
            <button type="button" className="text-slate-500 transition hover:text-slate-700">
              <MaterialIcon name="account_circle" className="text-[20px]" />
            </button>
          </>
        )}
        contentClassName="px-0"
      >
        <div className="mx-auto flex w-full max-w-[980px] flex-col items-center px-8 pt-10">
          <div className="mb-6 text-center">
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.32em] text-slate-400">
              {t('mockups.intake.eyebrow')}
            </p>
            <h1 className="mt-4 font-display text-[32px] font-bold tracking-tight text-[#334155]">
              {t('mockups.intake.title')}
            </h1>
          </div>

          <motion.section
            className="relative w-full rounded-[24px] bg-white p-6 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] md:p-8"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {clarification ? (
              <div className="space-y-6">
                <div className="rounded-[18px] bg-indigo-50/50 p-6 border border-indigo-100/50">
                  <h3 className="font-display text-[18px] font-bold text-[#334155] mb-2">{t('flow.clarify.title') || 'Necesitamos aclarar algunas cosas'}</h3>
                  <p className="text-[14px] leading-6 text-slate-500 mb-6">{t('flow.clarify.copy') || 'El modelo identificó algunos puntos ambiguos en tu objetivo.'}</p>
                  
                  <div className="space-y-5">
                    {clarification.questions.map((q) => (
                      <div key={q.id} className="space-y-2">
                        <label className="block text-[14px] font-medium text-slate-700">{q.text}</label>
                        <input
                          type="text"
                          value={answers[q.id] || ''}
                          onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                          className="w-full rounded-[14px] border border-slate-200 bg-[#FAFAF9] px-4 py-3 text-[14px] text-slate-700 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                          placeholder="Tu respuesta..."
                        />
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleResume}
                    disabled={isResuming || clarification.questions.some((q) => !answers[q.id]?.trim())}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-[16px] bg-[#1E293B] px-6 font-display text-[14px] font-bold text-white transition hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    <span>{isResuming ? 'Reanudando...' : (t('flow.actions.continue') || 'Continuar')}</span>
                    <MaterialIcon name="arrow_forward" className="text-[18px]" />
                  </button>
                </div>
              </div>
            ) : isGenerating ? (
              <div className="py-2">
                <PipelineVisualizer state={pState} />
              </div>
            ) : (
              <>
                <textarea
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={t('mockups.intake.placeholder')}
                  disabled={isGenerating}
                  className="min-h-[210px] w-full resize-none rounded-[20px] border border-transparent bg-[#FAFAF9] p-6 text-[24px] leading-[1.45] text-slate-500 outline-none placeholder:text-slate-400 focus:border-[#1E293B]/10 focus:bg-white focus:text-[#334155] disabled:opacity-50"
                />
                <div className="absolute bottom-6 right-6 flex items-center gap-2">
                  <span className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                    {t('mockups.intake.submit_hint')}
                  </span>
                  <button
                    type="button"
                    onClick={handleComplete}
                    disabled={isGenerating || !value.trim()}
                    className={`flex h-12 w-12 items-center justify-center rounded-full text-white transition hover:-translate-y-0.5 ${isGenerating ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#1E293B]'}`}
                    aria-label={t('mockups.intake.continue')}
                  >
                    {isGenerating ? <MaterialIcon name="hourglass_empty" className="text-[20px] animate-spin" /> : <MaterialIcon name="arrow_forward" className="text-[20px]" />}
                  </button>
                </div>
              </>
            )}
          </motion.section>

          <div className="mt-12 flex w-full items-center justify-between">
            <h2 className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
              {t('mockups.intake.recent')}
            </h2>
            <span className="text-[12px] text-slate-400">{t('mockups.intake.pending')}</span>
          </div>

          <div className="mt-4 grid w-full grid-cols-1 gap-4 md:grid-cols-2">
            <article className="rounded-[22px] bg-white p-6 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E9D5FF]/30 text-[#7C3AED]">
                  <MaterialIcon name="rocket_launch" className="text-[18px]" />
                </div>
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                  {isGenerating ? currentPhase : t('mockups.intake.card_1_time')}
                </div>
              </div>
              <span className="font-display text-[15px] font-bold text-[#334155]">{isGenerating ? lastAction || 'Construyendo modelo...' : t('mockups.intake.card_1_title')}</span>
              <div className="mt-5 inline-flex rounded-full bg-[#A7F3D0]/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#166534]">
                {isGenerating ? `${progressScore}% Completado` : t('mockups.intake.card_1_tag')}
              </div>
            </article>

            <article className="rounded-[22px] bg-white p-6 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#A7F3D0]/30 text-[#059669]">
                  <MaterialIcon name="eco" className="text-[18px]" />
                </div>
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                  {t('mockups.intake.card_2_time')}
                </div>
              </div>
              <p className="text-[15px] leading-7 text-[#334155]">{t('mockups.intake.card_2_title')}</p>
              <div className="mt-5 inline-flex rounded-full bg-[#E9D5FF]/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#7C3AED]">
                {t('mockups.intake.card_2_tag')}
              </div>
            </article>
          </div>

          <button
            type="button"
            onClick={handleComplete}
            disabled={isGenerating || !value.trim()}
            className={`mt-10 inline-flex h-14 items-center justify-center gap-2 rounded-[18px] px-7 font-display text-[14px] font-bold text-white transition hover:-translate-y-0.5 ${isGenerating || !value.trim() ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#1E293B]'}`}
          >
            <span>{t('mockups.intake.continue')}</span>
            <MaterialIcon name="arrow_forward" className="text-[18px]" />
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="mt-4 text-[12px] italic text-slate-400 transition hover:text-[#334155]"
          >
            {t('mockups.intake.help')}
          </button>

          <div className="mt-16 flex w-full items-center justify-center">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-slate-300">
              <MaterialIcon name="edit_note" className="text-[14px]" />
              <span>{t('mockups.intake.draft')}</span>
              <span className="normal-case tracking-normal text-slate-400">{t('mockups.intake.draft_copy')}</span>
              <MaterialIcon name="arrow_forward" className="text-[14px]" />
            </div>
          </div>
        </div>
      </MockupShell>
    </MotionConfig>
  )
}
