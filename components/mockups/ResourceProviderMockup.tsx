'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { t } from '@/src/i18n'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
import { MockupShell } from '../midnight-mint/MockupShell'
import { browserLapClient } from '@/src/lib/client/browser-http-client'
import { useUserStatusContext } from '@/src/lib/client/UserStatusProvider'
import type { WalletStatus } from '@/src/shared/types/lap-api'
import Link from 'next/link'

export default function ResourceProviderMockup() {
  const { onboardingStep, refresh: refreshStatus } = useUserStatusContext()
  const [mode, setMode] = useState<'wallet' | 'api'>('wallet')
  
  // Wallet states
  const [wallet, setWallet] = useState<WalletStatus | null>(null)
  const [isWalletLoading, setIsWalletLoading] = useState(true)
  const [relayUrl, setRelayUrl] = useState('')
  const [walletStatus, setWalletStatus] = useState<'idle' | 'connecting' | 'success' | 'error'>('idle')

  // API states
  const [apiKey, setApiKey] = useState('')
  const [endpoint, setEndpoint] = useState('https://api.openai.com/v1')
  const [apiConfigured, setApiConfigured] = useState(false)
  const [apiStatus, setApiStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    // Initial data fetch
    fetchWallet()
    fetchApiStatus()
  }, [])

  const fetchWallet = () => {
    setIsWalletLoading(true)
    browserLapClient.wallet.status()
      .then(setWallet)
      .catch(console.error)
      .finally(() => setIsWalletLoading(false))
  }

  const fetchApiStatus = () => {
    fetch('/api/settings/api-key?provider=openai')
      .then(res => res.json())
      .then(data => {
        if (data.configured) setApiConfigured(true)
      })
      .catch(console.error)
  }

  const handleWalletConnect = async () => {
    if (!relayUrl) return
    setWalletStatus('connecting')
    try {
      await browserLapClient.wallet.connect(relayUrl)
      setWalletStatus('success')
      setRelayUrl('')
      fetchWallet()
      await refreshStatus() // Force global state refresh
      setTimeout(() => setWalletStatus('idle'), 2000)
    } catch {
      setWalletStatus('error')
      setTimeout(() => setWalletStatus('idle'), 3000)
    }
  }

  const handleApiSave = async () => {
    if (!apiKey && !apiConfigured) return
    setApiStatus('saving')
    setErrorMsg('')
    try {
      const res = await fetch('/api/settings/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openai', apiKey })
      })
      const data = await res.json()
      if (data.success) {
        setApiStatus('success')
        setApiConfigured(true)
        setApiKey('')
        await refreshStatus() // Force global state refresh
        setTimeout(() => setApiStatus('idle'), 3000)
      } else {
        setApiStatus('error')
        setErrorMsg(data.error || 'Error al guardar')
      }
    } catch {
      setApiStatus('error')
      setErrorMsg('Error de red')
    }
  }

  const formatCurrency = (amount: number | undefined) => 
    amount !== undefined ? new Intl.NumberFormat('es-AR').format(amount) : '0'

  return (
    <MockupShell
      sidebarLabel={t('mockups.common.digital_sanctuary')}
      sidebarNav={[
        { label: t('mockups.common.nav.dashboard'), icon: 'dashboard', href: '/' },
        { label: t('mockups.common.nav.planificador'), icon: 'calendar_today', href: '/plan' },
        { label: t('mockups.common.nav.tareas'), icon: 'check_circle', href: '/flow?variant=tasks' },
        { label: t('mockups.common.nav.settings'), icon: 'settings', active: true, href: '/settings' }
      ]}
      sidebarPrimaryAction={{ label: t('mockups.common.new_entry'), icon: 'add', href: '/intake' }}
      topTabs={[]}
      topRight={(
        <div className="flex items-center gap-4">
          <div className="h-8 w-8 rounded-full bg-[#1E293B] shadow-lg shadow-slate-200" />
          <span className="text-[13px] font-bold text-slate-700">Mi Espacio</span>
        </div>
      )}
    >
      <div className="mx-auto w-full max-w-[900px] py-4">
        {/* Header Section */}
        <header className="mb-12 text-center">
          <h1 className="font-display text-[36px] font-bold tracking-tight text-[#1E293B]">
            Configuración de Recursos
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-[16px] leading-[1.6] text-slate-500">
            Elegí cómo querés procesar y pagar tus planes de acción. Optimizá tu privacidad y costos.
          </p>
        </header>

        {/* Onboarding Success Banner */}
        {onboardingStep !== 'SETUP' && onboardingStep !== 'LOADING' && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12 overflow-hidden rounded-[32px] bg-[#A7F3D0]/20 border border-[#A7F3D0]/40 p-1"
          >
            <div className="flex flex-col items-center justify-between gap-6 px-10 py-8 md:flex-row">
              <div className="flex items-center gap-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1E293B] text-[#A7F3D0] shadow-xl shadow-emerald-200/50">
                  <MaterialIcon name="auto_awesome" className="text-[28px]" />
                </div>
                <div className="text-left">
                  <h3 className="font-display text-[22px] font-bold text-[#064E3B]">¡Todo listo para brillar!</h3>
                  <p className="text-[15px] text-[#064E3B]/70">Ya tienes tus recursos configurados. Es momento de trazar tu camino.</p>
                </div>
              </div>
              <Link
                href="/intake"
                className="inline-flex h-14 items-center justify-center gap-3 rounded-[20px] bg-[#1E293B] px-8 font-display text-[15px] font-bold text-white shadow-xl shadow-slate-900/10 transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <span>Comenzar mi primer plan</span>
                <MaterialIcon name="arrow_forward" className="text-[20px]" />
              </Link>
            </div>
          </motion.div>
        )}

        {/* Unified Selector Engine */}
        <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Option: Wallet (Default) */}
          <button
            type="button"
            onClick={() => setMode('wallet')}
            className={`group relative overflow-hidden rounded-[32px] border-2 p-8 text-left transition-all duration-300 ${
              mode === 'wallet' 
                ? 'border-[#A7F3D0] bg-white shadow-xl shadow-slate-200/50' 
                : 'border-transparent bg-slate-50 hover:bg-white hover:shadow-lg'
            }`}
          >
            {mode === 'wallet' && (
              <motion.div 
                layoutId="active-bg" 
                className="absolute inset-0 z-0 bg-gradient-to-br from-[#A7F3D0]/10 to-transparent" 
              />
            )}
            <div className="relative z-10">
              <div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-[20px] transition-colors ${
                mode === 'wallet' ? 'bg-[#1E293B] text-[#A7F3D0]' : 'bg-slate-200 text-slate-500'
              }`}>
                <MaterialIcon name="account_balance_wallet" className="text-[24px]" />
              </div>
              <h3 className="font-display text-[20px] font-bold text-[#1E293B]">Billetera LAP</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
                Paga con Sats vía Lightning (NWC). La opción privada, rápida y sin llaves API externas.
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

          {/* Option: API Propia */}
          <button
            type="button"
            onClick={() => setMode('api')}
            className={`group relative overflow-hidden rounded-[32px] border-2 p-8 text-left transition-all duration-300 ${
              mode === 'api' 
                ? 'border-[#334155]/20 bg-white shadow-xl shadow-slate-200/50' 
                : 'border-transparent bg-slate-50 hover:bg-white hover:shadow-lg'
            }`}
          >
            {mode === 'api' && (
              <motion.div 
                layoutId="active-bg" 
                className="absolute inset-0 z-0 bg-gradient-to-br from-slate-100 to-transparent" 
              />
            )}
            <div className="relative z-10">
              <div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-[20px] transition-colors ${
                mode === 'api' ? 'bg-[#1E293B] text-white' : 'bg-slate-200 text-slate-500'
              }`}>
                <MaterialIcon name="key" className="text-[24px]" />
              </div>
              <h3 className="font-display text-[20px] font-bold text-[#1E293B]">Llave API Propia</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
                Usa tu propia cuenta de OpenAI o OpenRouter. Ideal si ya tenés créditos o suscripciones.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <span className="inline-flex rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Avanzado
                </span>
              </div>
            </div>
          </button>
        </div>

        {/* Active Mode Form Section */}
        <AnimatePresence mode="wait">
          {mode === 'wallet' ? (
            <motion.div
              key="wallet-form"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="rounded-[40px] bg-white p-10 shadow-2xl shadow-slate-200/40"
            >
              <div className="grid gap-12 lg:grid-cols-2">
                {/* Status Column */}
                <div className="space-y-8">
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400 mb-4">Estado Actual</h4>
                    <div className="rounded-[24px] bg-[#FAFAF9] p-6 border border-slate-100">
                      <div className="flex items-center justify-between mb-4">
                        <span className={`h-3 w-3 rounded-full ${wallet?.connected ? 'bg-[#A7F3D0]' : 'bg-slate-300'}`} />
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                          {wallet?.connected ? 'Conectada' : 'No enlazada'}
                        </span>
                      </div>
                      <p className="font-display text-[32px] font-bold text-[#1E293B]">
                        {isWalletLoading ? '...' : formatCurrency(wallet?.balanceSats)} <span className="text-[14px] text-slate-400">sats</span>
                      </p>
                      <p className="text-[13px] text-slate-400 mt-1">Saldo disponible para nuevos planes</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 bg-[#E9D5FF]/20 p-4 rounded-[20px] text-[13px] text-[#4C1D95]">
                    <MaterialIcon name="bolt" className="text-[20px]" />
                    <p>Usa NWC para una conexión segura sin ceder el control de tus fondos.</p>
                  </div>
                </div>

                {/* Connection Column */}
                <div className="space-y-6">
                  <h4 className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400">Conectar Billetera</h4>
                  <div className="relative">
                    <input
                      type="password"
                      placeholder="nwc://..."
                      value={relayUrl}
                      onChange={(e) => setRelayUrl(e.target.value)}
                      className="w-full h-16 rounded-[20px] bg-[#FAFAF9] px-6 text-[15px] outline-none focus:ring-2 focus:ring-[#A7F3D0] transition-all"
                    />
                    <MaterialIcon name="link" className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300" />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleWalletConnect}
                      disabled={walletStatus === 'connecting' || !relayUrl}
                      className="flex-1 h-14 bg-[#1E293B] text-white rounded-[18px] font-bold flex items-center justify-center gap-2 hover:-translate-y-0.5 transition-transform disabled:opacity-50"
                    >
                      <span>{walletStatus === 'connecting' ? 'Enlazando...' : 'Enlazar Billetera'}</span>
                      <MaterialIcon name="arrow_forward" className="text-[18px]" />
                    </button>
                    {wallet?.connected && (
                      <button
                        onClick={async () => { await browserLapClient.wallet.disconnect(); fetchWallet(); }}
                        className="w-14 h-14 border-2 border-slate-100 flex items-center justify-center rounded-[18px] text-slate-400 hover:bg-red-50 hover:text-red-400 transition-colors"
                      >
                        <MaterialIcon name="link_off" />
                      </button>
                    )}
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
              className="rounded-[40px] bg-white p-10 shadow-2xl shadow-slate-200/40"
            >
              <div className="mb-10 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-slate-100">
                  <MaterialIcon name="dns" className="text-slate-500" />
                </div>
                <div>
                  <h4 className="font-display text-[20px] font-bold text-[#1E293B]">Credenciales de API</h4>
                  <p className="text-[13px] text-slate-500">Configurá el acceso a los modelos de lenguaje.</p>
                </div>
              </div>

              <div className="grid gap-8">
                <div className="grid gap-6 md:grid-cols-2">
                  <label className="block space-y-3">
                    <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400 ml-1">Proveedor</span>
                    <div className="relative">
                      <div className="h-16 flex items-center justify-between px-6 bg-[#FAFAF9] rounded-[20px] text-slate-500">
                        <span>OpenAI</span>
                        <MaterialIcon name="expand_more" />
                      </div>
                    </div>
                  </label>
                  <label className="block space-y-3">
                    <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400 ml-1">Llave API</span>
                    <div className="relative">
                      <input
                        type="password"
                        placeholder={apiConfigured ? "•••••••••••••••• (Activa)" : "sk-..."}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="w-full h-16 rounded-[20px] bg-[#FAFAF9] px-6 text-[15px] outline-none focus:ring-2 focus:ring-slate-200 transition-all"
                      />
                    </div>
                  </label>
                </div>

                <div className="flex flex-col gap-4">
                  {apiStatus === 'success' && <div className="text-center text-emerald-500 text-sm font-bold">API actualizada con éxito</div>}
                  {apiStatus === 'error' && <div className="text-center text-red-500 text-sm font-bold">{errorMsg}</div>}
                  <button
                    onClick={handleApiSave}
                    disabled={apiStatus === 'saving' || (!apiKey && !apiConfigured)}
                    className="h-16 bg-[#1E293B] text-white rounded-[20px] font-bold text-[16px] flex items-center justify-center gap-3 hover:-translate-y-0.5 transition-transform shadow-lg shadow-slate-200"
                  >
                    <span>{apiStatus === 'saving' ? 'Guardando...' : 'Guardar Configuración'}</span>
                    <MaterialIcon name="save" className="text-[20px]" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MockupShell>
  )
}
