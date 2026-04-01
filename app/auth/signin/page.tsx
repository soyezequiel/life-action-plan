'use client'

import { useState, Suspense, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, MotionConfig } from 'framer-motion'
import { t } from '@/src/i18n'
import { MaterialIcon } from '@/components/midnight-mint/MaterialIcon'
import PulsoLogoAnimated from '@/components/ui/PulsoLogoAnimated'
import Link from 'next/link'

function SignInContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/intake'
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Handle errors from URL parameters (NextAuth v5 redirects on error)
  const urlError = searchParams.get('code') || searchParams.get('error')
  
  // Use useEffect to handle URL errors after mounting
  useEffect(() => {
    if (urlError) {
      setStatus('error')
      if (urlError.includes('user_not_found')) {
        setErrorMsg('Este correo electrónico no está registrado en Pulso.')
      } else if (urlError.includes('invalid_password')) {
        setErrorMsg('Contraseña incorrecta. Por favor, inténtalo de nuevo.')
      } else if (urlError.includes('invalid_input')) {
        setErrorMsg('Datos de acceso inválidos. Revisa el formato del correo.')
      } else {
        setErrorMsg('Error al iniciar sesión. Verifica tus credenciales.')
      }
    }
  }, [urlError])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Basic frontend validation
    if (!email.includes('@')) {
      setStatus('error')
      setErrorMsg('Por favor, ingresa un correo electrónico válido.')
      return
    }
    
    if (password.length < 6) {
      setStatus('error')
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    setStatus('submitting')
    setErrorMsg('')
    
    try {
      // In NextAuth v5, for Credentials we use redirect: true to get the code in URL
      await signIn('credentials', {
        email,
        password,
        redirect: true,
        callbackUrl
      })
      // If successful, redirect happens automatically
    } catch (err) {
      setStatus('error')
      setErrorMsg('Hubo un problema de conexión. Inténtalo más tarde.')
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen overflow-hidden bg-transparent px-6 py-8 text-[#334155]">
        {/* Background Gradients */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[12%] top-[8%] h-[420px] w-[420px] rounded-full bg-[#C8B6FF]/18 blur-[120px]" />
          <div className="absolute bottom-[6%] right-[12%] h-[420px] w-[420px] rounded-full bg-[#A7F3D0]/16 blur-[120px]" />
        </div>

        <main className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[480px] flex-col justify-center">
          <motion.section
            className="rounded-[40px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.92)] p-10 shadow-[0_26px_58px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl md:p-12"
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <div className="mb-10 flex flex-col items-center text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center overflow-hidden rounded-[22px] bg-[#0f172a] shadow-[0_12px_24px_-8px_rgba(9,11,13,0.3)]">
                <PulsoLogoAnimated variant="mark" size="100%" speed={1.5} glow={true} ariaLabel="Pulso" />
              </div>
              <h1 className="font-display text-[24px] font-bold tracking-tight text-[#334155]">
                {t('mockups.auth.title')}
              </h1>
              <p className="mt-1 font-display text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                {t('mockups.auth.edition')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <label className="block space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="ml-0.5 font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                      {t('mockups.auth.email_label')}
                    </span>
                    <span className="text-[9px] text-slate-300 font-medium italic">Requerido</span>
                  </div>
                  <div className="relative">
                    <MaterialIcon name="mail" className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                    <input
                        className={`h-14 w-full rounded-[16px] border bg-[rgba(255,252,247,0.96)] pl-11 pr-4 text-[14px] text-[#334155] outline-none transition focus:ring-2 focus:ring-[#0f766e]/8 disabled:opacity-50 ${
                        status === 'error' && !email ? 'border-red-300' : 'border-slate-200/80 focus:border-[#0f766e]/30'
                      }`}
                      type="email"
                      required
                      placeholder={t('mockups.auth.email_placeholder')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={status === 'submitting'}
                    />
                  </div>
                </label>

                <label className="block space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="ml-0.5 font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                      {t('mockups.auth.password_label')}
                    </span>
                    <span className="text-[9px] text-slate-300 font-medium italic">Mín. 6 caracteres</span>
                  </div>
                  <div className="relative">
                    <MaterialIcon name="lock" className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                    <input
                        className={`h-14 w-full rounded-[16px] border bg-[rgba(255,252,247,0.96)] pl-11 pr-11 text-[14px] text-[#334155] outline-none transition focus:ring-2 focus:ring-[#0f766e]/8 disabled:opacity-50 ${
                        status === 'error' && password.length < 6 ? 'border-red-300' : 'border-slate-200/80 focus:border-[#0f766e]/30'
                      }`}
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder={t('mockups.auth.password_placeholder')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={status === 'submitting'}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 transition hover:text-[#334155]"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      <MaterialIcon name={showPassword ? "visibility_off" : "visibility"} className="text-[18px]" />
                    </button>
                  </div>
                </label>
              </div>

              <button
                type="submit"
                className="group flex h-14 w-full items-center justify-center gap-2 rounded-[16px] bg-[#1f2937] font-display text-[14px] font-semibold tracking-wide text-white transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0"
                disabled={status === 'submitting'}
              >
                <span>
                  {status === 'submitting' ? 'Iniciando sesión...' : t('mockups.auth.login')}
                </span>
                {status !== 'submitting' && (
                  <MaterialIcon name="login" className="text-[18px] transition-transform group-hover:translate-x-1" />
                )}
              </button>

              {status === 'error' && (
                <div className="rounded-xl bg-red-50 p-4 text-center text-[13px] text-red-600 border border-red-100 italic animate-pulse">
                  {errorMsg}
                </div>
              )}
            </form>

            <div className="mt-8 border-t border-slate-200/40 pt-8 text-center">
              <p className="text-[13px] text-slate-500">
                {t('mockups.auth.no_account')}
                <Link
                  href="/auth/signup"
                  className="ml-1 font-semibold text-[#334155] transition hover:underline"
                >
                  {t('mockups.auth.create_account')}
                </Link>
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
            <div className="flex gap-6 italic">
              <span className="font-display text-[9px] uppercase tracking-[0.18em] text-slate-400">Editorial Edition</span>
            </div>
          </div>
        </main>
      </div>
    </MotionConfig>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-transparent">
        <PulsoLogoAnimated variant="mark" size={48} speed={1} />
      </div>
    }>
      <SignInContent />
    </Suspense>
  )
}
