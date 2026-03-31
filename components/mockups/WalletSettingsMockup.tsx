'use client'

import { useState, useEffect } from 'react'
import { t } from '@/src/i18n'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
import { MockupShell } from '../midnight-mint/MockupShell'
import { browserLapClient } from '@/src/lib/client/browser-http-client'
import type { WalletStatus } from '@/src/shared/types/lap-api'
export default function WalletSettingsMockup() {
  const [wallet, setWallet] = useState<WalletStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [relayUrl, setRelayUrl] = useState('')
  const [connectStatus, setConnectStatus] = useState<'idle' | 'connecting' | 'success' | 'error'>('idle')

  const fetchWallet = () => {
    setIsLoading(true)
    browserLapClient.wallet.status()
      .then((data) => setWallet(data))
      .catch((err) => console.error('Error fetching wallet:', err))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    fetchWallet()
  }, [])

  const handleConnect = async () => {
    if (!relayUrl) return
    setConnectStatus('connecting')
    try {
      await browserLapClient.wallet.connect(relayUrl)
      setConnectStatus('success')
      setRelayUrl('')
      fetchWallet()
      setTimeout(() => setConnectStatus('idle'), 2000)
    } catch (e) {
      setConnectStatus('error')
      setTimeout(() => setConnectStatus('idle'), 3000)
    }
  }

  const handleDisconnect = async () => {
    if (wallet?.connected) {
      await browserLapClient.wallet.disconnect()
      fetchWallet()
    } else {
      setRelayUrl('')
    }
  }

  const formatCurrency = (amount: number | undefined) => 
    amount !== undefined ? new Intl.NumberFormat('es-AR').format(amount) : '0'

  return (
    <MockupShell
      sidebarLabel={t('mockups.common.digital_sanctuary')}
      sidebarNav={[
        { label: t('mockups.wallet.nav.dashboard'), icon: 'dashboard', href: '/' },
        { label: t('mockups.wallet.nav.calendar'), icon: 'calendar_today', href: '/plan?view=month' },
        { label: t('mockups.wallet.nav.tasks'), icon: 'check_circle', href: '/flow?variant=tasks' },
        { label: t('mockups.wallet.nav.notes'), icon: 'description', href: '/flow?variant=spatial' },
        { label: t('mockups.wallet.nav.focus'), icon: 'center_focus_strong', href: '/flow?variant=simulation' },
        { label: t('mockups.wallet.nav.settings'), icon: 'settings', active: true, href: '/settings?section=wallet' }
      ]}
      sidebarPrimaryAction={{ label: t('mockups.wallet.sidebar_action'), icon: 'add', href: '/flow' }}
      sidebarFooter={[
        { label: t('mockups.common.help'), icon: 'help', href: '#' },
        { label: t('mockups.common.exit'), icon: 'logout', href: '#' }
      ]}
      topTabs={[
        { label: t('mockups.wallet.tabs.dashboard'), href: '/' },
        { label: t('mockups.wallet.tabs.calendar'), href: '/plan?view=month' },
        { label: t('mockups.wallet.tabs.settings'), active: true, href: '/settings?section=wallet' }
      ]}
      topRight={(
        <>
          <div className="flex h-9 w-[200px] items-center rounded-full bg-slate-100/70 px-4 text-[14px] text-slate-400 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <MaterialIcon name="search" className="mr-2 text-[18px]" />
            <span>{t('mockups.common.search')}</span>
          </div>
          <button type="button" className="text-slate-500"><MaterialIcon name="notifications" className="text-[20px]" /></button>
          <button type="button" className="text-slate-500"><MaterialIcon name="account_circle" className="text-[20px]" /></button>
          <div className="h-8 w-8 rounded-full bg-[linear-gradient(135deg,#0F172A,#1E293B)]" />
        </>
      )}
      contentClassName="px-8"
    >
      <div className="mx-auto w-full max-w-[1300px]">
        <div className="mb-8">
          <h1 className="font-display text-[32px] font-bold tracking-tight text-[#334155]">{t('mockups.wallet.title')}</h1>
          <p className="mt-3 max-w-3xl text-[16px] leading-7 text-slate-500">{t('mockups.wallet.copy')}</p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-6">
            <article className="rounded-[24px] bg-white p-6 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#1E293B] text-white">
                  <MaterialIcon name="account_balance_wallet" className="text-[18px]" />
                </div>
                <span className="rounded-full bg-[#A7F3D0]/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#166534]">
                  {t('mockups.wallet.online')}
                </span>
              </div>
              <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{t('mockups.wallet.balance_label')}</p>
              <p className="mt-1 font-display text-[32px] font-bold text-[#334155]">
                {isLoading ? '...' : formatCurrency(wallet?.balanceSats)} <span className="text-[14px]">sats</span>
              </p>
              <p className="mt-1 text-[12px] text-slate-400">≈ ${(wallet?.balanceSats ? (wallet.balanceSats * 0.0006).toFixed(2) : '0.00')} USD</p>
            </article>

            <article className="rounded-[24px] bg-white p-6 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] opacity-50 cursor-not-allowed">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{t('mockups.wallet.transactions_label')}</p>
              <div className="mt-4 flex items-end justify-between">
                <p className="font-display text-[24px] font-bold text-slate-300">Pronto</p>
                <MaterialIcon name="pending" className="text-[20px] text-slate-300" />
              </div>
              <p className="mt-2 text-[12px] text-slate-400">Integración futura</p>
            </article>
          </div>

          <section className="rounded-[28px] bg-white p-8 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <div className="mb-8 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#E9D5FF]/50 text-[#7C3AED]">
                <MaterialIcon name="bolt" className="text-[24px]" />
              </div>
              <div>
                <h2 className="font-display text-[24px] font-bold text-[#334155]">{t('mockups.wallet.connect_title')}</h2>
                <p className="text-[14px] text-slate-500">{t('mockups.wallet.connect_copy')}</p>
              </div>
              <div className="ml-auto rounded-full bg-[#F8FAFC] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                {t('mockups.wallet.required')}
              </div>
            </div>

            <label className="block space-y-3">
              <span className="ml-0.5 font-display text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{t('mockups.wallet.secret_label')}</span>
              <div className="relative">
                <input
                  className="h-16 w-full rounded-[18px] border-0 bg-[#FAFAF9] px-4 pr-12 tracking-[0.5em] text-slate-600 outline-none transition focus:ring-2 focus:ring-[#1E293B]/10 disabled:opacity-50"
                  placeholder={wallet?.connected ? (wallet.alias || 'Conectada') : 'nwc://...'}
                  value={relayUrl}
                  onChange={(e) => setRelayUrl(e.target.value)}
                  type="password"
                  disabled={connectStatus === 'connecting'}
                />
                <MaterialIcon name="visibility" className="absolute right-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
              </div>
            </label>

            <div className="mt-4 rounded-[18px] bg-[#FFF7ED] px-4 py-4 text-[13px] leading-6 text-[#B45309]">
              <MaterialIcon name="info" className="mr-2 inline-block text-[18px]" />
              {t('mockups.wallet.warning')}
            </div>

            <div className="mt-6 flex flex-col gap-3 md:flex-row">
              <button 
                type="button" 
                onClick={handleConnect}
                disabled={connectStatus === 'connecting' || !relayUrl}
                className="group inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-[18px] bg-[#1E293B] px-6 font-display text-[14px] font-bold text-white transition hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0"
              >
                <span>
                  {connectStatus === 'connecting' ? 'Conectando...' : 
                   connectStatus === 'success' ? 'Conectada' : 
                   connectStatus === 'error' ? 'Error al conectar' : 
                   t('mockups.wallet.primary')}
                </span>
                {connectStatus !== 'connecting' && <MaterialIcon name="arrow_forward" className="text-[18px] transition-transform group-hover:translate-x-1" />}
              </button>
              <button 
                type="button" 
                onClick={handleDisconnect}
                disabled={connectStatus === 'connecting'}
                className="h-14 rounded-[18px] border border-slate-200 bg-white px-6 font-display text-[14px] font-bold text-[#334155] transition hover:bg-slate-50 disabled:opacity-50"
              >
                {wallet?.connected ? 'Desconectar' : t('mockups.wallet.secondary')}
              </button>
            </div>

            <div className="mt-8 rounded-[18px] border border-[#A7F3D0]/40 bg-[#A7F3D0]/20 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full bg-[#A7F3D0]" />
                  <div>
                    <p className="text-[14px] font-semibold text-[#166534]">{t('mockups.wallet.status_title')}</p>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#166534]/70">{t('mockups.wallet.status_copy')}</p>
                  </div>
                </div>
                <button type="button" onClick={() => {}} className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                  {t('mockups.wallet.details')}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </MockupShell>
  )
}
