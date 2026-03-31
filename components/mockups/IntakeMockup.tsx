'use client'

import { useState } from 'react'
import { motion, MotionConfig } from 'framer-motion'
import { t } from '@/src/i18n'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
import { MockData } from '../midnight-mint/MockData'
import { MockupShell } from '../midnight-mint/MockupShell'

interface IntakeMockupProps {
  onComplete?: (profileId: string) => void
  onCancel?: () => void
}

export default function IntakeMockup({ onComplete, onCancel }: IntakeMockupProps) {
  const [value, setValue] = useState('')

  return (
    <MotionConfig reducedMotion="user">
      <MockupShell
        sidebarLabel={t('mockups.common.santuario_digital')}
        sidebarNav={[
          { label: t('mockups.intake.nav.goals'), icon: 'target', active: true, href: '/intake' },
          { label: t('mockups.intake.nav.spatial'), icon: 'dashboard_customize', href: '/flow?variant=spatial' },
          { label: t('mockups.intake.nav.refinement'), icon: 'tune', href: '/flow' },
          { label: t('mockups.intake.nav.costs'), icon: 'analytics', href: '/flow?variant=simulation' },
          { label: t('mockups.intake.nav.balances'), icon: 'scale', href: '/plan?view=week' }
        ]}
        sidebarPrimaryAction={{ label: t('mockups.common.new_flow'), icon: 'add', href: '/flow' }}
        sidebarFooter={[{ label: t('mockups.common.help'), icon: 'help', href: '#' }]}
        topTabs={[
          { label: t('mockups.intake.top_tabs.flow'), active: true, href: '/flow' },
          { label: t('mockups.intake.top_tabs.canvas'), href: '/flow?variant=spatial' },
          { label: t('mockups.intake.top_tabs.analysis'), href: '/flow?variant=simulation' },
          { label: t('mockups.intake.top_tabs.archive'), href: '/plan?view=month' }
        ]}
        topRight={(
          <>
            <button type="button" className="text-slate-500 transition hover:text-slate-700">
              <MaterialIcon name="notifications" className="text-[20px]" />
            </button>
            <button type="button" className="text-slate-500 transition hover:text-slate-700">
              <MaterialIcon name="account_circle" className="text-[20px]" />
            </button>
          </>
        )}
        contentClassName="px-0"
      >
        <div className="mx-auto flex w-full max-w-[980px] flex-col items-center px-8 pt-10">
          <div className="mb-6 text-center">
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.32em] text-slate-400">
              {t('mockups.intake.eyebrow')}
            </p>
            <h1 className="mt-4 font-display text-[32px] font-bold tracking-tight text-[#334155]">
              {t('mockups.intake.title')}
            </h1>
          </div>

          <motion.section
            className="relative w-full rounded-[24px] bg-white p-6 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] md:p-8"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={t('mockups.intake.placeholder')}
              className="min-h-[210px] w-full resize-none rounded-[20px] border border-transparent bg-[#FAFAF9] p-6 text-[24px] leading-[1.45] text-slate-500 outline-none placeholder:text-slate-400 focus:border-[#1E293B]/10 focus:bg-white focus:text-[#334155]"
            />
            <div className="absolute bottom-6 right-6 flex items-center gap-2">
              <span className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
                {t('mockups.intake.submit_hint')}
              </span>
              <button
                type="button"
                onClick={() => {
                  onComplete?.('mock-profile')
                }}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1E293B] text-white transition hover:-translate-y-0.5"
                aria-label={t('mockups.intake.continue')}
              >
                <MaterialIcon name="arrow_forward" className="text-[20px]" />
              </button>
            </div>
          </motion.section>

          <div className="mt-12 flex w-full items-center justify-between">
            <h2 className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
              {t('mockups.intake.recent')}
            </h2>
            <span className="text-[12px] text-slate-400">{t('mockups.intake.pending')}</span>
          </div>

          <div className="mt-4 grid w-full grid-cols-1 gap-4 md:grid-cols-2">
            <article className="rounded-[22px] bg-white p-6 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E9D5FF]/30 text-[#7C3AED]">
                  <MaterialIcon name="rocket_launch" className="text-[18px]" />
                </div>
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                  {t('mockups.intake.card_1_time')}
                </div>
              </div>
              <span className="font-display text-[15px] font-bold text-[#334155]"><MockData>{t('mockups.intake.card_1_title')}</MockData></span>
              <div className="mt-5 inline-flex rounded-full bg-[#A7F3D0]/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#166534]">
                {t('mockups.intake.card_1_tag')}
              </div>
            </article>

            <article className="rounded-[22px] bg-white p-6 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#A7F3D0]/30 text-[#059669]">
                  <MaterialIcon name="eco" className="text-[18px]" />
                </div>
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                  {t('mockups.intake.card_2_time')}
                </div>
              </div>
              <p className="text-[15px] leading-7 text-[#334155]">{t('mockups.intake.card_2_title')}</p>
              <div className="mt-5 inline-flex rounded-full bg-[#E9D5FF]/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#7C3AED]">
                {t('mockups.intake.card_2_tag')}
              </div>
            </article>
          </div>

          <button
            type="button"
            onClick={() => {
              onComplete?.('mock-profile')
            }}
            className="mt-10 inline-flex h-14 items-center justify-center gap-2 rounded-[18px] bg-[#1E293B] px-7 font-display text-[14px] font-bold text-white transition hover:-translate-y-0.5"
          >
            <span>{t('mockups.intake.continue')}</span>
            <MaterialIcon name="arrow_forward" className="text-[18px]" />
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="mt-4 text-[12px] italic text-slate-400 transition hover:text-[#334155]"
          >
            {t('mockups.intake.help')}
          </button>

          <div className="mt-16 flex w-full items-center justify-center">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-slate-300">
              <MaterialIcon name="edit_note" className="text-[14px]" />
              <span>{t('mockups.intake.draft')}</span>
              <span className="normal-case tracking-normal text-slate-400">{t('mockups.intake.draft_copy')}</span>
              <MaterialIcon name="arrow_forward" className="text-[14px]" />
            </div>
          </div>
        </div>
      </MockupShell>
    </MotionConfig>
  )
}
