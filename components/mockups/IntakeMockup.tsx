'use client'

import { useState } from 'react'
import { motion, MotionConfig, AnimatePresence } from 'framer-motion'
import { t } from '@/src/i18n'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
import { MockupShell } from '../midnight-mint/MockupShell'
import { browserLapClient } from '@/src/lib/client/browser-http-client'
import { logPlanificadorDebug } from '@/src/lib/client/debug-logger'
import { PipelineVisualizer } from '../pipeline-visualizer/PipelineVisualizer'
import { AdvancedFlowVisualizer } from '../pipeline-visualizer/AdvancedFlowVisualizer'
import { usePipelineState } from '../pipeline-visualizer/use-pipeline-state'
import { SuccessPaymentAnimation } from '../midnight-mint/SuccessPaymentAnimation'
import { fetchWalletStatus, chargePlanBuild } from '@/src/lib/client/plan-client'

interface IntakeMockupProps {
  onComplete?: (profileId: string, planId: string) => void
  onCancel?: () => void
}

export default function IntakeMockup({ onComplete, onCancel }: IntakeMockupProps) {
  const [value, setValue] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [viewMode, setViewMode] = useState<'standard' | 'advanced'>('standard')
  const { state: pState, callbacks: pCallbacks, reset: pReset } = usePipelineState()

  // Clarification states
  const [clarification, setClarification] = useState<import('@/src/lib/pipeline/v6/types').ClarificationRound | null>(null)
  const [sessionId, setSessionId] = useState<string>('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [isResuming, setIsResuming] = useState(false)
  const [isCompletedLocal, setIsCompletedLocal] = useState(false)
  const [completionData, setCompletionData] = useState<{ planId: string, score: number, iterations: number } | null>(null)
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null)
  
  // Payment states
  const [isCheckingCost, setIsCheckingCost] = useState(false)
  const [showPaymentQuote, setShowPaymentQuote] = useState(false)
  const [isPaying, setIsPaying] = useState(false)
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false)
  const [walletStatus, setWalletStatus] = useState<any>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [pendingGoal, setPendingGoal] = useState<string | null>(null)

  const handleComplete = async (arg?: string | any) => {
    const overrideValue = typeof arg === 'string' ? arg : undefined
    const goalToProcess = overrideValue || value
    if (!goalToProcess || typeof goalToProcess !== 'string' || !goalToProcess.trim() || isGenerating || isCheckingCost) return
    
    setIsCheckingCost(true)
    setPendingGoal(goalToProcess.trim())
    
    try {
      // 1. Obtener estado de billetera y costo estimado
      const status = await fetchWalletStatus()
      setWalletStatus(status)
      setIsCheckingCost(false)
      
      // Si el costo es gratuito o no aplicable (ej. local), saltamos el quote
      if (!status.planBuildChargeSats || status.planBuildChargeSats <= 0) {
        processGeneration(goalToProcess.trim())
        return
      }

      setShowPaymentQuote(true)
    } catch {
      setIsCheckingCost(false)
      // Si falla la verificación de billetera, intentamos procesar de todas formas
      processGeneration(goalToProcess.trim())
    }
  }

  const handleConfirmPayment = async () => {
    if (!activeProfileId && !pendingGoal) return
    setIsPaying(true)
    setPaymentError(null)

    try {
       // Primero aseguramos que tenemos un perfil (intake)
       let profileId = activeProfileId
       if (!profileId) {
         const intakeRes = await browserLapClient.intake.save({
            nombre: 'Usuario',
            edad: 30,
            ubicacion: 'Local',
            ocupacion: 'Profesional',
            objetivo: pendingGoal!,
         })
         profileId = intakeRes.profileId
         setActiveProfileId(profileId)
       }

       // Realizar cobro real
       const chargeRes = await chargePlanBuild(profileId!)
       
       if (chargeRes.success) {
         setShowPaymentQuote(false)
         setShowSuccessAnimation(true)
       } else {
         setPaymentError(chargeRes.error || 'No se pudo procesar el pago.')
         setIsPaying(false)
       }
    } catch (err) {
      setPaymentError('Error de red al procesar el pago.')
      setIsPaying(false)
    }
  }

  const processGeneration = async (targetValue: string) => {
    setIsGenerating(true)
    setShowPaymentQuote(false)
    
    try {
      const intakeRes = await browserLapClient.intake.save({
        nombre: 'Usuario',
        edad: 30,
        ubicacion: 'Local',
        ocupacion: 'Profesional',
        objetivo: targetValue,
      })

      if (intakeRes.profileId) {
        const { startPlanBuild } = await import('@/src/lib/client/plan-client')
        pReset()
        setActiveProfileId(intakeRes.profileId)

        await startPlanBuild(targetValue, intakeRes.profileId, 'codex', {
          ...pCallbacks,
          onNeedsInput: (sid: string, questions: import('@/src/lib/pipeline/v6/types').ClarificationRound) => { 
            setSessionId(sid)
            setClarification(questions)
            setIsGenerating(false)
            pCallbacks.onNeedsInput(sid, questions)
          },
          onComplete: (planId: string, score: number, iterations: number) => { 
            pCallbacks.onComplete(planId, score, iterations)
            setCompletionData({ planId, score, iterations })
            setIsGenerating(false)
            setIsCompletedLocal(true)
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
          setCompletionData({ planId, score, iterations })
          setIsGenerating(false)
          setIsResuming(false)
          setIsCompletedLocal(true)
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
            className="relative w-full rounded-[24px] bg-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] overflow-hidden"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <div className={`p-6 md:p-8 ${showPaymentQuote ? 'bg-slate-50/50' : ''}`}>
            {isCompletedLocal && completionData ? (
              <motion.div 
                className="w-full flex flex-col items-center py-8 text-center"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 shadow-sm border border-emerald-100">
                  <MaterialIcon name="verified" className="text-[40px]" />
                </div>
                
                <h3 className="font-display text-[28px] font-bold tracking-tight text-[#334155] mb-2">
                  ¡Plan Generado con Éxito!
                </h3>
                <p className="text-slate-500 text-[16px] max-w-md mb-10">
                  El modelo ha finalizado la construcción de tu plan con un puntaje de calidad de <strong>{completionData.score}%</strong> tras {completionData.iterations} iteraciones de refinamiento.
                </p>

                <div className="grid grid-cols-3 gap-4 w-full max-w-lg mb-10">
                   <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Calidad</span>
                      <span className="text-xl font-bold text-emerald-600">{completionData.score}%</span>
                   </div>
                   <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Pasos</span>
                      <span className="text-xl font-bold text-slate-700">6+</span>
                   </div>
                   <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Iteraciones</span>
                      <span className="text-xl font-bold text-slate-700">{completionData.iterations}</span>
                   </div>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => onComplete?.(activeProfileId || '', completionData.planId)}
                    className="inline-flex h-14 items-center justify-center gap-3 rounded-[22px] bg-[#1E293B] px-10 font-display text-[15px] font-bold text-white shadow-xl shadow-slate-200 transition hover:-translate-y-1 hover:bg-[#334155] active:translate-y-0"
                  >
                    <span>Ir al Dashboard</span>
                    <MaterialIcon name="dashboard" className="text-[20px]" />
                  </button>
                </div>
              </motion.div>
            ) : showPaymentQuote && walletStatus ? (
              <motion.div
                className="w-full flex flex-col items-center py-6 text-center"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                 <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-[#1E293B] text-emerald-400 shadow-2xl shadow-slate-200 border-4 border-slate-700">
                    <MaterialIcon name="bolt" className="text-[48px]" />
                 </div>

                 <h3 className="font-display text-[26px] font-bold tracking-tight text-[#1E293B] mb-2">
                   Cotización del Plan
                 </h3>
                 <p className="text-slate-500 max-w-sm mb-10 leading-relaxed">
                   Para construir un plan de alta fidelidad con inteligencia artificial premium, se requiere una pequeña provisión de recursos.
                 </p>

                 <div className="w-full max-w-sm space-y-4 mb-10">
                    <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                       <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">Costo</span>
                       <div className="flex items-center gap-2">
                          <span className="text-2xl font-black text-[#1E293B]">{walletStatus.planBuildChargeSats}</span>
                          <span className="text-[14px] font-bold text-emerald-600 uppercase">sats</span>
                       </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 p-5 rounded-2xl border border-transparent bg-slate-100/50">
                       <div className="flex justify-between items-center text-[12px]">
                          <span className="font-bold text-slate-400 uppercase tracking-widest">Tu Billetera</span>
                          <span className="font-bold text-slate-600">{walletStatus.alias || 'Conectada'}</span>
                       </div>
                       <div className="flex justify-between items-center">
                          <span className="text-[11px] font-medium text-slate-500">Balance Disponible</span>
                          <span className="text-[15px] font-bold text-slate-700">{walletStatus.balanceSats?.toLocaleString() || 0} sats</span>
                       </div>
                    </div>

                    {paymentError && (
                      <motion.div 
                        className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-medium"
                        initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                      >
                         <MaterialIcon name="error_outline" className="text-[16px] inline mr-2" />
                         {paymentError}
                      </motion.div>
                    )}
                 </div>

                 <div className="flex flex-col w-full max-w-sm gap-4">
                    <button
                      onClick={handleConfirmPayment}
                      disabled={isPaying || (walletStatus.balanceSats < walletStatus.planBuildChargeSats)}
                      className={`inline-flex h-16 items-center justify-center gap-3 rounded-[24px] font-display text-[16px] font-extrabold text-white shadow-xl transition-all ${isPaying ? 'bg-slate-400' : 'bg-emerald-600 hover:bg-emerald-700 hover:-translate-y-1 active:translate-y-0'} disabled:opacity-50 disabled:grayscale disabled:hover:translate-y-0`}
                    >
                      {isPaying ? (
                        <>
                          <MaterialIcon name="hourglass_empty" className="text-[24px] animate-spin" />
                          <span>Procesando Pago...</span>
                        </>
                      ) : (
                        <>
                          <span>Pagar y Crear Plan</span>
                          <MaterialIcon name="bolt" className="text-[20px]" />
                        </>
                      )}
                    </button>
                    
                    <button
                      onClick={() => setShowPaymentQuote(false)}
                      disabled={isPaying}
                      className="text-[13px] font-bold text-slate-400 hover:text-slate-600 transition"
                    >
                      Cancelar
                    </button>
                 </div>
              </motion.div>
            ) : clarification ? (
              <motion.div 
                className="w-full space-y-8"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4 }}
              >
                <header className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-[#A7F3D0]/30 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#166534]">
                      Ajuste de Objetivo
                    </span>
                    <span className="text-[12px] font-medium text-slate-400">
                      Preguntas de aclaración
                    </span>
                  </div>
                  <h3 className="font-display text-[22px] font-bold tracking-tight text-[#334155]">
                    {t('flow.clarify.title') || 'Necesitamos aclarar algunas cosas'}
                  </h3>
                  <p className="text-[15px] leading-relaxed text-slate-500">
                    {t('flow.clarify.copy') || 'El modelo identificó algunos puntos ambiguos en tu objetivo.'}
                  </p>
                </header>
                
                <div className="space-y-6">
                  {clarification.questions.map((q, idx) => (
                    <motion.div 
                      key={q.id}
                      className="group relative rounded-[22px] border border-slate-100 bg-[#FAFAF9]/50 p-6 transition-all hover:bg-white hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                    >
                      <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#334155] shadow-sm border border-slate-50">
                          <span className="text-[12px] font-bold">{idx + 1}</span>
                        </div>
                        <label className="text-[16px] font-semibold text-[#334155]">{q.text}</label>
                      </div>

                      {q.type === 'select' ? (
                        <div className="relative">
                          <select
                            value={answers[q.id] || ''}
                            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                            className="w-full appearance-none rounded-[16px] border border-slate-200 bg-white px-5 py-4 text-[15px] text-[#334155] outline-none transition focus:border-[#1E293B]/20 focus:ring-2 focus:ring-slate-100"
                          >
                            <option value="">Seleccioná una opción...</option>
                            {q.options?.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                            <MaterialIcon name="expand_more" className="text-[20px]" />
                          </div>
                        </div>
                      ) : q.type === 'range' ? (
                        <div className="space-y-4 px-2 py-2">
                          <input
                            type="range"
                            min={q.min ?? 0}
                            max={q.max ?? 100}
                            step={1}
                            value={answers[q.id] || q.min || 0}
                            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-100 accent-[#1E293B]"
                          />
                          <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            <span>{q.min ?? 0}</span>
                            <span className="text-[14px] text-[#1E293B]">{answers[q.id] || q.min || 0}</span>
                            <span>{q.max ?? 100}</span>
                          </div>
                        </div>
                      ) : (
                        <textarea
                          value={answers[q.id] || ''}
                          onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                          placeholder="Escribí aquí..."
                          className="w-full min-h-[100px] resize-none rounded-[16px] border border-slate-200 bg-white px-5 py-4 text-[15px] text-[#334155] outline-none transition focus:border-[#1E293B]/20 focus:ring-2 focus:ring-slate-100"
                        />
                      )}
                    </motion.div>
                  ))}
                </div>
                
                <div className="flex items-center justify-between border-t border-slate-100 pt-8">
                  <p className="text-[13px] italic text-slate-400">
                    Respondé todo lo que puedas para un plan más preciso.
                  </p>
                  <button
                    type="button"
                    onClick={handleResume}
                    disabled={isResuming || clarification.questions.some((q) => !answers[q.id]?.trim() && q.type !== 'range')}
                    className="inline-flex h-14 items-center justify-center gap-3 rounded-[20px] bg-[#1E293B] px-8 font-display text-[15px] font-bold text-white shadow-lg shadow-slate-200 transition hover:-translate-y-0.5 hover:bg-[#334155] active:translate-y-0 disabled:opacity-30 disabled:grayscale"
                  >
                    <span>{isResuming ? 'Procesando...' : 'Continuar'}</span>
                    <MaterialIcon name="auto_awesome" className="text-[20px]" />
                  </button>
                </div>
              </motion.div>
            ) : isGenerating ? (
              <div className="py-2 space-y-4">
                <div className="flex justify-end pr-2">
                  <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100 shadow-sm">
                    <button
                      onClick={() => setViewMode('standard')}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${viewMode === 'standard' ? 'bg-[#1E293B] text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Estándar
                    </button>
                    <button
                      onClick={() => setViewMode('advanced')}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${viewMode === 'advanced' ? 'bg-[#1E293B] text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Analista
                    </button>
                  </div>
                </div>
                
                <AnimatePresence mode="wait">
                  {viewMode === 'standard' ? (
                    <motion.div
                      key="standard"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      <PipelineVisualizer state={pState} />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="advanced"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                    >
                      <AdvancedFlowVisualizer state={pState} />
                    </motion.div>
                  )}
                </AnimatePresence>
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
                    onClick={() => handleComplete()}
                    disabled={isGenerating || isCheckingCost || !value.trim()}
                    className={`flex h-12 w-12 items-center justify-center rounded-full text-white transition hover:-translate-y-0.5 ${isGenerating || isCheckingCost ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#1E293B]'}`}
                    aria-label={t('mockups.intake.continue')}
                  >
                    {isGenerating || isCheckingCost ? <MaterialIcon name="hourglass_empty" className="text-[20px] animate-spin" /> : <MaterialIcon name="arrow_forward" className="text-[20px]" />}
                  </button>
                </div>
              </>
            )}
            </div>
          </motion.section>

          <div className="mt-12 flex w-full items-center justify-between">
            <h2 className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
              {t('mockups.intake.recent')}
            </h2>
            <span className="text-[12px] text-slate-400">{t('mockups.intake.pending')}</span>
          </div>

          <div className="mt-4 grid w-full grid-cols-1 gap-4 md:grid-cols-2">
            <article 
              onClick={() => {
                setSelectedGoal(t('mockups.intake.card_1_title'))
                handleComplete(t('mockups.intake.card_1_title'))
              }}
              className={`rounded-[22px] bg-white p-6 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] cursor-pointer border-2 transition-all ${selectedGoal === t('mockups.intake.card_1_title') ? 'border-[#1E293B]' : 'border-transparent hover:border-slate-100'}`}
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E9D5FF]/30 text-[#7C3AED]">
                  <MaterialIcon name="rocket_launch" className="text-[18px]" />
                </div>
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                  {isGenerating && selectedGoal === t('mockups.intake.card_1_title') ? pState.currentPhase : t('mockups.intake.card_1_time')}
                </div>
              </div>
              <span className="font-display text-[15px] font-bold text-[#334155]">{isGenerating && selectedGoal === t('mockups.intake.card_1_title') ? pState.lastAction || 'Construyendo modelo...' : t('mockups.intake.card_1_title')}</span>
              <div className="mt-5 inline-flex rounded-full bg-[#A7F3D0]/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#166534]">
                {isGenerating && selectedGoal === t('mockups.intake.card_1_title') ? `${pState.progressScore}% Completado` : t('mockups.intake.card_1_tag')}
              </div>
            </article>

            <article 
              onClick={() => {
                setSelectedGoal(t('mockups.intake.card_2_title'))
                handleComplete(t('mockups.intake.card_2_title'))
              }}
              className={`rounded-[22px] bg-white p-6 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] cursor-pointer border-2 transition-all ${selectedGoal === t('mockups.intake.card_2_title') ? 'border-[#1E293B]' : 'border-transparent hover:border-slate-100'}`}
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#A7F3D0]/30 text-[#059669]">
                  <MaterialIcon name="eco" className="text-[18px]" />
                </div>
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                  {t('mockups.intake.card_2_time')}
                </div>
              </div>
              <p className="text-[15px] leading-7 text-[#334155]">{isGenerating && selectedGoal === t('mockups.intake.card_2_title') ? pState.lastAction || 'Construyendo modelo...' : t('mockups.intake.card_2_title')}</p>
              <div className="mt-5 inline-flex rounded-full bg-[#E9D5FF]/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#7C3AED]">
                {t('mockups.intake.card_2_tag')}
              </div>
            </article>
          </div>

          <button
            type="button"
            onClick={() => handleComplete()}
            disabled={isGenerating || (!value.trim() && !selectedGoal)}
            className={`mt-10 inline-flex h-14 items-center justify-center gap-2 rounded-[18px] px-7 font-display text-[14px] font-bold text-white transition hover:-translate-y-0.5 ${isGenerating || (!value.trim() && !selectedGoal) ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#1E293B]'}`}
          >
            <span>{isGenerating ? 'Generando...' : t('mockups.intake.continue')}</span>
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
        
        {/* Animación Dopamínica de Pago */}
        <SuccessPaymentAnimation 
          show={showSuccessAnimation} 
          onComplete={() => {
            setShowSuccessAnimation(false)
            processGeneration(pendingGoal!)
          }} 
        />
      </MockupShell>
    </MotionConfig>
  )
}
