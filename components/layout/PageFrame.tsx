import React from 'react'
import type { ReactNode } from 'react'

import { PageSidebar } from './PageSidebar'

interface PageFrameProps {
  eyebrow?: string
  title: string
  copy?: string
  children: ReactNode
  actions?: ReactNode
}

export function PageFrame({ eyebrow, title, copy, children, actions }: PageFrameProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(167,243,208,0.22),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_24%),#f8fafc]">
      <div className="mx-auto grid w-full max-w-[1480px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-8">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <PageSidebar />
        </aside>

        <div className="grid min-w-0 gap-6">
          <header className="rounded-[32px] border border-[rgba(148,163,184,0.18)] bg-[rgba(255,255,255,0.86)] p-5 shadow-[0_30px_80px_-28px_rgba(15,23,42,0.2)] backdrop-blur-xl sm:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="grid gap-2">
                {eyebrow ? (
                  <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#14b8a6]">
                    {eyebrow}
                  </span>
                ) : null}
                <h1 className="font-display text-[32px] font-bold leading-none tracking-[-0.04em] text-slate-800 sm:text-[42px]">
                  {title}
                </h1>
                {copy ? (
                  <p className="max-w-3xl text-[15px] leading-7 text-slate-500 sm:text-[17px]">
                    {copy}
                  </p>
                ) : null}
              </div>

              {actions ? (
                <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                  {actions}
                </div>
              ) : null}
            </div>
          </header>

          <main>{children}</main>
        </div>
      </div>
    </div>
  )
}
