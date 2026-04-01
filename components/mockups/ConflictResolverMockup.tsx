'use client'

import { useRouter } from 'next/navigation'
import { t } from '@/src/i18n'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
import { MockupOrchestrator as MockupShell } from '../midnight-mint/MockupOrchestrator'

export default function ConflictResolverMockup() {
  const router = useRouter()
  const sidebar = [
    { label: t('mockups.flow.conflict.nav.dashboard'), icon: 'dashboard', href: '/' },
    { label: t('mockups.flow.conflict.nav.calendar'), icon: 'calendar_today', active: true, href: '/flow' },
    { label: t('mockups.flow.conflict.nav.tasks'), icon: 'check_circle', href: '/flow?variant=tasks' },
    { label: t('mockups.flow.conflict.nav.notes'), icon: 'description', href: '/flow?variant=spatial' },
    { label: t('mockups.flow.conflict.nav.focus'), icon: 'center_focus_strong', href: '/flow?variant=simulation' },
    { label: t('mockups.flow.conflict.nav.settings'), icon: 'settings', href: '/settings' }
  ]

  const cards = [
    {
      border: 'border-[#FCA5A5]/30',
      iconBg: 'bg-[#E9D5FF]/80',
      icon: 'bolt',
      title: t('mockups.flow.conflict.ambitious.title'),
      subtitle: t('mockups.flow.conflict.ambitious.subtitle'),
      stats: [
        [t('mockups.flow.conflict.rest'), '5.5h', t('mockups.flow.conflict.rest_hint')],
        [t('mockups.flow.conflict.completed_tasks'), '12', t('mockups.flow.conflict.completed_hint')],
        [t('mockups.flow.conflict.load'), t('mockups.flow.conflict.load_critical'), '']
      ],
      bar: 'bg-[#EF4444]',
      quote: t('mockups.flow.conflict.ambitious.quote'),
      button: t('mockups.flow.conflict.choose_ambitious'),
      buttonTone: 'bg-white text-[#334155] border border-slate-900/80'
    },
    {
      border: 'border-[#A7F3D0]',
      iconBg: 'bg-[#A7F3D0]/80',
      icon: 'eco',
      title: t('mockups.flow.conflict.realistic.title'),
      subtitle: t('mockups.flow.conflict.realistic.subtitle'),
      stats: [
        [t('mockups.flow.conflict.rest'), '7.5h', t('mockups.flow.conflict.rest_optimal')],
        [t('mockups.flow.conflict.completed_tasks'), '8', t('mockups.flow.conflict.completed_proposals')],
        [t('mockups.flow.conflict.load'), t('mockups.flow.conflict.load_healthy'), '']
      ],
      bar: 'bg-[#A7F3D0]',
      quote: t('mockups.flow.conflict.realistic.quote'),
      button: t('mockups.flow.conflict.choose_realistic'),
      buttonTone: 'bg-[#1E293B] text-white'
    }
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
        { label: t('mockups.flow.conflict.top_tabs.dashboard'), href: '/' },
        { label: t('mockups.flow.conflict.top_tabs.planner'), active: true, href: '/flow' },
        { label: t('mockups.flow.conflict.top_tabs.tasks'), href: '/flow?variant=tasks' }
      ]}
      topRight={(
        <>
          <button type="button" onClick={() => router.push('/settings')} className="text-slate-500 transition hover:text-[#334155]"><MaterialIcon name="notifications" className="text-[20px]" /></button>
          <button type="button" onClick={() => router.push('/settings')} className="h-8 w-8 rounded-full bg-[linear-gradient(135deg,#C4B5FD,#FDBA74)] transition hover:ring-2 hover:ring-[#1E293B]/20" />
        </>
      )}
    >
      <div className="mx-auto w-full max-w-[1300px]">
        <div className="mb-8">
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">{t('mockups.flow.conflict.eyebrow')}</p>
          <h1 className="mt-4 font-display text-[32px] font-bold tracking-tight text-[#334155]">{t('mockups.flow.conflict.title')}</h1>
          <p className="mt-3 max-w-3xl text-[16px] leading-7 text-slate-500">{t('mockups.flow.conflict.copy')}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {cards.map((card, index) => (
            <article
              key={card.title}
              className={`rounded-[24px] bg-white p-8 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] ${index === 0 ? 'border border-[#FCA5A5]/30' : 'border border-[#A7F3D0]'}`}
            >
              {index === 1 && (
                <div className="mb-4 flex justify-end">
                  <span className="rounded-full bg-[#A7F3D0] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#166534]">
                    {t('mockups.flow.conflict.recommended')}
                  </span>
                </div>
              )}
              <div className="flex items-start gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full ${card.iconBg} text-[#334155]`}>
                  <MaterialIcon name={card.icon} className="text-[20px]" />
                </div>
                <div>
                  <h2 className="font-display text-[24px] font-bold text-[#334155]">{card.title}</h2>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{card.subtitle}</p>
                </div>
              </div>

              <div className="mt-8 space-y-5">
                {card.stats.map(([label, value, hint]) => (
                  <div key={label} className="grid grid-cols-[1fr_auto] items-center gap-4">
                    <div>
                      <p className="text-[14px] text-slate-500">{label}</p>
                      {hint && <p className="text-[12px] text-slate-400">{hint}</p>}
                    </div>
                    <strong className="font-display text-[18px] font-bold text-[#334155]">{value}</strong>
                  </div>
                ))}
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full w-[82%] rounded-full ${card.bar}`} />
                </div>
              </div>

              <div className={`mt-8 rounded-[18px] p-4 text-[14px] leading-7 ${index === 0 ? 'bg-[#F8FAFC]' : 'bg-[#A7F3D0]/20'}`}>
                <em className="text-slate-500">{card.quote}</em>
              </div>

              <button 
                type="button" 
                onClick={() => {
                  localStorage.setItem('lap-scenario', index === 0 ? 'ambitious' : 'realistic')
                  router.push('/plan?view=week')
                }}
                className={`mt-8 inline-flex h-14 w-full items-center justify-center gap-2 rounded-[18px] px-6 font-display text-[14px] font-bold transition hover:-translate-y-0.5 ${card.buttonTone}`}
              >
                <span>{card.button}</span>
                <MaterialIcon name="arrow_forward" className="text-[18px]" />
              </button>
            </article>
          ))}
        </div>
      </div>
    </MockupShell>
  )
}
