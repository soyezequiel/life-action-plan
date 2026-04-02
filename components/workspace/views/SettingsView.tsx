'use client'

import React from 'react'
import { startTransition, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'

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
  const [hasHydrated, setHasHydrated] = useState(false)
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
    setHasHydrated(true)
  }, [])

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
          shouldFetchApiStatus ? browserLapClient.settings.apiKeyStatus('openai') : Promise.resolve({ configured: false })
        ])

        if (!isMounted) {
          return
        }

        if (nextWallet) {
          setWallet(nextWallet)
        }

        if (nextApiConfigured.configured) {
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

  const handleWalletDisconnect = async () => {
    await browserLapClient.wallet.disconnect()
    fetchWallet()
    startTransition(() => {
      void refreshStatus()
    })
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
      setErrorMsg(data.error || t('settings.save_error'))
    } catch {
      setApiStatus('error')
      setErrorMsg(t('errors.network_unavailable'))
    }
  }

  const formatCurrency = (amount: number | undefined) => (
    amount !== undefined ? new Intl.NumberFormat('es-AR').format(amount) : '0'
  )

  const showReadyPanel = hasHydrated && onboardingStep !== 'SETUP' && onboardingStep !== 'LOADING'

  return (
    <div className="mx-auto w-full max-w-[1080px] py-4">
      <header className="mb-10 text-center">
        <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{t('settings.product_kicker')}</span>
        <h1 className="mt-3 font-display text-[36px] font-bold tracking-tight text-[#1f2937]">
          {t('settings.product_title')}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-[1.6] text-slate-500">
          {t('settings.product_copy')}
        </p>
      </header>

      {showReadyPanel ? (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 overflow-hidden rounded-[30px] border border-[#0f766e]/15 bg-[rgba(15,118,110,0.08)] p-1 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.16)] backdrop-blur-2xl"
        >
          <div className="flex flex-col items-center justify-between gap-6 px-8 py-7 md:flex-row">
            <div className="flex items-center gap-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1f2937] text-[#A7F3D0]">
                <MaterialIcon name="auto_awesome" className="text-[24px]" />
              </div>
              <div className="text-left">
                <h3 className="font-display text-[22px] font-bold text-[#064E3B]">{t('settings.ready_title')}</h3>
                <p className="text-[15px] text-[#064E3B]/70">{t('settings.ready_copy')}</p>
              </div>
            </div>
            <Link
              href="/intake"
              className="inline-flex h-14 items-center justify-center gap-3 rounded-[20px] bg-[#1f2937] px-8 font-display text-[15px] font-bold text-white shadow-xl shadow-slate-900/10 transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <span>{t('settings.ready_cta')}</span>
              <MaterialIcon name="arrow_forward" className="text-[20px]" />
            </Link>
          </div>
        </motion.div>
      ) : null}

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode('wallet')}
          className={`group relative overflow-hidden rounded-[30px] border-2 p-7 text-left transition-all duration-300 ${
            mode === 'wallet'
              ? 'border-[#0f766e]/20 bg-[rgba(255,253,249,0.96)] shadow-xl shadow-slate-200/40'
              : 'border-transparent bg-[rgba(255,253,249,0.72)] hover:bg-[rgba(255,253,249,0.92)] hover:shadow-lg'
          }`}
        >
          <div className="relative z-10">
            <div className={`mb-5 flex h-14 w-14 items-center justify-center rounded-[20px] transition-colors ${
              mode === 'wallet' ? 'bg-[#1f2937] text-[#A7F3D0]' : 'bg-slate-200 text-slate-500'
            }`}>
              <MaterialIcon name="account_balance_wallet" className="text-[24px]" />
            </div>
            <h3 className="font-display text-[20px] font-bold text-[#1f2937]">{t('settings.wallet_mode_title')}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-slate-500">{t('settings.wallet_mode_copy')}</p>
            <span className="mt-4 inline-flex rounded-full bg-[#A7F3D0] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#064E3B]">
              {t('settings.wallet_mode_badge')}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMode('api')}
          className={`group relative overflow-hidden rounded-[30px] border-2 p-7 text-left transition-all duration-300 ${
            mode === 'api'
              ? 'border-[#334155]/20 bg-[rgba(255,253,249,0.96)] shadow-xl shadow-slate-200/40'
              : 'border-transparent bg-[rgba(255,253,249,0.72)] hover:bg-[rgba(255,253,249,0.92)] hover:shadow-lg'
          }`}
        >
          <div className="relative z-10">
            <div className={`mb-5 flex h-14 w-14 items-center justify-center rounded-[20px] transition-colors ${
              mode === 'api' ? 'bg-[#1f2937] text-white' : 'bg-slate-200 text-slate-500'
            }`}>
              <MaterialIcon name="key" className="text-[24px]" />
            </div>
            <h3 className="font-display text-[20px] font-bold text-[#1f2937]">{t('settings.api_mode_title')}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-slate-500">{t('settings.api_mode_copy')}</p>
            <span className="mt-4 inline-flex rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {t('settings.api_mode_badge')}
            </span>
          </div>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {mode === 'wallet' ? (
          <motion.section
            key="wallet-form"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="rounded-[34px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.92)] p-8 shadow-[0_26px_58px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl"
          >
            <div className="grid gap-10 lg:grid-cols-2">
              <div className="space-y-7">
                <div>
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400">{t('settings.wallet_status_label')}</h2>
                  <div className="mt-4 rounded-[24px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.96)] p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <span className={`h-3 w-3 rounded-full ${wallet?.connected ? 'bg-[#A7F3D0]' : 'bg-slate-300'}`} />
                      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                        {wallet?.connected ? t('settings.wallet_connected_state') : t('settings.wallet_disconnected_state')}
                      </span>
                    </div>
                    <p className="font-display text-[32px] font-bold text-[#1E293B]">
                      {isWalletLoading ? t('ui.loading') : `${formatCurrency(wallet?.balanceSats)} sats`}
                    </p>
                    <p className="mt-1 text-[13px] text-slate-400">{t('settings.wallet_balance_hint')}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 rounded-[20px] bg-[#E9D5FF]/20 p-4 text-[13px] text-[#4C1D95]">
                  <MaterialIcon name="bolt" className="text-[20px]" />
                  <p>{t('settings.wallet_security_hint')}</p>
                </div>
              </div>

              <div className="space-y-6">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400">{t('settings.wallet_title')}</h2>
                <div className="relative">
                  <input
                    type="password"
                    placeholder={t('settings.wallet_placeholder')}
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
                    <span>{walletStatus === 'connecting' ? t('settings.wallet_connecting') : t('settings.wallet_confirm')}</span>
                    <MaterialIcon name="arrow_forward" className="text-[18px]" />
                  </button>
                  {wallet?.connected ? (
                    <button
                      type="button"
                      onClick={() => void handleWalletDisconnect()}
                      className="flex h-14 w-14 items-center justify-center rounded-[18px] border-2 border-slate-100 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-400"
                      aria-label={t('settings.wallet_disconnect')}
                    >
                      <MaterialIcon name="link_off" />
                    </button>
                  ) : null}
                </div>
                {walletStatus === 'success' ? <p className="text-sm font-bold text-emerald-600">{t('settings.wallet_success')}</p> : null}
                {walletStatus === 'error' ? <p className="text-sm font-bold text-red-600">{t('settings.wallet_error')}</p> : null}
              </div>
            </div>
          </motion.section>
        ) : (
          <motion.section
            key="api-form"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="rounded-[34px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.92)] p-8 shadow-[0_26px_58px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl"
          >
            <div className="mb-8 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-slate-100">
                <MaterialIcon name="dns" className="text-slate-500" />
              </div>
              <div>
                <h2 className="font-display text-[20px] font-bold text-[#1E293B]">{t('settings.api_credentials_title')}</h2>
                <p className="text-[13px] text-slate-500">{t('settings.api_credentials_copy')}</p>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <label className="block space-y-3">
                <span className="ml-1 text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400">{t('settings.api_provider_label')}</span>
                <div className="flex h-16 items-center justify-between rounded-[20px] bg-[rgba(255,252,247,0.96)] px-6 text-slate-500">
                  <span>{t('settings.api_provider_name')}</span>
                  <MaterialIcon name="expand_more" />
                </div>
              </label>

              <label className="block space-y-3">
                <span className="ml-1 text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400">{t('settings.api_key_label')}</span>
                <input
                  type="password"
                  placeholder={apiConfigured ? t('settings.api_key_active_placeholder') : t('settings.apikey_placeholder')}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  className="h-16 w-full rounded-[20px] bg-[rgba(255,252,247,0.96)] px-6 text-[15px] outline-none transition-all focus:ring-2 focus:ring-[#0f766e]/10"
                />
              </label>
            </div>

            <div className="mt-8 flex flex-col gap-4">
              {apiStatus === 'success' ? <div className="text-center text-sm font-bold text-emerald-600">{t('settings.api_saved')}</div> : null}
              {apiStatus === 'error' ? <div className="text-center text-sm font-bold text-red-600">{errorMsg}</div> : null}
              <button
                type="button"
                onClick={() => void handleApiSave()}
                disabled={apiStatus === 'saving' || (!apiKey && !apiConfigured)}
                className="flex h-16 items-center justify-center gap-3 rounded-[20px] bg-[#1f2937] text-[16px] font-bold text-white shadow-lg shadow-slate-200 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
              >
                <span>{apiStatus === 'saving' ? t('settings.saving') : t('ui.save')}</span>
                <MaterialIcon name="save" className="text-[20px]" />
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}
