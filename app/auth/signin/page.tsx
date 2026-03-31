'use client'

import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, MotionConfig } from 'framer-motion'
import { t } from '@/src/i18n'
import { MaterialIcon } from '@/components/midnight-mint/MaterialIcon'
import PulsoLogo from '@/components/PulsoLogo'
import Link from 'next/link'

function SignInContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/flow'
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')
    
    try {
      const res = await signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl
      })

      if (res?.error) {
        setStatus('error')
        setErrorMsg('Credenciales inválidas')
      } else {
        router.push(callbackUrl)
        router.refresh()
      }
    } catch (err) {
      setStatus('error')
      setErrorMsg('Error de conexión')
    }
  }

  const handleGitHubSignIn = () => {
    signIn('github', { callbackUrl })
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen overflow-hidden bg-[#FAFAF9] px-6 py-8 text-[#334155]">
        {/* Background Gradients */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[12%] top-[8%] h-[420px] w-[420px] rounded-full bg-[#E9D5FF]/20 blur-[120px]" />
          <div className="absolute bottom-[6%] right-[12%] h-[420px] w-[420px] rounded-full bg-[#A7F3D0]/20 blur-[120px]" />
        </div>

        <main className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[480px] flex-col justify-center">
          <motion.section
            className="rounded-[32px] bg-white/95 p-10 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] backdrop-blur-xl md:p-12"
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <div className="mb-10 flex flex-col items-center text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center overflow-hidden rounded-[22px] bg-[#1E293B] shadow-[0_12px_24px_-8px_rgba(30,41,59,0.3)]">
                <PulsoLogo variant="mark" className="h-full w-full scale-125" ariaLabel="Pulso" />
              </div>
              <h1 className="font-display text-[24px] font-bold tracking-tight text-[#334155]">
                {t('mockups.auth.title')}
              </h1>
              <p className="mt-1 font-display text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                {t('mockups.auth.edition')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <label className="block space-y-2">
                <span className="ml-0.5 font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                  {t('mockups.auth.email_label')}
                </span>
                <div className="relative">
                  <MaterialIcon name="mail" className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                  <input
                    className="h-14 w-full rounded-[16px] border border-slate-200/80 bg-[#FAFAF9] pl-11 pr-4 text-[14px] text-[#334155] outline-none transition focus:border-[#1E293B]/30 focus:ring-2 focus:ring-[#1E293B]/5 disabled:opacity-50"
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
                <div className="flex items-end justify-between">
                  <span className="ml-0.5 font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                    {t('mockups.auth.password_label')}
                  </span>
                </div>
                <div className="relative">
                  <MaterialIcon name="lock" className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                  <input
                    className="h-14 w-full rounded-[16px] border border-slate-200/80 bg-[#FAFAF9] pl-11 pr-11 text-[14px] text-[#334155] outline-none transition focus:border-[#1E293B]/30 focus:ring-2 focus:ring-[#1E293B]/5 disabled:opacity-50"
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

              <button
                type="submit"
                className="group flex h-14 w-full items-center justify-center gap-2 rounded-[16px] bg-[#1E293B] font-display text-[14px] font-semibold tracking-wide text-white transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0"
                disabled={status === 'submitting' || !email || !password}
              >
                <span>
                  {status === 'submitting' ? 'Iniciando sesión...' : t('mockups.auth.login')}
                </span>
                {status !== 'submitting' && (
                  <MaterialIcon name="login" className="text-[18px] transition-transform group-hover:translate-x-1" />
                )}
              </button>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="mx-4 flex-shrink font-display text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">O continuar con</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <button
                type="button"
                onClick={handleGitHubSignIn}
                className="flex h-14 w-full items-center justify-center gap-3 rounded-[16px] border border-slate-200 bg-white font-display text-[14px] font-semibold text-[#334155] transition-all hover:bg-slate-50 hover:border-slate-300"
                disabled={status === 'submitting'}
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.43.372.823 1.102.823 2.222 0 1.608-.015 2.898-.015 3.293 0 .322.218.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
                <span>GitHub</span>
              </button>

              {status === 'error' && (
                <div className="mt-4 rounded-lg bg-red-50 p-3 text-center text-[13px] text-red-600 border border-red-100 italic">
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
              <span className="font-display text-[9px] uppercase tracking-[0.18em] text-slate-400">Midnight Mint Edition</span>
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
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF9]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1E293B] border-t-transparent" />
      </div>
    }>
      <SignInContent />
    </Suspense>
  )
}
