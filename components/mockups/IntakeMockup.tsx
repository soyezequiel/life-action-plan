'use client'

import { useState, useEffect } from 'react'
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
import { fetchWalletBuildQuote, fetchWalletStatus, chargePlanBuild, startPlanBuild, resumePlanBuild } from '@/src/lib/client/plan-client'
import { useUserStatusContext } from '@/src/lib/client/UserStatusProvider'
import type { ClarificationRound, ClarificationQuestion } from '@/src/lib/pipeline/v6/types'
import { GenerationErrorDetails } from '../flow/GenerationErrorDetails'

interface IntakeMockupProps {
  onComplete?: (profileId: string, planId: string) => void
  onCancel?: () => void
}

export default function IntakeMockup({ onComplete, onCancel }: IntakeMockupProps) {
  const status = useUserStatusContext()
  const [value, setValue] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [viewMode, setViewMode] = useState<'standard' | 'advanced'>('standard')
  const { state: pState, callbacks: pCallbacks, reset: pReset } = usePipelineState()
  const [showPlanReplaceWarning, setShowPlanReplaceWarning] = useState(false)

  // Clarification states
  const [clarification, setClarification] = useState<ClarificationRound | null>(null)
  const [sessionId, setSessionId] = useState<string>('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [isResuming, setIsResuming] = useState(false)
  const [isCompletedLocal, setIsCompletedLocal] = useState(false)
  const [completionData, setCompletionData] = useState<{ planId: string, score: number, iterations: number } | null>(null)
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
  
  // Payment states
  const [isCheckingCost, setIsCheckingCost] = useState(false)
  const [showPaymentQuote, setShowPaymentQuote] = useState(false)
  const [isPaying, setIsPaying] = useState(false)
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false)
  const [walletStatus, setWalletStatus] = useState<any>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [pendingGoal, setPendingGoal] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [debugData, setDebugData] = useState<any>(null)

  // Rehidratar perfil existente al montar para evitar duplicación
  useEffect(() => {
    browserLapClient.profile.latest().then(lpId => {
      if (lpId) {
        setActiveProfileId(lpId)
        logPlanificadorDebug(`[Intake] Perfil rehidratado: ${lpId}`)
      }
    })
  }, [])

  const handleComplete = async (arg?: string | any, confirmed = false) => {
    const overrideValue = typeof arg === 'string' ? arg : undefined
    const goalToProcess = overrideValue || value
    if (!goalToProcess || typeof goalToProcess !== 'string' || !goalToProcess.trim() || isGenerating || isCheckingCost) return
    
    // Si ya existe un plan y el usuario no ha confirmado el reemplazo, mostrar advertencia
    if (status.hasPlan && !confirmed) {
      setPendingGoal(goalToProcess.trim())
      setShowPlanReplaceWarning(true)
      return
    }

    setIsCheckingCost(true)
    setPendingGoal(goalToProcess.trim())
    setShowPlanReplaceWarning(false)
    
    try {
      // 1. Obtener estado de billetera y costo estimado por separado para no pagar
      // logica de billing cada vez que otra pantalla solo pide "status".
      const [statusRes, quoteRes] = await Promise.all([
        fetchWalletStatus(),
        fetchWalletBuildQuote()
      ])
      setWalletStatus({ ...statusRes, ...quoteRes })
      setIsCheckingCost(false)
      
      // Si el costo es gratuito o no aplicable (ej. local), saltamos el quote
      if (!quoteRes.planBuildChargeSats || quoteRes.planBuildChargeSats <= 0) {
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
         logPlanificadorDebug('[Intake] No hay profileId activo, guardando nuevo intake...')
         const intakeRes = await browserLapClient.intake.save({
            nombre: 'Usuario',
            edad: 30,
            ubicacion: 'Local',
            ocupacion: 'Profesional',
            objetivo: pendingGoal!,
         })
         profileId = intakeRes.profileId
         setActiveProfileId(profileId)
         logPlanificadorDebug(`[Intake] Nuevo perfil creado: ${profileId}`)
       }

       // Realizar cobro real
       logPlanificadorDebug(`[Intake] Iniciando cobro para perfil: ${profileId}`)
       const chargeRes = await chargePlanBuild(profileId!)
       
       setIsPaying(false) // Liberamos el botón independientemente del resultado

       if (chargeRes.success) {
         logPlanificadorDebug('[Intake] Cobro exitoso, mostrando animación...')
         setShowPaymentQuote(false)
         setShowSuccessAnimation(true)
       } else {
         logPlanificadorDebug(`[Intake] Error en el cobro: ${chargeRes.error}`)
         setPaymentError(chargeRes.error || 'No se pudo procesar el pago.')
       }
    } catch (err) {
      setPaymentError('Error de red al procesar el pago.')
      setIsPaying(false)
    }
  }

  const processGeneration = async (targetValue: string, forcedProfileId?: string) => {
    setIsGenerating(true)
    setShowPaymentQuote(false)
    setGenerationError(null)
    setDebugData(null)
    
    try {
      // Reutilizar profileId si ya lo tenemos
      let profileId = forcedProfileId || activeProfileId
      if (!profileId) {
        logPlanificadorDebug('[Intake] Guardando intake inicial...')
        const intakeRes = await browserLapClient.intake.save({
          nombre: 'Usuario',
          edad: 30,
          ubicacion: 'Local',
          ocupacion: 'Profesional',
          objetivo: targetValue,
        })
        profileId = intakeRes.profileId
        setActiveProfileId(profileId)
      }

      logPlanificadorDebug(`[Intake] Iniciando generación de plan para: ${profileId} con modo 'codex'`)
      pReset()

      await startPlanBuild(targetValue, profileId!, 'codex', {
          ...pCallbacks,
          onNeedsInput: (sid: string, questions: any) => { 
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
          onError: (msg: string, debug?: any) => { 
            logPlanificadorDebug(`[Intake] Error en el stream SSE: ${msg}`)
            pCallbacks.onError(msg)
            setGenerationError(msg)
            setDebugData(debug)
            setIsGenerating(false) 
          }
        })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logPlanificadorDebug(`[Intake] Excepción en processGeneration: ${errorMsg}`)
      setGenerationError(errorMsg)
      setIsGenerating(false)
    }
  }

  const handleResume = async () => {
    if (!sessionId || isResuming) return
    setIsResuming(true)
    setClarification(null)
    setGenerationError(null)
    setIsGenerating(true)

    try {
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
        onError: (msg: string, debug?: any) => { 
          pCallbacks.onError(msg)
          setGenerationError(msg)
          setDebugData(debug)
          setIsGenerating(false)
          setIsResuming(false) 
        }
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setGenerationError(errorMsg)
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
        contentClassName="px-0"
      >
        <div className="mx-auto flex w-full max-w-[980px] flex-col items-center px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10">
          <div className="mb-5 text-center sm:mb-6">
            <p className="font-display text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400 sm:text-[11px] sm:tracking-[0.32em]">
              {t('mockups.intake.eyebrow')}
            </p>
            <h1 className="mt-3 font-display text-[28px] font-bold tracking-tight text-[#334155] sm:mt-4 sm:text-[32px]">
              {t('mockups.intake.title')}
            </h1>
          </div>

          <motion.section
            className="relative w-full overflow-hidden rounded-[20px] bg-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] sm:rounded-[24px]"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <div className={`p-4 sm:p-6 md:p-8 ${showPaymentQuote ? 'bg-slate-50/50' : ''}`}>
            {showPlanReplaceWarning ? (
              <motion.div
                className="flex w-full flex-col items-center py-4 text-center sm:py-8"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-amber-100 bg-amber-50 text-amber-500 shadow-sm sm:mb-6 sm:h-20 sm:w-20">
                  <MaterialIcon name="warning" className="text-[40px]" />
                </div>
                
                <h3 className="mb-2 font-display text-[24px] font-bold tracking-tight text-[#334155] sm:text-[28px]">
                  ¿Reemplazar plan actual?
                </h3>
                <p className="mb-8 max-w-md text-[15px] leading-relaxed text-slate-500 sm:mb-10 sm:text-[16px]">
                  Ya tienes un plan activo. Al crear uno nuevo, el anterior se archivará y todo su progreso dejará de ser visible en el dashboard.
                </p>

                <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row sm:gap-4">
                  <button
                    onClick={() => handleComplete(pendingGoal, true)}
                    className="flex-1 inline-flex h-14 items-center justify-center gap-3 rounded-[22px] bg-[#1E293B] px-8 font-display text-[15px] font-bold text-white shadow-xl shadow-slate-200 transition hover:-translate-y-1 hover:bg-[#334155] active:translate-y-0"
                  >
                    <span>Continuar y Reemplazar</span>
                    <MaterialIcon name="arrow_forward" className="text-[20px]" />
                  </button>
                  <button
                    onClick={() => {
                      setShowPlanReplaceWarning(false)
                      setPendingGoal(null)
                    }}
                    className="flex-1 inline-flex h-14 items-center justify-center gap-3 rounded-[22px] bg-white border border-slate-200 px-8 font-display text-[15px] font-bold text-slate-600 transition hover:bg-slate-50"
                  >
                    <span>Cancelar</span>
                  </button>
                </div>
              </motion.div>
            ) : isCompletedLocal && completionData ? (
              <motion.div 
                className="flex w-full flex-col items-center py-4 text-center sm:py-8"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-500 shadow-sm sm:mb-6 sm:h-20 sm:w-20">
                  <MaterialIcon name="verified" className="text-[40px]" />
                </div>
                
                <h3 className="mb-2 font-display text-[24px] font-bold tracking-tight text-[#334155] sm:text-[28px]">
                  ¡Plan Generado con Éxito!
                </h3>
                <p className="mb-8 max-w-md text-[15px] text-slate-500 sm:mb-10 sm:text-[16px]">
                  El modelo ha finalizado la construcción de tu plan con un puntaje de calidad de <strong>{completionData.score}%</strong> tras {completionData.iterations} iteraciones de refinamiento.
                </p>

                <div className="mb-8 grid w-full max-w-lg grid-cols-1 gap-3 sm:mb-10 sm:grid-cols-3 sm:gap-4">
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

                <div className="flex w-full justify-center">
                  <button
                    onClick={() => onComplete?.(activeProfileId || '', completionData.planId)}
                    className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-[22px] bg-[#1E293B] px-8 font-display text-[15px] font-bold text-white shadow-xl shadow-slate-200 transition hover:-translate-y-1 hover:bg-[#334155] active:translate-y-0 sm:w-auto sm:px-10"
                  >
                    <span>Ir al Dashboard</span>
                    <MaterialIcon name="dashboard" className="text-[20px]" />
                  </button>
                </div>
              </motion.div>
            ) : showPaymentQuote && walletStatus ? (
              <motion.div
                className="flex w-full flex-col items-center py-4 text-center sm:py-6"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                 <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border-4 border-slate-700 bg-[#1E293B] text-emerald-400 shadow-2xl shadow-slate-200 sm:mb-8 sm:h-24 sm:w-24">
                    <MaterialIcon name="bolt" className="text-[48px]" />
                 </div>

                 <h3 className="mb-2 font-display text-[24px] font-bold tracking-tight text-[#1E293B] sm:text-[26px]">
                   Cotización del Plan
                 </h3>
                 <p className="mb-8 max-w-sm text-[15px] leading-relaxed text-slate-500 sm:mb-10">
                   Para construir un plan de alta fidelidad con inteligencia artificial premium, se requiere una pequeña provisión de recursos.
                 </p>

                 <div className="mb-8 w-full max-w-sm space-y-4 sm:mb-10">
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
                className="w-full space-y-6 sm:space-y-8"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4 }}
              >
                <header className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
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
                  {clarification.questions.map((q: ClarificationQuestion, idx: number) => (
                    <motion.div 
                      key={q.id}
                      className="group relative rounded-[20px] border border-slate-100 bg-[#FAFAF9]/50 p-4 transition-all hover:bg-white hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] sm:rounded-[22px] sm:p-6"
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
                
                <div className="flex flex-col gap-4 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between sm:pt-8">
                  <p className="text-[13px] italic text-slate-400">
                    Respondé todo lo que puedas para un plan más preciso.
                  </p>
                  <button
                    type="button"
                    onClick={handleResume}
                    disabled={isResuming || clarification.questions.some((q: ClarificationQuestion) => !answers[q.id]?.trim() && q.type !== 'range')}
                    className="inline-flex h-14 items-center justify-center gap-3 rounded-[20px] bg-[#1E293B] px-8 font-display text-[15px] font-bold text-white shadow-lg shadow-slate-200 transition hover:-translate-y-0.5 hover:bg-[#334155] active:translate-y-0 disabled:opacity-30 disabled:grayscale"
                  >
                    <span>{isResuming ? 'Procesando...' : 'Continuar'}</span>
                    <MaterialIcon name="auto_awesome" className="text-[20px]" />
                  </button>
                </div>
              </motion.div>
            ) : isGenerating ? (
              <div className="space-y-4 py-2">
                <div className="flex justify-center sm:justify-end sm:pr-2">
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
                {generationError && (
                  <div className="mb-6">
                    <GenerationErrorDetails 
                      message={generationError}
                      debug={debugData}
                      onRetry={() => handleComplete(pendingGoal || value, true)}
                    />
                  </div>
                )}
                <div className="space-y-4 sm:space-y-0">
                  <textarea
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder={t('mockups.intake.placeholder')}
                    disabled={isGenerating}
                    className="min-h-[220px] w-full resize-none rounded-[20px] border border-transparent bg-[#FAFAF9] p-5 text-[18px] leading-[1.5] text-slate-500 outline-none placeholder:text-slate-400 focus:border-[#1E293B]/10 focus:bg-white focus:text-[#334155] disabled:opacity-50 sm:min-h-[240px] sm:p-6 sm:pb-24 sm:text-[22px] md:text-[24px]"
                  />
                  <div className="flex w-full items-center justify-between gap-3 sm:absolute sm:bottom-6 sm:right-6 sm:w-auto sm:justify-end">
                    <span className="rounded-full bg-white/80 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] sm:text-[10px] sm:tracking-[0.2em]">
                      {t('mockups.intake.submit_hint')}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleComplete()}
                      disabled={isGenerating || isCheckingCost || !value.trim()}
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition hover:-translate-y-0.5 ${isGenerating || isCheckingCost ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#1E293B]'}`}
                      aria-label={t('mockups.intake.continue')}
                    >
                      {isGenerating || isCheckingCost ? <MaterialIcon name="hourglass_empty" className="text-[20px] animate-spin" /> : <MaterialIcon name="arrow_forward" className="text-[20px]" />}
                    </button>
                  </div>
                </div>
              </>
            )}
            </div>
          </motion.section>

        </div>
        
        {/* Animación Dopamínica de Pago */}
        <SuccessPaymentAnimation 
          show={showSuccessAnimation} 
          onComplete={() => {
            setShowSuccessAnimation(false)
            processGeneration(pendingGoal!, activeProfileId || undefined)
          }} 
        />
      </MockupShell>
    </MotionConfig>
  )
}
