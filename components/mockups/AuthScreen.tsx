'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, MotionConfig } from 'framer-motion'
import { t } from '@/src/i18n'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
import PulsoLogoAnimated from '../ui/PulsoLogoAnimated'

type AuthMode = 'login' | 'register'

export default function AuthScreen() {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [showForgotMsg, setShowForgotMsg] = useState(false)

  const handleSubmit = async () => {
    setStatus('submitting')
    setErrorMsg('')
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await response.json()
      
      if (data.authenticated) {
        router.push('/')
      } else {
        setStatus('error')
        setErrorMsg(data.error || 'Autenticación fallida')
      }
    } catch (e: unknown) {
      setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'Error de conexión')
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen overflow-hidden bg-transparent px-6 py-8 text-[#334155]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[12%] top-[8%] h-[420px] w-[420px] rounded-full bg-[#C8B6FF]/18 blur-[120px]" />
          <div className="absolute bottom-[6%] right-[12%] h-[420px] w-[420px] rounded-full bg-[#A7F3D0]/16 blur-[120px]" />
          <div className="absolute bottom-[-180px] left-1/2 h-[260px] w-[760px] -translate-x-1/2 rounded-full bg-[#1E293B]/6 blur-[120px]" />
        </div>

        <main className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[480px] flex-col justify-center">
          <motion.section
            className="rounded-[40px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.92)] p-10 shadow-[0_26px_58px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl md:p-12"
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <div className="mb-10 flex flex-col items-center text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center overflow-hidden rounded-[22px] bg-[#0F172A] shadow-[0_12px_24px_-8px_rgba(9,11,13,0.3)]">
                <PulsoLogoAnimated variant="mark" size="100%" speed={1.5} glow={true} ariaLabel="Pulso" />
              </div>
              <h1 className="font-display text-[26px] font-bold tracking-tight text-[#1f2937]">
                {mode === 'login' ? t('mockups.auth.title') : t('mockups.auth.register')}
              </h1>
              <p className="mt-1 font-display text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                {t('mockups.auth.edition')}
              </p>
            </div>

            <p className="mx-auto mb-8 max-w-sm text-center text-[15px] leading-7 text-slate-500">
              {t('mockups.auth.copy')}
            </p>

            <form className="space-y-5">
              <label className="block space-y-2">
                <span className="ml-0.5 font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                  {t('mockups.auth.email_label')}
                </span>
                <div className="relative">
                  <MaterialIcon name="mail" className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                  <input
                    className="h-14 w-full rounded-[16px] border border-slate-200/80 bg-[rgba(255,252,247,0.96)] pl-11 pr-4 text-[14px] text-[#334155] outline-none transition focus:border-[#0f766e]/30 focus:ring-2 focus:ring-[#0f766e]/8 disabled:opacity-50"
                    type="email"
                    placeholder={t('mockups.auth.email_placeholder')}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={status === 'submitting'}
                  />
                </div>
              </label>

              <label className="block space-y-2">
                <div className="flex items-end justify-between">
                  <span className="ml-0.5 font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                    {t('mockups.auth.password_label')}
                  </span>
                  <button 
                    type="button" 
                    className="text-[11px] italic text-slate-400 transition hover:text-[#334155]"
                    onClick={() => setShowForgotMsg(true)}
                  >
                    {t('mockups.auth.forgot')}
                  </button>
                </div>
                <div className="relative">
                  <MaterialIcon name="lock" className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                  <input
                    className="h-14 w-full rounded-[16px] border border-slate-200/80 bg-[rgba(255,252,247,0.96)] pl-11 pr-11 text-[14px] text-[#334155] outline-none transition focus:border-[#0f766e]/30 focus:ring-2 focus:ring-[#0f766e]/8 disabled:opacity-50"
                    type={showPassword ? "text" : "password"}
                    placeholder={t('mockups.auth.password_placeholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={status === 'submitting'}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 transition hover:text-[#334155]"
                    aria-label="toggle password"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <MaterialIcon name={showPassword ? "visibility_off" : "visibility"} className="text-[18px]" />
                  </button>
                </div>
                {showForgotMsg && (
                  <p className="mt-1 text-[11px] text-amber-600/80 italic">
                    Restablecimiento de contraseña no disponible en esta versión
                  </p>
                )}
              </label>

              <label className="flex items-center gap-2 px-0.5 py-1 text-[13px] text-slate-500">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300 text-[#1E293B] focus:ring-[#1E293B]/20"
                />
                <span>{t('mockups.auth.remember')}</span>
              </label>

              <button
                type="button"
                className="group flex h-14 w-full items-center justify-center gap-2 rounded-[16px] bg-[#1f2937] font-display text-[14px] font-semibold tracking-wide text-white transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0"
                onClick={handleSubmit}
                disabled={status === 'submitting' || !username || !password}
              >
                <span>
                  {status === 'submitting' 
                    ? t('mockups.auth.submitting') || 'Procesando...'
                    : mode === 'login' ? t('mockups.auth.login') : t('mockups.auth.register')}
                </span>
                {status !== 'submitting' && (
                  <MaterialIcon name="arrow_forward" className="text-[18px] transition-transform group-hover:translate-x-1" />
                )}
              </button>

              {status === 'error' && (
                <div className="mt-4 rounded-lg bg-red-50 p-3 text-center text-[13px] text-red-600 border border-red-100">
                  {errorMsg}
                </div>
              )}
            </form>

            <div className="mt-8 border-t border-slate-200/40 pt-8 text-center">
              <p className="text-[13px] text-slate-500">
                {mode === 'login' ? t('mockups.auth.no_account') : t('mockups.auth.no_account')}
                <button
                  type="button"
                  className="ml-1 font-semibold text-[#334155] transition hover:underline"
                  onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                >
                  {mode === 'login' ? t('mockups.auth.create_account') : t('mockups.auth.login')}
                </button>
              </p>
            </div>
          </motion.section>

          <div className="mt-10 flex items-center justify-between px-6">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#A7F3D0] shadow-[0_0_8px_rgba(167,243,208,0.85)]" />
              <span className="font-display text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                {t('mockups.auth.system_status')}
              </span>
            </div>
            <div className="flex gap-6">
              <button type="button" className="font-display text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400 transition hover:text-[#334155]">
                {t('mockups.auth.support')}
              </button>
              <button type="button" className="font-display text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400 transition hover:text-[#334155]">
                {t('mockups.auth.privacy')}
              </button>
            </div>
          </div>
        </main>
      </div>
    </MotionConfig>
  )
}
