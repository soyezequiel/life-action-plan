'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DebugAgentInfo {
  agent: string
  errorCode: string
  message: string
}

export interface DebugMetadata {
  code: string
  state: string
  score: number | null
  agents?: DebugAgentInfo[]
}

// Supports both old shape (DebugMetadata directly) and new shape ({ structured, raw })
export type DebugPayload =
  | DebugMetadata
  | { structured?: DebugMetadata; raw?: Record<string, unknown> }
  | null
  | undefined

interface GenerationErrorDetailsProps {
  message: string
  debug?: DebugPayload
  onRetry?: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractStructured(debug: DebugPayload): DebugMetadata | null {
  if (!debug) return null
  if ('structured' in (debug as any)) return (debug as any).structured ?? null
  if ('code' in (debug as any)) return debug as DebugMetadata
  return null
}

function extractRaw(debug: DebugPayload): Record<string, unknown> | null {
  if (!debug) return null
  if ('raw' in (debug as any)) return (debug as any).raw ?? null
  // Fallback: expose the whole object as raw if no raw key
  return debug as Record<string, unknown>
}

function hasAnyDebug(debug: DebugPayload): boolean {
  return !!extractStructured(debug) || !!extractRaw(debug)
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TerminalHeader() {
  return (
    <div className="mb-5 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <MaterialIcon name="bug_report" className="text-emerald-400 text-[16px]" />
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-500">
          DIAGNOSTIC_TRACE_V6
        </span>
      </div>
      <div className="flex gap-1.5">
        <div className="h-2 w-2 rounded-full bg-red-500/30" />
        <div className="h-2 w-2 rounded-full bg-amber-500/30" />
        <div className="h-2 w-2 rounded-full bg-emerald-500/30" />
      </div>
    </div>
  )
}

function StructuredPanel({ structured }: { structured: DebugMetadata }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-y-4 gap-x-8 md:grid-cols-3 font-mono text-[13px]">
        <div className="flex flex-col gap-1">
          <span className="text-slate-500 text-[9px] uppercase font-bold tracking-wider">Error Code</span>
          <span className="text-pink-400">{structured.code}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-slate-500 text-[9px] uppercase font-bold tracking-wider">System State</span>
          <span className="text-blue-400">{structured.state}</span>
        </div>
        {structured.score !== null && structured.score !== undefined && (
          <div className="flex flex-col gap-1">
            <span className="text-slate-500 text-[9px] uppercase font-bold tracking-wider">Quality Score</span>
            <span className={structured.score < 60 ? 'text-amber-400' : 'text-emerald-400'}>
              {structured.score}/100
            </span>
          </div>
        )}
      </div>

      {structured.agents && structured.agents.length > 0 && (
        <div className="border-t border-slate-800 pt-4">
          <span className="mb-3 block font-mono text-[9px] font-bold uppercase tracking-widest text-slate-500">
            Agent Outcomes
          </span>
          <div className="space-y-2">
            {structured.agents.map((agent, i) => (
              <div key={i} className="flex flex-col gap-1 rounded-lg bg-slate-900/60 p-3 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-200 text-[13px]">@{agent.agent}</span>
                  <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded border border-red-500/20 font-mono">
                    {agent.errorCode}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug font-mono">
                  {agent.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RawDataPanel({ raw }: { raw: Record<string, unknown> }) {
  const [copied, setCopied] = useState(false)
  const json = JSON.stringify(raw, null, 2)

  const handleCopy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-500">
          Raw Payload
        </span>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-mono text-slate-400 hover:text-slate-200 transition"
        >
          <MaterialIcon name={copied ? 'check' : 'content_copy'} className="text-[12px]" />
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-slate-950 border border-slate-800 p-4 text-[11px] font-mono text-emerald-300 leading-relaxed max-h-[400px] overflow-y-auto">
        {json}
      </pre>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function GenerationErrorDetails({ message, debug, onRetry }: GenerationErrorDetailsProps) {
  const [showTechnical, setShowTechnical] = useState(false)
  const [activeTab, setActiveTab] = useState<'structured' | 'raw'>('structured')

  const structured = extractStructured(debug)
  const raw = extractRaw(debug)
  const hasDiagnostics = hasAnyDebug(debug)

  const containerVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] }
    }
  }

  const panelVariants: Variants = {
    closed: { height: 0, opacity: 0, marginTop: 0 },
    open: {
      height: 'auto',
      opacity: 1,
      marginTop: 20,
      transition: { duration: 0.45, ease: [0.04, 0.62, 0.23, 0.98] }
    }
  }

  return (
    <motion.div
      className="w-full overflow-hidden rounded-[26px] border border-red-100 bg-white p-2 shadow-[0_20px_60px_-12px_rgba(220,38,38,0.08)]"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <div className="flex flex-col p-6 md:p-8">
        {/* Header */}
        <div className="flex items-start gap-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-500 shadow-sm border border-red-100">
            <MaterialIcon name="warning" className="text-[28px]" />
          </div>
          <div className="flex flex-col space-y-2 min-w-0">
            <h3 className="font-display text-[20px] font-bold tracking-tight text-slate-800">
              Problema con el asistente
            </h3>
            <p className="text-[15px] leading-relaxed text-slate-500 break-words">
              {message}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-7 flex flex-wrap items-center gap-3">
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1E293B] px-5 font-display text-[14px] font-bold text-white shadow-lg shadow-slate-200 transition hover:-translate-y-0.5 hover:bg-[#334155] active:translate-y-0"
            >
              <MaterialIcon name="refresh" className="text-[18px]" />
              <span>Intentar de nuevo</span>
            </button>
          )}

          {hasDiagnostics && (
            <button
              onClick={() => setShowTechnical(!showTechnical)}
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 font-display text-[14px] font-bold transition-all ${
                showTechnical
                  ? 'bg-slate-100 text-slate-700 shadow-inner'
                  : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <MaterialIcon name={showTechnical ? 'unfold_less' : 'terminal'} className="text-[18px]" />
              <span>{showTechnical ? 'Ocultar diagnóstico' : 'Ver diagnóstico'}</span>
            </button>
          )}
        </div>

        {/* Debug panel */}
        <AnimatePresence>
          {showTechnical && hasDiagnostics && (
            <motion.div
              initial="closed"
              animate="open"
              exit="closed"
              variants={panelVariants}
              className="overflow-hidden"
            >
              <div className="rounded-2xl bg-[#0F172A] p-5 text-slate-300 shadow-2xl">
                <TerminalHeader />

                {/* Tabs */}
                {structured && raw && (
                  <div className="mb-5 flex gap-2">
                    <button
                      onClick={() => setActiveTab('structured')}
                      className={`rounded-lg px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider transition ${
                        activeTab === 'structured'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'text-slate-500 hover:text-slate-400'
                      }`}
                    >
                      Análisis
                    </button>
                    <button
                      onClick={() => setActiveTab('raw')}
                      className={`rounded-lg px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider transition ${
                        activeTab === 'raw'
                          ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                          : 'text-slate-500 hover:text-slate-400'
                      }`}
                    >
                      Raw JSON
                    </button>
                  </div>
                )}

                {/* Tab content */}
                {activeTab === 'structured' && structured && (
                  <StructuredPanel structured={structured} />
                )}
                {(activeTab === 'raw' || !structured) && raw && (
                  <RawDataPanel raw={raw} />
                )}
                {!structured && !raw && (
                  <p className="font-mono text-[12px] text-slate-500">Sin metadatos de diagnóstico disponibles.</p>
                )}

                {/* Footer */}
                <div className="mt-5 flex items-center justify-between font-mono text-[10px] text-slate-700 border-t border-slate-800 pt-4">
                  <span>SYS_TIME: {new Date().toISOString()}</span>
                  <span className="font-black italic">SANTUARIO.V6.BLACK_BOX</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
