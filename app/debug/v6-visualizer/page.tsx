'use client'

import React from 'react'

import { AdvancedFlowVisualizer } from '@/components/pipeline-visualizer/AdvancedFlowVisualizer'
import { PipelineVisualizer } from '@/components/pipeline-visualizer/PipelineVisualizer'
import type { PhaseNodeStatus, PipelineVisualizerState } from '@/components/pipeline-visualizer/pipeline-visualizer-types'
import { t } from '@/src/i18n'
import { getV6MachineVisualNodes } from '@/src/lib/pipeline/v6/xstate/visualization'

function createPreviewState(): PipelineVisualizerState {
  const machineNodes = getV6MachineVisualNodes('analyst')
  const statusByState: Partial<Record<string, PhaseNodeStatus>> = {
    interpret: 'completed',
    clarify: 'completed',
    paused_for_input: 'waiting',
    plan: 'completed',
    check: 'completed',
    schedule: 'active',
    critique: 'waiting',
    revise: 'pending',
    package: 'pending',
    done: 'pending',
    blocked: 'pending',
    failed: 'pending',
  }

  return {
    phases: machineNodes.map((node) => ({
      phase: node.stateId,
      labelKey: node.labelKey,
      fallbackLabel: node.fallbackLabel,
      targetProgress: node.progressTarget,
      status: statusByState[node.stateId] ?? 'pending',
      agentName: node.agentName,
      iteration: node.stateId === 'clarify' ? 2 : node.stateId === 'revise' ? 1 : undefined,
      maxIterations: node.stateId === 'clarify' ? 3 : node.stateId === 'revise' ? 2 : undefined,
      statusDetail: node.stateId === 'schedule' ? 'Ajustando la distribución de carga' : undefined,
    })),
    currentPhase: 'schedule',
    progressScore: 64,
    lastAction: 'Ajustando la distribución de carga',
    lifecycle: 'running',
    sessionId: 'preview-session',
    degraded: false,
    notifications: [],
    storage: {
      sessionSaved: true,
      planSaved: false,
    },
  }
}

const previewState = createPreviewState()

export default function V6VisualizerPreviewPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.12),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.08),_transparent_24%),linear-gradient(180deg,#0b1220_0%,#111827_100%)] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
        <header className="flex flex-col gap-3 rounded-[28px] border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-xl sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.32em] text-slate-400">
              {t('debug.flow.viewer_title')}
            </span>
            <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-[38px]">
              {t('visualizer.title')}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{t('debug.flow.mode_topology')}</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{t('debug.flow.mode_inspect')}</span>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-[0_22px_56px_rgba(2,6,23,0.34)] backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between px-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">
                {t('debug.flow.mode_topology')}
              </span>
            </div>
            <PipelineVisualizer state={previewState} />
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-[0_22px_56px_rgba(2,6,23,0.34)] backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between px-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">
                {t('debug.flow.mode_inspect')}
              </span>
            </div>
            <AdvancedFlowVisualizer state={previewState} />
          </section>
        </div>
      </div>
    </main>
  )
}
