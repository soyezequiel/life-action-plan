import { t } from '@/src/i18n'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
import { MockData } from '../midnight-mint/MockData'
import { MockupShell } from '../midnight-mint/MockupShell'

export default function SpatialPrioritizationMockup() {
  const sidebar = [
    { label: t('mockups.refinement.nav.dashboard'), icon: 'dashboard', href: '/' },
    { label: t('mockups.refinement.nav.planner'), icon: 'calendar_month', active: true, href: '/flow' },
    { label: t('mockups.refinement.nav.tasks'), icon: 'check_circle', href: '/flow?variant=tasks' },
    { label: t('mockups.refinement.nav.notes'), icon: 'description', href: '/flow?variant=spatial' },
    { label: t('mockups.refinement.nav.focus'), icon: 'center_focus_strong', href: '/flow?variant=simulation' },
    { label: t('mockups.refinement.nav.settings'), icon: 'settings', href: '/settings' }
  ]

  return (
    <MockupShell
      sidebarLabel={t('mockups.common.santuario_digital')}
      sidebarNav={sidebar}
      sidebarPrimaryAction={{ label: t('mockups.flow.prioritization.new_task'), icon: 'add', href: '/flow' }}
      sidebarFooter={[
        { label: t('mockups.common.help'), icon: 'help', href: '#' }
      ]}
      topLeft={(
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{t('mockups.flow.prioritization.brand')}</span>
        </div>
      )}
      topRight={(
        <>
          <div className="flex h-9 w-[240px] items-center rounded-full bg-slate-100/70 px-4 text-[14px] text-slate-400 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <MaterialIcon name="search" className="mr-2 text-[18px]" />
            <span>{t('mockups.flow.prioritization.search')}</span>
          </div>
          <button type="button" className="text-slate-500">
            <MaterialIcon name="account_balance_wallet" className="text-[20px]" />
          </button>
          <button type="button" className="text-slate-500">
            <MaterialIcon name="notifications" className="text-[20px]" />
          </button>
          <div className="h-8 w-8 rounded-full bg-[linear-gradient(135deg,#C4B5FD,#F472B6)]" />
        </>
      )}
      contentClassName="px-0"
    >
      <div className="grid min-h-[calc(100vh-8rem)] grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="border-r border-white/70 bg-white/70 px-6 py-8 backdrop-blur-xl">
          <div className="mb-4">
            <h1 className="font-display text-[24px] font-bold text-[#334155]">{t('mockups.flow.prioritization.title')}</h1>
            <p className="mt-1 text-[14px] leading-6 text-slate-500">{t('mockups.flow.prioritization.copy')}</p>
          </div>
          <div className="mt-8 space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{t('mockups.flow.prioritization.pending')}</p>
            {[
              {
                badge: 'text-[#7C3AED]',
                badgeBg: 'bg-[#E9D5FF]/20',
                title: t('mockups.flow.prioritization.card_1_title'),
                copy: t('mockups.flow.prioritization.card_1_copy'),
                category: t('mockups.flow.prioritization.card_1_category')
              },
              {
                badge: 'text-[#166534]',
                badgeBg: 'bg-[#A7F3D0]/20',
                title: t('mockups.flow.prioritization.card_2_title'),
                copy: t('mockups.flow.prioritization.card_2_copy'),
                category: t('mockups.flow.prioritization.card_2_category')
              },
              {
                badge: 'text-[#475569]',
                badgeBg: 'bg-slate-100',
                title: t('mockups.flow.prioritization.card_3_title'),
                copy: t('mockups.flow.prioritization.card_3_copy'),
                category: t('mockups.flow.prioritization.card_3_category')
              },
              {
                badge: 'text-[#7C3AED]',
                badgeBg: 'bg-[#E9D5FF]/20',
                title: t('mockups.flow.prioritization.card_4_title'),
                copy: t('mockups.flow.prioritization.card_4_copy'),
                category: t('mockups.flow.prioritization.card_4_category')
              }
            ].map((item) => (
              <article key={item.title} className="rounded-[20px] bg-white p-4 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                <div className="mb-2 flex items-center justify-between">
                  <span className={`inline-flex h-7 items-center rounded-full px-3 text-[10px] font-bold uppercase tracking-[0.22em] ${item.badge} ${item.badgeBg}`}>
                    {item.category}
                  </span>
                  <MaterialIcon name="drag_indicator" className="text-[18px] text-slate-300" />
                </div>
                <h3 className="text-[15px] font-semibold text-[#334155]"><MockData>{item.title}</MockData></h3>
                <p className="mt-2 text-[13px] leading-6 text-slate-500"><MockData>{item.copy}</MockData></p>
              </article>
            ))}
          </div>
          <div className="mt-10 rounded-[20px] bg-[#1E293B] p-4 text-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <div className="flex items-center gap-2 text-[#A7F3D0]">
              <MaterialIcon name="lightbulb" className="text-[18px]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.22em]">{t('mockups.flow.prioritization.tip_title')}</span>
            </div>
            <p className="mt-2 text-[13px] leading-6 text-slate-200">{t('mockups.flow.prioritization.tip_copy')}</p>
          </div>
        </aside>

        <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(233,213,255,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(167,243,208,0.16),transparent_24%)] px-8 py-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.02),transparent_48%)]" />
          <div className="relative mx-auto h-full min-h-[760px] rounded-[24px] border border-dashed border-slate-200/0">
            <div className="absolute left-[52%] top-[10%] inline-flex -translate-x-1/2 rounded-full bg-[#FCA5A5]/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[#9F1239] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              {t('mockups.flow.prioritization.urgent')}
            </div>

            <article className="absolute left-[42%] top-[24%] w-[220px] rounded-[20px] bg-white p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                <span className="h-2 w-2 rounded-full bg-[#FCA5A5]" />
                {t('mockups.flow.prioritization.in_progress')}
              </div>
              <h3 className="font-display text-[18px] font-bold text-[#334155]"><MockData>{t('mockups.flow.prioritization.side_title')}</MockData></h3>
              <p className="mt-2 text-[13px] leading-6 text-slate-500"><MockData>{t('mockups.flow.prioritization.side_copy')}</MockData></p>
              <div className="mt-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                <MaterialIcon name="event" className="text-[14px] text-[#A7F3D0]" />
                <MockData>{t('mockups.flow.prioritization.side_meta')}</MockData>
              </div>
            </article>

            <article className="absolute right-[12%] top-[18%] w-[300px] rounded-[22px] bg-[#1E293B] p-5 text-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <div className="absolute -right-4 -top-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#A7F3D0] text-[#166534]">
                <MaterialIcon name="star" className="text-[18px]" />
              </div>
              <h3 className="font-display text-[18px] font-bold"><MockData>{t('mockups.flow.prioritization.big_title')}</MockData></h3>
              <p className="mt-2 text-[13px] leading-6 text-slate-200"><MockData>{t('mockups.flow.prioritization.big_copy')}</MockData></p>
              <div className="mt-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#A7F3D0]">
                <MaterialIcon name="event" className="text-[14px]" />
                <MockData>{t('mockups.flow.prioritization.big_meta')}</MockData>
              </div>
            </article>

            <div className="absolute left-[50%] top-[52%] -translate-x-1/2 rounded-[24px] border border-dashed border-slate-200 bg-white/60 px-12 py-14 text-center text-slate-300 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <MaterialIcon name="add_circle" className="mx-auto text-[32px] text-slate-300" />
              <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.22em]">{t('mockups.flow.prioritization.dropzone')}</p>
            </div>

            <div className="absolute bottom-[14%] left-[48%] w-[280px] -translate-x-1/2 rounded-[20px] bg-white p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#A7F3D0]">
                <span className="h-2 w-2 rounded-full bg-[#A7F3D0]" />
                {t('mockups.flow.prioritization.bottom_category')}
              </div>
              <h3 className="text-[15px] font-semibold text-[#334155]">{t('mockups.flow.prioritization.bottom_title')}</h3>
              <p className="mt-1 text-[13px] leading-6 text-slate-500">{t('mockups.flow.prioritization.bottom_copy')}</p>
            </div>

            <div className="absolute right-[10px] top-[52%] flex -translate-y-1/2 flex-col items-center gap-3">
              <span className="rounded-full bg-[#1E293B] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.28em] text-white [writing-mode:vertical-rl]">
                {t('mockups.flow.prioritization.vertical_label')}
              </span>
            </div>

            <div className="absolute bottom-8 left-8 right-8 flex items-center justify-between rounded-full bg-white px-6 py-4 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <div className="flex items-center gap-6 text-[13px] text-slate-500">
                <span>{t('mockups.flow.prioritization.zoom_in')}</span>
                <span>{t('mockups.flow.prioritization.zoom_out')}</span>
                <span>{t('mockups.flow.prioritization.center')}</span>
              </div>
              <button type="button" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#1E293B] px-5 text-[11px] font-bold uppercase tracking-[0.22em] text-white">
                {t('mockups.flow.prioritization.save_view')}
                <MaterialIcon name="arrow_forward" className="text-[16px]" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </MockupShell>
  )
}
