'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { t } from '@/src/i18n'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
import { MockupShell } from '../midnight-mint/MockupShell'
import { browserLapClient } from '@/src/lib/client/browser-http-client'
import type { WalletStatus } from '@/src/shared/types/lap-api'

export default function SimulationCostMockup() {
  const [wallet, setWallet] = useState<WalletStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    browserLapClient.wallet.status()
      .then(setWallet)
      .catch((err) => console.error('Error fetching cost stats:', err))
      .finally(() => setIsLoading(false))
  }, [])
  const sidebar = [
    { label: t('mockups.flow.simulation.nav.dashboard'), icon: 'dashboard', href: '/' },
    { label: t('mockups.flow.simulation.nav.calendar'), icon: 'calendar_today', active: true, href: '/flow' },
    { label: t('mockups.flow.simulation.nav.tasks'), icon: 'check_circle', href: '/flow?variant=tasks' },
    { label: t('mockups.flow.simulation.nav.notes'), icon: 'description', href: '/flow?variant=spatial' },
    { label: t('mockups.flow.simulation.nav.focus'), icon: 'center_focus_strong', href: '/flow?variant=simulation' },
    { label: t('mockups.flow.simulation.nav.settings'), icon: 'settings', href: '/settings' }
  ]

  return (
    <MockupShell
      sidebarLabel={t('mockups.common.digital_sanctuary')}
      sidebarNav={sidebar}
      sidebarPrimaryAction={{ label: t('mockups.common.new_entry'), icon: 'add', href: '/flow' }}
      sidebarFooter={[
        { label: t('mockups.common.help'), icon: 'help', href: '#' },
        { label: t('mockups.common.exit'), icon: 'logout', href: '#' }
      ]}
      topTabs={[
        { label: t('mockups.flow.simulation.top_tabs.panel'), href: '/' },
        { label: t('mockups.flow.simulation.top_tabs.planner'), active: true, href: '/flow' },
        { label: t('mockups.flow.simulation.top_tabs.tasks'), href: '/flow?variant=tasks' }
      ]}
      topRight={(
        <>
          <button type="button" onClick={() => router.push('/settings')} className="text-slate-500 transition hover:text-[#334155]"><MaterialIcon name="notifications" className="text-[20px]" /></button>
          <button type="button" onClick={() => router.push('/settings')} className="h-8 w-8 rounded-full bg-[linear-gradient(135deg,#0F172A,#475569)] transition hover:ring-2 hover:ring-[#1E293B]/20" />
        </>
      )}
    >
      <div className="mx-auto w-full max-w-[1300px]">
        <div className="mb-8">
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">{t('mockups.flow.simulation.eyebrow')}</p>
          <h1 className="mt-4 font-display text-[32px] font-bold tracking-tight text-[#334155]">{t('mockups.flow.simulation.title')}</h1>
          <p className="mt-3 max-w-3xl text-[16px] leading-7 text-slate-500">{t('mockups.flow.simulation.copy')}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="space-y-6">
            <section className="rounded-[24px] bg-white p-8 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <div className="mb-6 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#A7F3D0]" />
                <h2 className="font-display text-[18px] font-bold text-[#334155]">{t('mockups.flow.simulation.parameters')}</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{t('mockups.flow.simulation.priority')}</span>
                  <div className="flex h-14 items-center justify-between rounded-[16px] bg-[#FAFAF9] px-4 text-[15px] text-slate-500">
                    <span>{t('mockups.flow.simulation.priority_value')}</span>
                    <MaterialIcon name="expand_more" className="text-[18px] text-slate-400" />
                  </div>
                </label>
                <label className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{t('mockups.flow.simulation.destination')}</span>
                  <div className="flex h-14 items-center justify-between rounded-[16px] bg-[#FAFAF9] px-4 text-[15px] text-slate-500">
                    <span>{t('mockups.flow.simulation.destination_value')}</span>
                    <MaterialIcon name="expand_more" className="text-[18px] text-slate-400" />
                  </div>
                </label>
              </div>
            </section>

            <section className="rounded-[24px] bg-white p-8 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#E9D5FF]" />
                  <h2 className="font-display text-[18px] font-bold text-[#334155]">{t('mockups.flow.simulation.monitor')}</h2>
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{t('mockups.flow.simulation.active_count')}</span>
              </div>
              <div className="space-y-4">
                {[
                  { title: t('mockups.flow.simulation.monitor_1_title'), copy: t('mockups.flow.simulation.monitor_1_copy'), status: t('mockups.flow.simulation.ready') },
                  { title: t('mockups.flow.simulation.monitor_2_title'), copy: t('mockups.flow.simulation.monitor_2_copy'), status: 'Desconectado' },
                  { title: t('mockups.flow.simulation.monitor_3_title'), copy: t('mockups.flow.simulation.monitor_3_copy'), status: t('mockups.flow.simulation.pending') }
                ].map((item, index) => (
                  <div
                    key={item.title}
                    className={`flex items-center gap-4 rounded-[18px] p-4 ${index === 0 ? 'bg-[#A7F3D0]/10' : 'bg-white'} ${index === 1 ? 'border-t border-slate-100' : ''}`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#334155] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                      <MaterialIcon name={index === 0 ? 'check_circle' : index === 1 ? 'settings' : 'more_horiz'} className="text-[18px]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-[#334155]">{item.title}</p>
                      <p className="text-[13px] text-slate-400">{item.copy}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] ${index === 0 ? 'bg-[#A7F3D0]/20 text-[#166534]' : index === 1 ? 'bg-[#E9D5FF]/20 text-[#7C3AED]' : 'bg-slate-100 text-slate-400'}`}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-[24px] bg-white p-8 text-center shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[20px] bg-[#1E293B] text-white">
                <MaterialIcon name="deployed_code" className="text-[28px]" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{t('mockups.flow.simulation.budget_label')}</p>
              <h2 className="mt-2 font-display text-[24px] font-bold text-[#334155]">{t('mockups.flow.simulation.cost_title')}</h2>
              <div className="mt-4 inline-flex rounded-[16px] bg-[#1E293B] px-4 py-3 font-display text-[32px] font-bold text-white">
                {isLoading ? '...' : (wallet?.planBuildChargeSats ?? 45)}
                <span className="ml-2 text-[12px] font-bold uppercase tracking-[0.22em] text-slate-300">sats</span>
              </div>
              <div className="mt-6 space-y-3 text-left text-[14px] text-slate-500">
                <div className="flex justify-between"><span>{t('mockups.flow.simulation.fee')}</span><span>12 sats</span></div>
                <div className="flex justify-between"><span>{t('mockups.flow.simulation.ai_processing')}</span><span>{isLoading ? '...' : (wallet?.planBuildChargeSats ? wallet.planBuildChargeSats - 12 : 33)} sats</span></div>
                <div className="flex justify-between border-t border-slate-100 pt-3 font-semibold text-[#334155]"><span>{t('mockups.flow.simulation.total')}</span><span>{isLoading ? '...' : (wallet?.planBuildChargeSats ?? 45)} sats</span></div>
              </div>
              <button type="button" className="group mt-8 inline-flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-[#1E293B] px-6 font-display text-[14px] font-bold text-white transition hover:-translate-y-0.5">
                <span>{t('mockups.flow.simulation.generate')}</span>
                <MaterialIcon name="rocket_launch" className="text-[18px] transition-transform group-hover:translate-x-1" />
              </button>
              <p className="mt-4 text-[12px] leading-6 text-slate-400">{t('mockups.flow.simulation.note')}</p>
            </section>

            <section className="rounded-[20px] bg-white p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#A7F3D0]/20 text-[#166534]">
                  <MaterialIcon name="bolt" className="text-[18px]" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{t('mockups.flow.simulation.network')}</p>
                  <p className="text-[14px] font-semibold text-[#334155]">{t('mockups.flow.simulation.network_value')}</p>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </MockupShell>
  )
}
