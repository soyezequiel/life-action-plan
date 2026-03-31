'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, MotionConfig } from 'framer-motion'
import { t } from '@/src/i18n'
import { MaterialIcon } from '@/components/midnight-mint/MaterialIcon'
import PulsoLogo from '@/components/PulsoLogo'
import Link from 'next/link'

export default function SignUpPage() {
  const router = useRouter()
  
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error' | 'success'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')
    
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, password, email, name })
      })
      
      const data = await response.json()
      
      if (data.authenticated) {
        setStatus('success')
        // Redirect to login or auto-login
        setTimeout(() => {
          router.push('/auth/signin')
        }, 2000)
      } else {
        setStatus('error')
        setErrorMsg(data.error || 'Error al registrarse')
      }
    } catch (err) {
      setStatus('error')
      setErrorMsg('Error de conexión')
    }
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
                {t('mockups.auth.create_account')}
              </h1>
              <p className="mt-1 font-display text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                {t('mockups.auth.edition')}
              </p>
            </div>

            {status === 'success' ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <MaterialIcon name="check_circle" className="text-[32px]" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">¡Cuenta creada!</h2>
                <p className="mt-2 text-slate-500">Redirigiendo al inicio de sesión...</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <label className="block space-y-2">
                  <span className="ml-0.5 font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                    Nombre Completo
                  </span>
                  <div className="relative">
                    <MaterialIcon name="person" className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                    <input
                      className="h-14 w-full rounded-[16px] border border-slate-200/80 bg-[#FAFAF9] pl-11 pr-4 text-[14px] text-[#334155] outline-none transition focus:border-[#1E293B]/30 focus:ring-2 focus:ring-[#1E293B]/5 disabled:opacity-50"
                      type="text"
                      required
                      placeholder="Tu nombre"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={status === 'submitting'}
                    />
                  </div>
                </label>

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
                  <span className="ml-0.5 font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                    {t('mockups.auth.password_label')}
                  </span>
                  <div className="relative">
                    <MaterialIcon name="lock" className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                    <input
                      className="h-14 w-full rounded-[16px] border border-slate-200/80 bg-[#FAFAF9] pl-11 pr-11 text-[14px] text-[#334155] outline-none transition focus:border-[#1E293B]/30 focus:ring-2 focus:ring-[#1E293B]/5 disabled:opacity-50"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
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
                  disabled={status === 'submitting' || !email || !password || !name}
                >
                  <span>
                    {status === 'submitting' ? 'Creando cuenta...' : t('mockups.auth.register')}
                  </span>
                  {status !== 'submitting' && (
                    <MaterialIcon name="person_add" className="text-[18px] transition-transform group-hover:translate-x-1" />
                  )}
                </button>

                {status === 'error' && (
                  <div className="mt-4 rounded-lg bg-red-50 p-3 text-center text-[13px] text-red-600 border border-red-100 italic">
                    {errorMsg}
                  </div>
                )}
              </form>
            )}

            <div className="mt-8 border-t border-slate-200/40 pt-8 text-center">
              <p className="text-[13px] text-slate-500">
                ¿Ya tienes una cuenta?
                <Link
                  href="/auth/signin"
                  className="ml-1 font-semibold text-[#334155] transition hover:underline"
                >
                  {t('mockups.auth.login')}
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
