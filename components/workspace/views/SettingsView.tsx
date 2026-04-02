'use client'

import React from 'react'
import { startTransition } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { MaterialIcon } from '@/components/midnight-mint/MaterialIcon'
import { browserLapClient } from '@/src/lib/client/browser-http-client'
import { useUserStatusContext } from '@/src/lib/client/UserStatusProvider'
import { t } from '@/src/i18n'
import type { WalletStatus } from '@/src/shared/types/lap-api'

import type { SettingsViewProps } from '../types'

export default function SettingsView({
  section = 'wallet',
  initialWalletStatus = null,
  initialApiConfigured = false
}: SettingsViewProps) {
  const { onboardingStep, refresh: refreshStatus } = useUserStatusContext()
  const [mode, setMode] = useState<'wallet' | 'api'>(section === 'backend' ? 'api' : 'wallet')
  const [wallet, setWallet] = useState<WalletStatus | null>(initialWalletStatus)
  const [isWalletLoading, setIsWalletLoading] = useState(initialWalletStatus === null)
  const [relayUrl, setRelayUrl] = useState('')
  const [walletStatus, setWalletStatus] = useState<'idle' | 'connecting' | 'success' | 'error'>('idle')
  const [apiKey, setApiKey] = useState('')
  const [apiConfigured, setApiConfigured] = useState(initialApiConfigured)
  const [apiStatus, setApiStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    setMode(section === 'backend' ? 'api' : 'wallet')
  }, [section])

  useEffect(() => {
    const shouldFetchWallet = initialWalletStatus === null
    const shouldFetchApiStatus = !initialApiConfigured

    if (!shouldFetchWallet && !shouldFetchApiStatus) {
      return
    }

    let isMounted = true

    const bootstrapRemoteState = async (): Promise<void> => {
      try {
        const [nextWallet, nextApiConfigured] = await Promise.all([
          shouldFetchWallet ? browserLapClient.wallet.status() : Promise.resolve(null),
          shouldFetchApiStatus
            ? fetch('/api/settings/api-key?provider=openai').then((res) => res.json()).then((data) => Boolean(data.configured))
            : Promise.resolve(false)
        ])

        if (!isMounted) {
          return
        }

        if (nextWallet) {
          setWallet(nextWallet)
        }

        if (nextApiConfigured) {
          setApiConfigured(true)
        }
      } catch (error) {
        console.error(error)
      } finally {
        if (isMounted && shouldFetchWallet) {
          setIsWalletLoading(false)
        }
      }
    }

    setIsWalletLoading(shouldFetchWallet)
    void bootstrapRemoteState()

    return () => {
      isMounted = false
    }
  }, [initialApiConfigured, initialWalletStatus])

  const fetchWallet = () => {
    setIsWalletLoading(true)
    browserLapClient.wallet.status()
      .then(setWallet)
      .catch(console.error)
      .finally(() => setIsWalletLoading(false))
  }

  const handleWalletConnect = async () => {
    if (!relayUrl) {
      return
    }

    setWalletStatus('connecting')

    try {
      await browserLapClient.wallet.connect(relayUrl)
      setWalletStatus('success')
      setRelayUrl('')
      fetchWallet()
      startTransition(() => {
        void refreshStatus()
      })
      setTimeout(() => setWalletStatus('idle'), 2000)
    } catch {
      setWalletStatus('error')
      setTimeout(() => setWalletStatus('idle'), 3000)
    }
  }

  const handleApiSave = async () => {
    if (!apiKey && !apiConfigured) {
      return
    }

    setApiStatus('saving')
    setErrorMsg('')

    try {
      const response = await fetch('/api/settings/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openai', apiKey })
      })
      const data = await response.json()

      if (data.success) {
        setApiStatus('success')
        setApiConfigured(true)
        setApiKey('')
        startTransition(() => {
          void refreshStatus()
        })
        setTimeout(() => setApiStatus('idle'), 3000)
        return
      }

      setApiStatus('error')
      setErrorMsg(data.error || 'Error al guardar')
    } catch {
      setApiStatus('error')
      setErrorMsg('Error de red')
    }
  }

  const formatCurrency = (amount: number | undefined) => (
    amount !== undefined ? new Intl.NumberFormat('es-AR').format(amount) : '0'
  )

  return (
    <div className="mx-auto w-full max-w-[980px] py-4">
      <header className="mb-12 text-center">
        <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Sistema</span>
        <h1 className="mt-3 font-display text-[36px] font-bold tracking-tight text-[#1f2937]">
          Configuraci&oacute;n de Recursos
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-[16px] leading-[1.6] text-slate-500">
          Eleg&iacute; c&oacute;mo quer&eacute;s procesar y pagar tus planes de acci&oacute;n. Optimiz&aacute; tu privacidad y costos.
        </p>
      </header>

      {onboardingStep !== 'SETUP' && onboardingStep !== 'LOADING' ? (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 overflow-hidden rounded-[36px] border border-[#0f766e]/15 bg-[rgba(15,118,110,0.08)] p-1 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.16)] backdrop-blur-2xl"
        >
          <div className="flex flex-col items-center justify-between gap-6 px-10 py-8 md:flex-row">
            <div className="flex items-center gap-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1f2937] text-[#A7F3D0] shadow-xl shadow-emerald-200/30">
                <MaterialIcon name="auto_awesome" className="text-[28px]" />
              </div>
              <div className="text-left">
                <h3 className="font-display text-[22px] font-bold text-[#064E3B]">&iexcl;Todo listo para brillar!</h3>
                <p className="text-[15px] text-[#064E3B]/70">
                  Ya tienes tus recursos configurados. Es momento de trazar tu camino.
                </p>
              </div>
            </div>
            <Link
              href="/intake"
              className="inline-flex h-14 items-center justify-center gap-3 rounded-[20px] bg-[#1f2937] px-8 font-display text-[15px] font-bold text-white shadow-xl shadow-slate-900/10 transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <span>Comenzar mi primer plan</span>
              <MaterialIcon name="arrow_forward" className="text-[20px]" />
            </Link>
          </div>
        </motion.div>
      ) : null}

      <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode('wallet')}
          className={`group relative overflow-hidden rounded-[36px] border-2 p-8 text-left transition-all duration-300 ${
            mode === 'wallet'
              ? 'border-[#0f766e]/20 bg-[rgba(255,253,249,0.96)] shadow-xl shadow-slate-200/40'
              : 'border-transparent bg-[rgba(255,253,249,0.72)] hover:bg-[rgba(255,253,249,0.92)] hover:shadow-lg'
          }`}
        >
          {mode === 'wallet' ? (
            <motion.div layoutId="active-bg" className="absolute inset-0 z-0 bg-gradient-to-br from-[#A7F3D0]/12 to-transparent" />
          ) : null}
          <div className="relative z-10">
            <div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-[20px] transition-colors ${
              mode === 'wallet' ? 'bg-[#1f2937] text-[#A7F3D0]' : 'bg-slate-200 text-slate-500'
            }`}>
              <MaterialIcon name="account_balance_wallet" className="text-[24px]" />
            </div>
            <h3 className="font-display text-[20px] font-bold text-[#1f2937]">Billetera LAP</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
              Paga con Sats v&iacute;a Lightning (NWC). La opci&oacute;n privada, r&aacute;pida y sin llaves API externas.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                mode === 'wallet' ? 'bg-[#A7F3D0] text-[#064E3B]' : 'bg-slate-200 text-slate-400'
              }`}>
                Recomendado
              </span>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMode('api')}
          className={`group relative overflow-hidden rounded-[36px] border-2 p-8 text-left transition-all duration-300 ${
            mode === 'api'
              ? 'border-[#334155]/20 bg-[rgba(255,253,249,0.96)] shadow-xl shadow-slate-200/40'
              : 'border-transparent bg-[rgba(255,253,249,0.72)] hover:bg-[rgba(255,253,249,0.92)] hover:shadow-lg'
          }`}
        >
          {mode === 'api' ? (
            <motion.div layoutId="active-bg" className="absolute inset-0 z-0 bg-gradient-to-br from-slate-100 to-transparent" />
          ) : null}
          <div className="relative z-10">
            <div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-[20px] transition-colors ${
              mode === 'api' ? 'bg-[#1f2937] text-white' : 'bg-slate-200 text-slate-500'
            }`}>
              <MaterialIcon name="key" className="text-[24px]" />
            </div>
            <h3 className="font-display text-[20px] font-bold text-[#1f2937]">Llave API Propia</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
              Usa tu propia cuenta de OpenAI o OpenRouter. Ideal si ya ten&eacute;s cr&eacute;ditos o suscripciones.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className="inline-flex rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Avanzado
              </span>
            </div>
          </div>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {mode === 'wallet' ? (
          <motion.div
            key="wallet-form"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="rounded-[40px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.92)] p-10 shadow-[0_26px_58px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl"
          >
            <div className="grid gap-12 lg:grid-cols-2">
              <div className="space-y-8">
                <div>
                  <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400">Estado Actual</h4>
                    <div className="rounded-[24px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.96)] p-6">
                      <div className="mb-4 flex items-center justify-between">
                        <span className={`h-3 w-3 rounded-full ${wallet?.connected ? 'bg-[#A7F3D0]' : 'bg-slate-300'}`} />
                      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                        {wallet?.connected ? 'Conectada' : 'No enlazada'}
                      </span>
                    </div>
                    <p className="font-display text-[32px] font-bold text-[#1E293B]">
                      {isWalletLoading ? '...' : formatCurrency(wallet?.balanceSats)} <span className="text-[14px] text-slate-400">sats</span>
                    </p>
                    <p className="mt-1 text-[13px] text-slate-400">Saldo disponible para nuevos planes</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 rounded-[20px] bg-[#E9D5FF]/20 p-4 text-[13px] text-[#4C1D95]">
                  <MaterialIcon name="bolt" className="text-[20px]" />
                    <p>Usa NWC para una conexi&oacute;n segura sin ceder el control de tus fondos.</p>
                  </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400">Conectar Billetera</h4>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="nwc://..."
                    value={relayUrl}
                    onChange={(event) => setRelayUrl(event.target.value)}
                      className="h-16 w-full rounded-[20px] bg-[rgba(255,252,247,0.96)] px-6 text-[15px] outline-none transition-all focus:ring-2 focus:ring-[#0f766e]/10"
                  />
                  <MaterialIcon name="link" className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300" />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => void handleWalletConnect()}
                    disabled={walletStatus === 'connecting' || !relayUrl}
                    className="flex h-14 flex-1 items-center justify-center gap-2 rounded-[18px] bg-[#1f2937] font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    <span>{walletStatus === 'connecting' ? 'Enlazando...' : 'Enlazar Billetera'}</span>
                    <MaterialIcon name="arrow_forward" className="text-[18px]" />
                  </button>
                  {wallet?.connected ? (
                    <button
                      type="button"
                      onClick={() => {
                        void browserLapClient.wallet.disconnect().then(fetchWallet)
                      }}
                      className="flex h-14 w-14 items-center justify-center rounded-[18px] border-2 border-slate-100 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-400"
                    >
                      <MaterialIcon name="link_off" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="api-form"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="rounded-[40px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.92)] p-10 shadow-[0_26px_58px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl"
          >
            <div className="mb-10 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-slate-100">
                <MaterialIcon name="dns" className="text-slate-500" />
              </div>
              <div>
                <h4 className="font-display text-[20px] font-bold text-[#1E293B]">Credenciales de API</h4>
                <p className="text-[13px] text-slate-500">Configur&aacute; el acceso a los modelos de lenguaje.</p>
              </div>
            </div>

            <div className="grid gap-8">
              <div className="grid gap-6 md:grid-cols-2">
                <label className="block space-y-3">
                  <span className="ml-1 text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400">Proveedor</span>
                  <div className="relative">
                    <div className="flex h-16 items-center justify-between rounded-[20px] bg-[rgba(255,252,247,0.96)] px-6 text-slate-500">
                      <span>OpenAI</span>
                      <MaterialIcon name="expand_more" />
                    </div>
                  </div>
                </label>
                <label className="block space-y-3">
                  <span className="ml-1 text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400">Llave API</span>
                  <div className="relative">
                    <input
                      type="password"
                      placeholder={apiConfigured ? '•••••••••••••••• (Activa)' : 'sk-...'}
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      className="h-16 w-full rounded-[20px] bg-[rgba(255,252,247,0.96)] px-6 text-[15px] outline-none transition-all focus:ring-2 focus:ring-[#0f766e]/10"
                    />
                  </div>
                </label>
              </div>

              <div className="flex flex-col gap-4">
                {apiStatus === 'success' ? <div className="text-center text-sm font-bold text-emerald-500">API actualizada con &eacute;xito</div> : null}
                {apiStatus === 'error' ? <div className="text-center text-sm font-bold text-red-500">{errorMsg}</div> : null}
                <button
                  type="button"
                  onClick={() => void handleApiSave()}
                  disabled={apiStatus === 'saving' || (!apiKey && !apiConfigured)}
                  className="flex h-16 items-center justify-center gap-3 rounded-[20px] bg-[#1f2937] text-[16px] font-bold text-white shadow-lg shadow-slate-200 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                >
                  <span>{apiStatus === 'saving' ? 'Guardando...' : 'Guardar Configuraci&oacute;n'}</span>
                  <MaterialIcon name="save" className="text-[20px]" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
