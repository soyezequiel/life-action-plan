'use client'

import { useState, useEffect } from 'react'
import { t } from '@/src/i18n'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
import { MockupShell } from '../midnight-mint/MockupShell'

export default function BackendSettingsMockup() {
  const [apiKey, setApiKey] = useState('')
  const [endpoint, setEndpoint] = useState('https://api.openai.com/v1')
  const [configured, setConfigured] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    fetch('/api/settings/api-key?provider=openai')
      .then(res => res.json())
      .then(data => {
        if (data.configured) setConfigured(true)
      })
      .catch(console.error)
  }, [])

  const handleSave = async () => {
    if (!apiKey && !configured) return
    setStatus('saving')
    setErrorMsg('')
    try {
      const res = await fetch('/api/settings/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openai', apiKey })
      })
      const data = await res.json()
      if (data.success) {
        setStatus('success')
        setConfigured(true)
        setApiKey('')
        setTimeout(() => setStatus('idle'), 3000)
      } else {
        setStatus('error')
        setErrorMsg(data.error || 'Error al guardar')
      }
    } catch {
      setStatus('error')
      setErrorMsg('Error de red')
    }
  }
  return (
    <MockupShell
      sidebarLabel={t('mockups.common.digital_sanctuary')}
      sidebarNav={[
        { label: t('mockups.settingsBackend.nav.dashboard'), icon: 'dashboard', href: '/' },
        { label: t('mockups.settingsBackend.nav.calendar'), icon: 'calendar_today', href: '/plan?view=month' },
        { label: t('mockups.settingsBackend.nav.tasks'), icon: 'check_circle', href: '/flow?variant=tasks' },
        { label: t('mockups.settingsBackend.nav.notes'), icon: 'description', href: '/flow?variant=spatial' },
        { label: t('mockups.settingsBackend.nav.focus'), icon: 'center_focus_strong', href: '/flow?variant=simulation' },
        { label: t('mockups.settingsBackend.nav.settings'), icon: 'settings', active: true, href: '/settings?section=backend' }
      ]}
      sidebarPrimaryAction={{ label: t('mockups.settingsBackend.sidebar_action'), icon: 'add', href: '/flow' }}
      sidebarFooter={[
        { label: t('mockups.common.help'), icon: 'help', href: '#' },
        { label: t('mockups.common.exit'), icon: 'logout', href: '#' }
      ]}
      topTabs={[
        { label: t('mockups.settingsBackend.tabs.dashboard'), href: '/' },
        { label: t('mockups.settingsBackend.tabs.calendar'), href: '/plan?view=month' },
        { label: t('mockups.settingsBackend.tabs.settings'), active: true, href: '/settings?section=backend' }
      ]}
      topRight={(
        <>
          <div className="flex h-9 w-[200px] items-center rounded-full bg-slate-100/70 px-4 text-[14px] text-slate-400 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <MaterialIcon name="search" className="mr-2 text-[18px]" />
            <span>{t('mockups.common.search')}</span>
          </div>
          <button type="button" className="text-slate-500"><MaterialIcon name="notifications" className="text-[20px]" /></button>
          <button type="button" className="text-slate-500"><MaterialIcon name="account_circle" className="text-[20px]" /></button>
          <div className="h-8 w-8 rounded-full bg-[linear-gradient(135deg,#C4B5FD,#F8FAFC)]" />
        </>
      )}
      contentClassName="px-8"
    >
      <div className="relative mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-[820px] items-center justify-center">
        <div className="pointer-events-none absolute -top-12 right-8 h-32 w-32 rounded-[32px] bg-[#E9D5FF]/20 blur-2xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-36 w-36 rounded-[40px] bg-[#A7F3D0]/20 blur-2xl" />

        <section className="w-full rounded-[32px] bg-white p-12 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
          <div className="mb-10 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-[20px] bg-[#E9D5FF]/50 text-[#4C1D95]">
              <MaterialIcon name="terminal" className="text-[28px]" />
            </div>
            <h1 className="font-display text-[32px] font-bold tracking-tight text-[#334155]">{t('mockups.settingsBackend.title')}</h1>
            <p className="mx-auto mt-3 max-w-md text-[14px] leading-6 text-slate-500">{t('mockups.settingsBackend.copy')}</p>
          </div>

          <div className="space-y-8">
            <label className="block space-y-3">
              <span className="ml-0.5 font-display text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{t('mockups.settingsBackend.endpoint_label')}</span>
              <div className="relative">
                <MaterialIcon name="dns" className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                <input
                  className="h-16 w-full rounded-[18px] border-0 bg-[#FAFAF9] pl-12 pr-4 text-[15px] text-[#334155] outline-none transition focus:ring-2 focus:ring-[#1E293B]/10"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                />
              </div>
            </label>

            <div className="grid gap-6 md:grid-cols-2">
              <label className="block space-y-3">
                <span className="ml-0.5 font-display text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{t('mockups.settingsBackend.model_label')}</span>
                <div className="relative">
                  <MaterialIcon name="model_training" className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                  <div className="flex h-16 items-center justify-between rounded-[18px] bg-[#FAFAF9] pl-12 pr-4 text-[15px] text-slate-500">
                    <span>GPT-4o</span>
                    <MaterialIcon name="expand_more" className="text-[18px] text-slate-400" />
                  </div>
                </div>
              </label>

              <label className="block space-y-3">
                <span className="ml-0.5 font-display text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{t('mockups.settingsBackend.api_label')}</span>
                <div className="relative">
                  <MaterialIcon name="key" className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                  <input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={configured ? "•••••••••••••••• (Configurado)" : "sk-..."}
                    className="h-16 w-full rounded-[18px] border-0 bg-[#FAFAF9] pl-12 pr-4 text-[15px] tracking-[0.2em] text-[#334155] placeholder-slate-400 outline-none transition focus:ring-2 focus:ring-[#1E293B]/10"
                    type="password"
                  />
                </div>
              </label>
            </div>

            <div className="flex items-center justify-between rounded-[20px] bg-[#FAFAF9] px-5 py-4">
              <div>
                <p className="text-[15px] font-semibold text-[#334155]">{t('mockups.settingsBackend.toggle_title')}</p>
                <p className="text-[11px] text-slate-400">{t('mockups.settingsBackend.toggle_copy')}</p>
              </div>
              <div className="relative h-7 w-12 rounded-full bg-[#1E293B]">
                <div className="absolute right-1 top-1 h-5 w-5 rounded-full bg-white" />
              </div>
            </div>

            <div className="space-y-4">
              {status === 'success' && <div className="rounded-[18px] bg-emerald-50 p-4 text-center text-sm text-emerald-600 font-semibold">Configuración guardada exitosamente</div>}
              {status === 'error' && <div className="rounded-[18px] bg-red-50 p-4 text-center text-sm text-red-600 font-semibold">{errorMsg}</div>}
              <button 
                type="button" 
                onClick={handleSave}
                disabled={status === 'saving'}
                className="group inline-flex h-16 w-full items-center justify-center gap-3 rounded-[18px] bg-[#1E293B] font-display text-[15px] font-bold text-white transition hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                <span>{status === 'saving' ? 'Guardando...' : t('mockups.settingsBackend.primary')}</span>
                <MaterialIcon name="arrow_forward" className="text-[18px] transition-transform group-hover:translate-x-1" />
              </button>
            </div>

            <p className="text-center text-[12px] text-slate-400">
              {t('mockups.settingsBackend.footer_prefix')}
              <button 
                type="button" 
                className="ml-1 font-semibold text-[#334155]"
                onClick={() => window.open('https://platform.openai.com/docs', '_blank')}
              >
                {t('mockups.settingsBackend.footer_link')}
              </button>
            </p>
          </div>
        </section>
      </div>
    </MockupShell>
  )
}
