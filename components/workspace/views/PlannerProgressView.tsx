'use client'

import React, { useMemo } from 'react'
import { DateTime } from 'luxon'

import { getCurrentLocale, t } from '@/src/i18n'
import type { MetricItem, MilestoneItem } from '@/src/lib/domain/plan-item'
import type { PlanPackage } from '@/src/lib/pipeline/shared/phase-io'

interface PlannerProgressViewProps {
  package: PlanPackage
}

function resolveQualityCopy(score: number): string {
  if (score > 70) {
    return t('planV5.quality.solid')
  }

  if (score >= 50) {
    return t('planV5.quality.tight')
  }

  return t('planV5.quality.risky')
}

function resolveCurrentPhaseIndex(pkg: PlanPackage): number {
  const today = DateTime.utc()
  const currentIndex = pkg.plan.skeleton.phases.findIndex((phase) => {
    const start = DateTime.fromISO(phase.startDate, { zone: 'UTC' }).startOf('day')
    const end = DateTime.fromISO(phase.endDate, { zone: 'UTC' }).endOf('day')
    return today >= start && today <= end
  })

  return currentIndex >= 0 ? currentIndex : 0
}

function getMetricValue(metric: MetricItem): number {
  return metric.series?.at(-1)?.value ?? 0
}

function getDirectionLabel(metric: MetricItem): string {
  if (metric.direction === 'increase') {
    return t('planV5.progress.directionIncrease')
  }

  if (metric.direction === 'decrease') {
    return t('planV5.progress.directionDecrease')
  }

  return t('planV5.progress.directionMaintain')
}

