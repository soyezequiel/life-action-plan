import { t } from '@/src/i18n'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
import { MockData } from '../midnight-mint/MockData'
import { MockupShell } from '../midnight-mint/MockupShell'

export default function TaskManagementMockup() {
  const sidebar = [
    { label: t('mockups.flow.tasks.nav.dashboard'), icon: 'dashboard', href: '/' },
    { label: t('mockups.flow.tasks.nav.calendar'), icon: 'calendar_today', href: '/plan?view=week' },
    { label: t('mockups.flow.tasks.nav.tasks'), icon: 'check_circle', active: true, href: '/flow?variant=tasks' },
    { label: t('mockups.flow.tasks.nav.notes'), icon: 'description', href: '/flow?variant=spatial' },
    { label: t('mockups.flow.tasks.nav.focus'), icon: 'center_focus_strong', href: '/flow?variant=simulation' },
    { label: t('mockups.flow.tasks.nav.settings'), icon: 'settings', href: '/settings' }
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
      topLeft={(
        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{t('mockups.flow.tasks.eyebrow')}</div>
      )}
      topRight={(
        <>
          <div className="flex h-9 w-[220px] items-center rounded-full bg-slate-100/70 px-4 text-[14px] text-slate-400 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
            <MaterialIcon name="search" className="mr-2 text-[18px]" />
            <span>{t('mockups.flow.tasks.search')}</span>
          </div>
          <button type="button" className="text-slate-500"><MaterialIcon name="notifications" className="text-[20px]" /></button>
          <div className="h-8 w-8 rounded-full bg-[linear-gradient(135deg,#D1D5DB,#F9A8D4)]" />
        </>
      )}
      contentClassName="px-0"
    >
      <div className="mx-auto w-full max-w-[1360px]">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-8">
            <header>
              <h1 className="font-display text-[32px] font-bold tracking-tight text-[#334155]">{t('mockups.flow.tasks.title')}</h1>
              <p className="mt-3 max-w-3xl text-[16px] leading-7 text-slate-500">{t('mockups.flow.tasks.copy')}</p>
            </header>

            <section className="rounded-[24px] bg-white p-8 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1E293B] text-white">
                    <MaterialIcon name="flash_on" className="text-[20px]" />
                  </div>
                  <h2 className="font-display text-[18px] font-bold text-[#334155]">{t('mockups.flow.tasks.priority_title')}</h2>
                </div>
                <MaterialIcon name="filter_list" className="text-[18px] text-slate-400" />
              </div>

              <div className="space-y-4">
                <article className="rounded-[22px] bg-white p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em]">
                    <span className="rounded-full bg-[#FCA5A5]/20 px-2 py-1 text-[#EF4444]">{t('mockups.flow.tasks.urgent')}</span>
                    <span className="text-slate-400">{t('mockups.flow.tasks.id')}</span>
                  </div>
                  <h3 className="mt-3 text-[18px] font-semibold text-[#334155]">{t('mockups.flow.tasks.task_1_title')}</h3>
                  <p className="mt-3 text-[14px] leading-7 text-slate-500">{t('mockups.flow.tasks.task_1_copy')}</p>
                  <div className="mt-5 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[13px] text-slate-400">
                      <MaterialIcon name="schedule" className="text-[16px]" />
                      <span>{t('mockups.flow.tasks.task_1_meta')}</span>
                    </div>
                    <button type="button" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#1E293B] px-4 text-[11px] font-bold uppercase tracking-[0.22em] text-white">
                      {t('mockups.flow.tasks.begin')}
                    </button>
                  </div>
                </article>

                <article className="rounded-[22px] bg-white p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em]">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-500">{t('mockups.flow.tasks.important')}</span>
                  </div>
                  <h3 className="mt-3 text-[18px] font-semibold text-[#334155]">{t('mockups.flow.tasks.task_2_title')}</h3>
                  <div className="mt-5 flex items-center gap-2 text-[13px] text-slate-400">
                    <MaterialIcon name="event" className="text-[16px]" />
                    <span>{t('mockups.flow.tasks.task_2_meta')}</span>
                  </div>
                </article>
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center gap-3">
                <MaterialIcon name="waves" className="text-[20px] text-[#A7F3D0]" />
                <h2 className="font-display text-[22px] font-bold text-[#334155]">{t('mockups.flow.tasks.fluid_title')}</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  [t('mockups.flow.tasks.fluid_1_title'), t('mockups.flow.tasks.fluid_1_tag')],
                  [t('mockups.flow.tasks.fluid_2_title'), t('mockups.flow.tasks.fluid_2_tag')]
                ].map(([title, tag]) => (
                  <article key={title} className="rounded-[18px] bg-white p-4 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                    <p className="text-[15px] font-semibold text-[#334155]">{title}</p>
                    <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                      {tag}
                    </span>
                  </article>
                ))}
                <article className="rounded-[18px] bg-white p-4 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] md:col-span-2">
                  <div className="flex items-center gap-2 text-slate-500">
                    <MaterialIcon name="check_circle" className="text-[18px] text-[#A7F3D0]" />
                    <span className="line-through">{t('mockups.flow.tasks.fluid_done')}</span>
                  </div>
                </article>
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-[24px] bg-[#1E293B] p-6 text-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#A7F3D0]/20 text-[#A7F3D0]">
                    <MaterialIcon name="explore" className="text-[18px]" />
                  </div>
                  <h2 className="font-display text-[18px] font-bold">{t('mockups.flow.tasks.explore_title')}</h2>
                </div>
                <span className="rounded-full bg-[#334155] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-300"><MockData>75%</MockData></span>
              </div>
              <p className="text-[14px] leading-7 text-slate-300">{t('mockups.flow.tasks.explore_copy')}</p>
              <div className="mt-6 space-y-4">
                {[
                  [t('mockups.flow.tasks.explore_1'), '35%'],
                  [t('mockups.flow.tasks.explore_2'), '12%'],
                  [t('mockups.flow.tasks.explore_3'), '65%']
                ].map(([label, percent]) => (
                  <div key={label}>
                    <div className="mb-2 flex items-center justify-between text-[13px] text-slate-300">
                      <span>{label}</span>
                      <span><MockData>{percent}</MockData></span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-[#A7F3D0]" style={{ width: percent }} />
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-[16px] border border-white/10 text-[11px] font-bold uppercase tracking-[0.22em] text-white">
                {t('mockups.flow.tasks.library')}
              </button>
            </section>

            <section className="rounded-[22px] bg-white p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{t('mockups.flow.tasks.wisdom_title')}</h3>
              <p className="mt-3 text-[14px] leading-7 italic text-slate-500">{t('mockups.flow.tasks.wisdom_copy')}</p>
            </section>

            <section className="overflow-hidden rounded-[24px] bg-[#0F172A] p-0 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <div className="relative min-h-[170px] overflow-hidden rounded-[24px]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.25),transparent_45%),linear-gradient(135deg,#0F172A,#1E293B)]" />
                <div className="relative flex min-h-[170px] flex-col justify-end p-5 text-white">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-300">{t('mockups.flow.tasks.next_milestone_label')}</p>
                  <h3 className="mt-2 text-[18px] font-semibold leading-7">{t('mockups.flow.tasks.next_milestone_title')}</h3>
                </div>
                <button type="button" className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#1E293B] text-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                  <MaterialIcon name="add" className="text-[18px]" />
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </MockupShell>
  )
}
