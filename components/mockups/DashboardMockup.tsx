import { t } from '@/src/i18n'
import type { DeploymentMode } from '@/src/lib/env/deployment'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
import { MockupShell } from '../midnight-mint/MockupShell'

interface DashboardMockupProps {
  deploymentMode?: DeploymentMode
}

export default function DashboardMockup({ deploymentMode }: DashboardMockupProps) {
  void deploymentMode

  return (
    <MockupShell
      sidebarLabel={t('mockups.common.santuario_digital')}
      sidebarNav={[
        { label: t('dashboard.shell_nav.dashboard'), icon: 'dashboard', active: true, href: '/' },
        { label: t('dashboard.shell_nav.calendar'), icon: 'calendar_today', href: '/plan' },
        { label: t('dashboard.shell_nav.flow'), icon: 'check_circle', href: '/flow' },
        { label: t('dashboard.shell_nav.plan'), icon: 'description', href: '/plan?view=week' },
        { label: t('dashboard.shell_nav.system'), icon: 'settings', href: '/settings' }
      ]}
      sidebarPrimaryAction={{ label: t('mockups.common.new_entry'), icon: 'add', href: '/flow' }}
      sidebarFooter={[
        { label: t('mockups.common.help'), icon: 'help', href: '#' },
        { label: t('mockups.common.exit'), icon: 'logout', href: '#' }
      ]}
      topTabs={[
        { label: t('mockups.dashboard.top_tabs.panel'), active: true, href: '/' },
        { label: t('mockups.dashboard.top_tabs.projects'), href: '/flow' },
        { label: t('mockups.dashboard.top_tabs.team'), href: '/settings' }
      ]}
      topRight={(
        <>
          <div className="flex h-9 items-center rounded-full bg-slate-100/80 px-4 text-[14px] text-slate-400 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            {t('mockups.common.search')}
          </div>
          <button type="button" className="text-slate-500 transition hover:text-slate-700">
            <MaterialIcon name="notifications" className="text-[20px]" />
          </button>
          <button type="button" className="text-slate-500 transition hover:text-slate-700">
            <MaterialIcon name="account_circle" className="text-[20px]" />
          </button>
        </>
      )}
    >
      <div className="mx-auto w-full max-w-[1360px]">
        <header className="mb-10">
          <h1 className="font-display text-[32px] font-bold tracking-tight text-[#334155]">{t('mockups.dashboard.title')}</h1>
          <p className="mt-2 text-[15px] leading-7 text-slate-500">{t('mockups.dashboard.copy')}</p>
        </header>

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
          <section className="overflow-hidden rounded-[24px] bg-white p-8 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] xl:col-span-4">
            <div className="mb-8 flex items-center justify-between">
              <h2 className="font-display text-[18px] font-bold text-[#334155]">{t('mockups.dashboard.daily.title')}</h2>
              <MaterialIcon name="today" className="text-[20px] text-slate-400" />
            </div>

            <div className="space-y-6">
              <article className="border-l-4 border-[#A7F3D0] pl-4 py-1">
                <h3 className="text-[16px] font-semibold text-[#334155]">{t('mockups.dashboard.daily.review')}</h3>
                <p className="text-[12px] text-slate-500">{t('mockups.dashboard.daily.review_meta')}</p>
              </article>
              <article className="border-l-4 border-[#E9D5FF] pl-4 py-1 opacity-60">
                <h3 className="text-[16px] font-semibold text-[#334155]">{t('mockups.dashboard.daily.deep_work')}</h3>
                <p className="text-[12px] text-slate-500">{t('mockups.dashboard.daily.deep_work_meta')}</p>
              </article>
              <article className="border-l-4 border-[#1E293B]/10 pl-4 py-1">
                <h3 className="text-[16px] font-semibold text-[#334155]">{t('mockups.dashboard.daily.lunch')}</h3>
                <p className="text-[12px] text-slate-500">{t('mockups.dashboard.daily.lunch_meta')}</p>
              </article>
            </div>

            <div className="mt-8 border-t border-slate-100 pt-6">
              <div className="flex items-center gap-4 rounded-[18px] bg-[#FAFAF9] p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#A7F3D0]">
                  <MaterialIcon name="timer" className="text-[18px] text-[#334155]" />
                </div>
                <div>
                  <p className="text-[11px] font-display font-bold uppercase tracking-[0.22em] text-slate-400">
                    {t('mockups.dashboard.daily.focus_mode')}
                  </p>
                  <p className="font-display text-[15px] font-bold text-[#334155]">{t('mockups.dashboard.daily.remaining')}</p>
                </div>
              </div>
            </div>
          </section>

          <div className="xl:col-span-8">
            <section className="rounded-[24px] bg-white p-8 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <div className="mb-8 flex items-center justify-between">
                <h2 className="font-display text-[18px] font-bold text-[#334155]">{t('mockups.dashboard.checklist.title')}</h2>
                <div className="flex gap-2">
                  <span className="rounded bg-[#E9D5FF] px-2 py-1 text-[10px] font-display font-bold uppercase tracking-[0.2em] text-[#581C87]">
                    {t('mockups.dashboard.checklist.priority')}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-display font-bold uppercase tracking-[0.2em] text-slate-500">
                    {t('mockups.dashboard.checklist.active')}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="group flex items-center gap-4 rounded-[18px] border border-transparent p-4 transition hover:border-slate-100 hover:bg-slate-50">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-slate-200">
                    <MaterialIcon name="check" className="text-[14px] text-transparent group-hover:text-[#334155]" />
                  </div>
                  <h3 className="flex-1 text-[16px] text-[#334155]">{t('mockups.dashboard.checklist.task_1')}</h3>
                  <MaterialIcon name="drag_indicator" className="text-[18px] text-slate-300" />
                </div>
                <div className="group flex items-center gap-4 rounded-[18px] border border-transparent p-4 transition hover:border-slate-100 hover:bg-slate-50">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-slate-200" />
                  <h3 className="flex-1 text-[16px] text-[#334155]">{t('mockups.dashboard.checklist.task_2')}</h3>
                  <MaterialIcon name="drag_indicator" className="text-[18px] text-slate-300" />
                </div>
                <div className="flex items-center gap-4 rounded-[18px] border border-[#A7F3D0]/20 bg-[#A7F3D0]/10 p-4">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#1E293B] text-white">
                    <MaterialIcon name="check" className="text-[14px] text-white" />
                  </div>
                  <h3 className="flex-1 text-[16px] text-[#334155] line-through opacity-50">{t('mockups.dashboard.checklist.task_3')}</h3>
                  <MaterialIcon name="verified" className="text-[18px] text-[#A7F3D0]" />
                </div>
              </div>
            </section>

            <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-2">
              <section className="rounded-[24px] bg-white p-8 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                <h2 className="mb-8 font-display text-[18px] font-bold text-[#334155]">{t('mockups.dashboard.metrics.title')}</h2>
                <div className="space-y-6">
                  <div>
                    <div className="mb-2 flex justify-between">
                      <h3 className="text-[16px] font-medium text-slate-600">{t('mockups.dashboard.metrics.hydration')}</h3>
                      <span className="text-[12px] font-display font-bold text-[#334155]">80%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full w-[80%] rounded-full bg-[#A7F3D0]" />
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex justify-between">
                      <h3 className="text-[16px] font-medium text-slate-600">{t('mockups.dashboard.metrics.technical_reading')}</h3>
                      <span className="text-[12px] font-display font-bold text-[#334155]">45%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full w-[45%] rounded-full bg-[#E9D5FF]" />
                    </div>
                  </div>
                  <div className="flex justify-around pt-4">
                    {['L', 'M', 'M', 'J', 'V'].map((letter, index) => (
                      <div
                        key={letter}
                        className={index < 3
                          ? 'flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#A7F3D0] text-[10px] font-bold text-[#334155]'
                          : 'flex h-9 w-9 items-center justify-center rounded-full border-2 border-slate-200 text-[10px] font-bold text-slate-400'}
                      >
                        {letter}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="relative overflow-hidden rounded-[24px] bg-white p-8 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                <h2 className="mb-8 font-display text-[18px] font-bold text-[#334155]">{t('mockups.dashboard.risk.title')}</h2>
                <div className="flex flex-col items-center justify-center gap-4 py-2">
                  <div className="flex gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FEE2E2]/30">
                      <div className="h-6 w-6 rounded-full bg-[#EF4444]/20" />
                    </div>
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                      <div className="h-8 w-8 animate-pulse rounded-full bg-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.6)]" />
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#A7F3D0]/10">
                      <div className="h-6 w-6 rounded-full bg-[#A7F3D0]/30" />
                    </div>
                  </div>
                  <div className="mt-4 text-center">
                    <h3 className="text-[16px] font-bold text-[#334155]">{t('mockups.dashboard.risk.status')}</h3>
                    <p className="mt-1 text-[12px] text-slate-500">{t('mockups.dashboard.risk.copy')}</p>
                  </div>
                </div>
                <div className="absolute -bottom-10 -right-10 h-24 w-24 rounded-full bg-amber-400/5 blur-2xl" />
              </section>
            </div>

            <footer className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
              {[
                { value: '12', label: t('mockups.dashboard.footer.tasks'), icon: 'task_alt' },
                { value: '85%', label: t('mockups.dashboard.footer.productivity'), icon: 'bolt' },
                { value: '04:12', label: t('mockups.dashboard.footer.focus'), icon: 'timer' },
                { value: '+14%', label: t('mockups.dashboard.footer.variation'), icon: 'trending_up' }
              ].map((item) => (
                <article
                  key={item.label}
                  className="flex items-center gap-4 rounded-[20px] bg-white/80 px-6 py-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-white">
                    <MaterialIcon name={item.icon} className="text-[20px] text-[#334155]" />
                  </div>
                  <div>
                    <p className="font-display text-[24px] font-bold leading-none text-[#334155]">{item.value}</p>
                    <p className="mt-1 text-[10px] font-display font-bold uppercase tracking-[0.24em] text-slate-400">{item.label}</p>
                  </div>
                </article>
              ))}
            </footer>
          </div>
        </div>
      </div>
    </MockupShell>
  )
}