export function PlannerProgressView({ package: pkg }: PlannerProgressViewProps) {
  const milestones = useMemo(() => pkg.items.filter((item): item is MilestoneItem => item.kind === 'milestone'), [pkg.items])
  const metrics = useMemo(() => pkg.items.filter((item): item is MetricItem => item.kind === 'metric'), [pkg.items])
  const currentPhaseIndex = resolveCurrentPhaseIndex(pkg)
  const qualityWidth = `${Math.max(8, pkg.qualityScore)}%`

  return (
    <section className="mx-auto grid w-full max-w-[1320px] gap-6">
      <header className="rounded-[30px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] p-6 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
              {t('planner.progress.kicker')}
            </span>
            <h1 className="font-display text-[30px] font-bold tracking-tight text-[#1f2937]">
              {t('planV5.progress.title')}
            </h1>
            <p className="max-w-3xl text-[15px] leading-7 text-slate-500">
              {t('planV5.progress.subtitle')}
            </p>
          </div>
          <div className="min-w-[220px] rounded-[24px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.96)] p-5">
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
              {t('planV5.progress.summaryTitle')}
            </span>
            <p className="mt-2 font-display text-[24px] font-bold text-[#1f2937]">
              {resolveQualityCopy(pkg.qualityScore)}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,#1f2937,#0f766e)]" style={{ width: qualityWidth }} />
            </div>
          </div>
        </div>
      </header>

      <section className="rounded-[30px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] p-6 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
              {t('planV5.progress.currentPhase')}
            </span>
            <h2 className="mt-2 font-display text-[24px] font-bold tracking-tight text-[#1f2937]">
              {t('planV5.progress.phasesTitle')}
            </h2>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {pkg.plan.skeleton.phases.map((phase, index) => (
            <article
              key={phase.phaseId}
              className={`rounded-[22px] border p-5 ${
                index === currentPhaseIndex
                  ? 'border-[#0f766e]/20 bg-[rgba(15,118,110,0.08)]'
                  : 'border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.96)]'
              }`}
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                {DateTime.fromISO(phase.startDate, { zone: 'UTC' }).setLocale(getCurrentLocale()).toFormat('d LLL')}
                {' - '}
                {DateTime.fromISO(phase.endDate, { zone: 'UTC' }).setLocale(getCurrentLocale()).toFormat('d LLL')}
              </span>
              <h3 className="mt-3 font-display text-[18px] font-bold text-[#1f2937]">
                {phase.title}
              </h3>
              <p className="mt-2 text-[14px] leading-6 text-slate-500">
                {phase.objectives[0] ?? ''}
              </p>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[30px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] p-6 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl">
          <h2 className="font-display text-[22px] font-bold text-[#1f2937]">
            {t('planV5.progress.milestonesTitle')}
          </h2>
          {milestones.length === 0 ? (
            <p className="mt-4 text-[15px] leading-7 text-slate-500">
              {t('planV5.progress.emptyMilestones')}
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              {milestones.map((milestone) => (
                <article key={milestone.id} className="rounded-[20px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.96)] p-4">
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 h-3 w-3 rounded-full ${
                      milestone.status === 'done'
                        ? 'bg-[#0f766e]'
                        : milestone.status === 'draft' || milestone.status === 'waiting'
                          ? 'bg-slate-300'
                          : 'bg-amber-400'
                    }`} />
                    <div>
                      <h3 className="font-semibold text-[#1f2937]">{milestone.title}</h3>
                      <p className="mt-1 text-[13px] text-slate-500">
                        {t(`planV5.milestone.${milestone.status}`)}
                        {' · '}
                        {DateTime.fromISO(milestone.dueDate, { zone: 'UTC' }).setLocale(getCurrentLocale()).toFormat('d LLL')}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[30px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] p-6 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl">
          <h2 className="font-display text-[22px] font-bold text-[#1f2937]">
            {t('planV5.progress.metricsTitle')}
          </h2>
          {metrics.length === 0 ? (
            <p className="mt-4 text-[15px] leading-7 text-slate-500">
              {t('planV5.progress.emptyMetrics')}
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              {metrics.map((metric) => {
                const current = getMetricValue(metric)
                const target = metric.target.targetValue
                const progress = Math.max(0, Math.min(100, target > 0 ? (current / target) * 100 : 0))

                return (
                  <article key={metric.id} className="rounded-[20px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.96)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-[#1f2937]">{metric.title}</h3>
                        <p className="mt-1 text-[13px] text-slate-500">{getDirectionLabel(metric)}</p>
                      </div>
                      <strong className="text-[#0f766e]">{Math.round(progress)}%</strong>
                    </div>
                    <p className="mt-3 text-[14px] leading-6 text-slate-500">
                      {t('planV5.progress.current')}: {current}{metric.unit ? ` ${metric.unit}` : ''}
                      {' · '}
                      {t('planV5.progress.target')}: {target}{metric.unit ? ` ${metric.unit}` : ''}
                    </p>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e,#1f2937)]" style={{ width: `${progress}%` }} />
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[30px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] p-6 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl">
          <h2 className="font-display text-[22px] font-bold text-[#1f2937]">
            {t('planV5.progress.intentionsTitle')}
          </h2>
          <ul className="mt-5 space-y-3">
            {pkg.implementationIntentions.map((intention) => (
              <li key={intention} className="rounded-[18px] bg-[rgba(255,253,249,0.96)] px-4 py-3 text-[14px] leading-6 text-slate-600">
                {intention}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[30px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] p-6 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl">
          <h2 className="font-display text-[22px] font-bold text-[#1f2937]">
            {t('planV5.progress.warningsTitle')}
          </h2>
          {pkg.warnings.length === 0 ? (
            <p className="mt-4 text-[15px] leading-7 text-slate-500">
              {t('planV5.progress.noWarnings')}
            </p>
          ) : (
            <ul className="mt-5 space-y-3">
              {pkg.warnings.map((warning) => (
                <li key={warning} className="rounded-[18px] border border-amber-100 bg-amber-50/70 px-4 py-3 text-[14px] leading-6 text-amber-900">
                  {warning}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  )
}
