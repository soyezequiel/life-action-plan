import { t } from '@/src/i18n'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
import { MockData } from '../midnight-mint/MockData'
import { MockupShell } from '../midnight-mint/MockupShell'

export default function RefinementMockup() {
  return (
    <MockupShell
      sidebarLabel={t('mockups.common.digital_sanctuary')}
      sidebarNav={[
        { label: t('mockups.refinement.nav.dashboard'), icon: 'dashboard', href: '/' },
        { label: t('mockups.refinement.nav.planner'), icon: 'calendar_month', active: true, href: '/flow' },
        { label: t('mockups.refinement.nav.tasks'), icon: 'check_circle', href: '/flow?variant=tasks' },
        { label: t('mockups.refinement.nav.notes'), icon: 'description', href: '/flow?variant=spatial' },
        { label: t('mockups.refinement.nav.focus'), icon: 'center_focus_strong', href: '/flow?variant=simulation' },
        { label: t('mockups.refinement.nav.settings'), icon: 'settings', href: '/settings' }
      ]}
      sidebarPrimaryAction={{ label: t('mockups.common.new_flow'), icon: 'add', href: '/flow' }}
      sidebarFooter={[
        { label: t('mockups.common.help'), icon: 'help', href: '#' },
        { label: t('mockups.common.exit'), icon: 'logout', href: '#' }
      ]}
      topTabs={[
        { label: t('mockups.refinement.top_tabs.explore'), active: false, href: '#' },
        { label: t('mockups.refinement.top_tabs.projects'), active: true, href: '/flow' },
        { label: t('mockups.refinement.top_tabs.team'), href: '/settings' }
      ]}
      topRight={(
        <>
          <button type="button" className="text-slate-500 transition hover:text-slate-700">
            <MaterialIcon name="notifications" className="text-[20px]" />
          </button>
          <div className="h-8 w-8 rounded-full bg-[linear-gradient(135deg,#F8FAFC,#94A3B8)]" aria-label="Profile" />
        </>
      )}
      contentClassName="px-8"
    >
      <div className="mx-auto flex w-full max-w-[1060px] flex-col">
        <div className="mb-6">
          <span className="inline-flex rounded-full bg-[#A7F3D0]/25 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[#166534]">
            {t('mockups.refinement.badge')}
          </span>
          <h1 className="mt-4 font-display text-[32px] font-bold tracking-tight text-[#334155]">{t('mockups.refinement.title')}</h1>
          <p className="mt-3 max-w-3xl text-[16px] leading-7 text-slate-500">{t('mockups.refinement.copy')}</p>
        </div>

        <div className="mb-8 flex items-center justify-between">
          <span className="font-display text-[11px] font-bold uppercase tracking-[0.26em] text-slate-400">
            {t('mockups.refinement.progress_label')}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#334155]"><MockData>{t('mockups.refinement.progress_value')}</MockData></span>
        </div>
        <div className="mb-10 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-1/2 rounded-full bg-[#1E293B]" />
        </div>

        <section className="rounded-[24px] bg-white p-8 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-8">
              <div className="space-y-3">
                <p className="text-[14px] font-medium text-slate-600">{t('mockups.refinement.temporality')}</p>
                <h2 className="font-display text-[20px] font-bold leading-tight text-[#334155]">{t('mockups.refinement.temporality_question')}</h2>
                <div className="flex h-14 items-center justify-between rounded-[16px] bg-[#FAFAF9] px-4 text-[15px] text-slate-500">
                  <span><MockData>{t('mockups.refinement.temporality_option')}</MockData></span>
                  <MaterialIcon name="expand_more" className="text-[20px] text-slate-400" />
                </div>
                <p className="text-[12px] italic text-slate-400">{t('mockups.refinement.temporality_hint')}</p>
              </div>

              <div className="space-y-3">
                <p className="text-[14px] font-medium text-slate-600">{t('mockups.refinement.deadline_label')}</p>
                <h2 className="font-display text-[20px] font-bold leading-tight text-[#334155]">{t('mockups.refinement.deadline_title')}</h2>
                <div className="flex h-14 items-center rounded-[16px] bg-[#FAFAF9] px-4 text-[15px] text-slate-500">
                  <span><MockData>12/31/2024</MockData></span>
                  <MaterialIcon name="calendar_today" className="ml-auto text-[18px] text-slate-400" />
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="space-y-3">
                <p className="text-[14px] font-medium text-slate-600">{t('mockups.refinement.motivation_label')}</p>
                <h2 className="font-display text-[20px] font-bold leading-tight text-[#334155]">{t('mockups.refinement.motivation_question')}</h2>
                <textarea
                  className="min-h-[164px] w-full rounded-[20px] bg-[#FAFAF9] p-4 text-[15px] text-slate-500 outline-none placeholder:text-slate-300"
                  placeholder={t('mockups.refinement.motivation_placeholder')}
                />
              </div>

              <div className="flex items-start gap-4 rounded-[20px] border border-[#E9D5FF]/40 bg-[#E9D5FF]/20 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#7C3AED] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                  <MaterialIcon name="lightbulb" className="text-[18px]" />
                </div>
                <div>
                  <p className="font-display text-[13px] font-bold uppercase tracking-[0.22em] text-[#4C1D95]">
                    <MockData>{t('mockups.refinement.advice_title')}</MockData>
                  </p>
                  <p className="mt-1 text-[14px] leading-6 text-[#6D28D9]"><MockData>{t('mockups.refinement.advice_copy')}</MockData></p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-slate-100 pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <button type="button" className="inline-flex items-center gap-2 text-[14px] text-slate-400 transition hover:text-[#334155]">
                <MaterialIcon name="arrow_back" className="text-[18px]" />
                {t('mockups.refinement.previous')}
              </button>

              <div className="flex flex-col gap-3 md:flex-row">
                <button type="button" className="h-14 rounded-[18px] bg-slate-100 px-6 font-display text-[14px] font-bold text-[#334155] transition hover:bg-slate-200">
                  {t('mockups.refinement.save')}
                </button>
                <button type="button" className="group inline-flex h-14 items-center justify-center gap-2 rounded-[18px] bg-[#1E293B] px-6 font-display text-[14px] font-bold text-white transition hover:-translate-y-0.5">
                  <span>{t('mockups.refinement.continue')}</span>
                  <MaterialIcon name="arrow_forward" className="text-[18px] transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-10 text-center">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
            <MaterialIcon name="lock" className="text-[14px]" />
            {t('mockups.refinement.footer')}
          </span>
        </div>
      </div>
    </MockupShell>
  )
}
