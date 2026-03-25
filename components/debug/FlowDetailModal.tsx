'use client'

import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { t } from '../../src/i18n'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModalProps {
  phaseId: string
  phaseName: string
  phaseColor: string
  runtimeData: Record<string, unknown>
  onClose: () => void
}

// ─── Per-phase detail renderers ───────────────────────────────────────────────

function IntakeDetail({ data }: { data: Record<string, unknown> }) {
  const d = data as { profileId?: string; nombre?: string; edad?: number; ciudad?: string; objetivo?: string }
  return (
    <>
      {d.nombre && (
        <>
          <p className="detail-section-title">{t('debug.flow.intake_user')}</p>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#e4e0db', marginBottom: '0.5rem' }}>
            {d.nombre}{d.edad ? ` (${d.edad} años)` : ''}{d.ciudad ? ` — ${d.ciudad}` : ''}
          </div>
        </>
      )}
      {d.objetivo && (
        <>
          <p className="detail-section-title">{t('debug.flow.intake_objective')}</p>
          <div style={{ fontSize: '0.9rem', color: '#b9b5b2', marginBottom: '1rem', lineHeight: 1.5 }}>
            {d.objetivo}
          </div>
        </>
      )}
      <p className="detail-section-title">{t('debug.flow.intake_profile_id')}</p>
      <div className="detail-profile-id">{d.profileId ?? '—'}</div>
    </>
  )
}

function EnrichDetail({ data }: { data: Record<string, unknown> }) {
  const d = data as {
    inferences?: Array<{ field: string; value: string; confidence: string; reason: string }>
    warnings?: string[]
  }
  const inferences = d.inferences ?? []
  const warnings = d.warnings ?? []

  return (
    <>
      <p className="detail-section-title">{t('debug.flow.enrich_inferences')} ({inferences.length})</p>
      {inferences.length === 0 ? (
        <p style={{ color: '#8f8a86', fontSize: '0.85rem' }}>—</p>
      ) : (
        <div>
          {inferences.map((inf, i) => (
            <div key={i} className="inference-row">
              <div className="inference-header">
                <span className="inference-field">{inf.field}</span>
                <span
                  className={`confidence-badge confidence-badge--${inf.confidence}`}
                >
                  {inf.confidence}
                </span>
              </div>
              <div className="inference-value">{String(inf.value ?? '—')}</div>
              {inf.reason && <div className="inference-reason">{inf.reason}</div>}
            </div>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <>
          <p className="detail-section-title">{t('debug.flow.enrich_warnings')}</p>
          <ul style={{ margin: 0, padding: '0 0 0 1.25rem' }}>
            {warnings.map((w, i) => (
              <li key={i} style={{ fontSize: '0.85rem', color: '#f2bf82', marginBottom: '0.3rem' }}>{w}</li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function ReadinessDetail({ data }: { data: Record<string, unknown> }) {
  const d = data as { warnings?: string[]; constraints?: string[] }
  const warnings = d.warnings ?? []
  const constraints = d.constraints ?? []

  return (
    <>
      <p className="detail-section-title">{t('debug.flow.readiness_constraints')} ({constraints.length})</p>
      {constraints.length === 0 ? (
        <p style={{ color: '#8f8a86', fontSize: '0.85rem' }}>—</p>
      ) : (
        <ul style={{ margin: 0, padding: '0 0 0 1.25rem' }}>
          {constraints.map((c, i) => (
            <li key={i} style={{ fontSize: '0.85rem', color: '#80deea', marginBottom: '0.3rem' }}>{c}</li>
          ))}
        </ul>
      )}

      {warnings.length > 0 && (
        <>
          <p className="detail-section-title">{t('debug.flow.enrich_warnings')}</p>
          <ul style={{ margin: 0, padding: '0 0 0 1.25rem' }}>
            {warnings.map((w, i) => (
              <li key={i} style={{ fontSize: '0.85rem', color: '#f2bf82', marginBottom: '0.3rem' }}>{w}</li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function BuildDetail({ data }: { data: Record<string, unknown> }) {
  const d = data as {
    nombre?: string
    eventCount?: number
    resumen?: string
    planId?: string
    fallbackUsed?: boolean
    tokensUsed?: { input: number; output: number }
    eventos?: Array<{ semana: number; dia: string; hora: string; duracion: number; actividad: string; categoria: string }>
  }
  const eventos = d.eventos ?? []

  return (
    <>
      <p className="detail-section-title">{t('debug.flow.build_plan_name')}</p>
      <div style={{ fontSize: '1rem', fontWeight: 600, color: '#e4e0db', marginBottom: '1rem' }}>{d.nombre ?? '—'}</div>

      {d.resumen && (
        <>
          <p className="detail-section-title">{t('debug.flow.build_summary')}</p>
          <div style={{ fontSize: '0.88rem', color: '#b9b5b2', marginBottom: '1rem', lineHeight: 1.5 }}>{d.resumen}</div>
        </>
      )}

      {d.planId && (
        <>
          <p className="detail-section-title">Plan ID</p>
          <div className="detail-profile-id" style={{ marginBottom: '1rem' }}>{d.planId}</div>
        </>
      )}

      {d.fallbackUsed && (
        <div style={{ fontSize: '0.82rem', color: '#f2bf82', marginBottom: '1rem' }}>⚠ {t('debug.flow.build_fallback_used')}</div>
      )}

      {d.tokensUsed && (
        <>
          <p className="detail-section-title">{t('debug.flow.build_tokens')}</p>
          <div style={{ fontSize: '0.85rem', color: '#9d9a97', marginBottom: '1rem' }}>
            {t('debug.flow.tokens_input')}: {d.tokensUsed.input?.toLocaleString()} · {t('debug.flow.tokens_output')}: {d.tokensUsed.output?.toLocaleString()}
          </div>
        </>
      )}

      <p className="detail-section-title">{t('debug.flow.build_events')} ({d.eventCount ?? 0})</p>
      {eventos.length === 0 ? (
        <p style={{ color: '#8f8a86', fontSize: '0.85rem' }}>—</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="detail-table">
            <thead>
              <tr>
                <th>{t('debug.flow.build_week')}</th>
                <th>{t('debug.flow.build_day')}</th>
                <th>{t('debug.flow.build_time')}</th>
                <th>{t('debug.flow.build_duration')}</th>
                <th>{t('debug.flow.build_activity')}</th>
                <th>{t('debug.flow.build_category')}</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((ev, i) => (
                <tr key={i}>
                  <td>{ev.semana}</td>
                  <td>{ev.dia}</td>
                  <td>{ev.hora}</td>
                  <td>{ev.duracion}m</td>
                  <td>{ev.actividad}</td>
                  <td style={{ color: '#9d9a97' }}>{ev.categoria}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function SimulateDetail({ data }: { data: Record<string, unknown> }) {
  const d = data as {
    qualityScore?: number
    findings?: Array<{ status: string; code: string; params?: Record<string, string | number> }>
    summary?: { pass: number; warn: number; fail: number }
  }
  const findings = d.findings ?? []

  return (
    <>
      <p className="detail-section-title">{t('debug.flow.simulate_score')}</p>
      <div className="score-display">{d.qualityScore ?? 0}<span style={{ fontSize: '1rem', color: '#8f8a86', fontWeight: 400 }}>/100</span></div>

      {d.summary && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
          {d.summary.pass > 0 && <span style={{ fontSize: '0.8rem', color: '#6ed7a5' }}>✓ {d.summary.pass} pasan</span>}
          {d.summary.warn > 0 && <span style={{ fontSize: '0.8rem', color: '#f2bf82' }}>⚠ {d.summary.warn} avisos</span>}
          {d.summary.fail > 0 && <span style={{ fontSize: '0.8rem', color: '#ff6b6b' }}>✗ {d.summary.fail} fallan</span>}
        </div>
      )}

      <p className="detail-section-title">{t('debug.flow.simulate_findings')} ({findings.length})</p>
      {findings.length === 0 ? (
        <p style={{ color: '#8f8a86', fontSize: '0.85rem' }}>—</p>
      ) : (
        <div>
          {findings.map((f, i) => (
            <div key={i} className="finding-row">
              <span className={`finding-badge finding-badge--${f.status.toLowerCase()}`}>
                {f.status}
              </span>
              <div className="finding-info">
                <div className="finding-code">{f.code}</div>
                {f.params && Object.keys(f.params).length > 0 && (
                  <div className="finding-params">
                    {Object.entries(f.params).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function RepairDetail({ data }: { data: Record<string, unknown> }) {
  const d = data as {
    attempts?: number
    history?: Array<{ attempt: number; findingsCount: number; qualityScore: number; repairNotes: string }>
  }
  const history = d.history ?? []

  return (
    <>
      <p className="detail-section-title">{t('debug.flow.repair_attempts')}: {d.attempts ?? 0}</p>

      <p className="detail-section-title">{t('debug.flow.repair_history')}</p>
      {history.length === 0 ? (
        <p style={{ color: '#8f8a86', fontSize: '0.85rem' }}>—</p>
      ) : (
        <div>
          {history.map((h, i) => (
            <div key={i} className="repair-attempt-row">
              <div className="repair-attempt-header">
                <span className="repair-attempt-label">{t('debug.flow.repair_attempt_label', { n: h.attempt })}</span>
                <span className="repair-attempt-score">puntaje: {h.qualityScore}/100 · {t('debug.flow.repair_findings_count', { count: h.findingsCount })}</span>
              </div>
              {h.repairNotes && (
                <div className="repair-notes-text">{h.repairNotes}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function OutputDetail({ data }: { data: Record<string, unknown> }) {
  const d = data as { deliveryMode?: string; finalQualityScore?: number; warnings?: string[] }
  const mode = d.deliveryMode ?? 'best-effort'
  const modeLabels: Record<string, string> = { 'pass': 'aprobado', 'warn-acceptable': 'aceptable con avisos', 'best-effort': 'mejor esfuerzo' }
  const modeLabel = modeLabels[mode] ?? mode
  const modeClass = `delivery-mode-badge delivery-mode-badge--${mode}`

  return (
    <>
      <p className="detail-section-title">{t('debug.flow.output_delivery_mode')}</p>
      <div className={modeClass}>{modeLabel}</div>

      <p className="detail-section-title">{t('debug.flow.output_final_score')}</p>
      <div className="score-display">{d.finalQualityScore ?? 0}<span style={{ fontSize: '1rem', color: '#8f8a86', fontWeight: 400 }}>/100</span></div>

      {d.warnings && d.warnings.length > 0 && (
        <>
          <p className="detail-section-title">{t('debug.flow.enrich_warnings')}</p>
          <ul style={{ margin: 0, padding: '0 0 0 1.25rem' }}>
            {d.warnings.map((w, i) => (
              <li key={i} style={{ fontSize: '0.85rem', color: '#f2bf82', marginBottom: '0.3rem' }}>{w}</li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function FlowDetailModal({ phaseId, phaseName, phaseColor, runtimeData, onClose }: ModalProps) {
  const resolvedPhase = phaseId === 'simulation' ? 'simulate' : phaseId

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function renderContent() {
    switch (resolvedPhase) {
      case 'intake': return <IntakeDetail data={runtimeData} />
      case 'enrich': return <EnrichDetail data={runtimeData} />
      case 'readiness': return <ReadinessDetail data={runtimeData} />
      case 'build': return <BuildDetail data={runtimeData} />
      case 'simulate': return <SimulateDetail data={runtimeData} />
      case 'repair': return <RepairDetail data={runtimeData} />
      case 'output': return <OutputDetail data={runtimeData} />
      default: return <pre style={{ color: '#9d9a97', fontSize: '0.78rem' }}>{JSON.stringify(runtimeData, null, 2)}</pre>
    }
  }

  return (
    <div className="flow-detail-overlay" onClick={onClose}>
      <motion.div
        className="flow-detail-card"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flow-detail-header">
          <span className="flow-detail-phase-name" style={{ color: phaseColor }}>
            {phaseName}
          </span>
          <button className="flow-detail-close" onClick={onClose}>
            {t('debug.flow.close')}
          </button>
        </div>

        <div className="flow-detail-body">
          {renderContent()}
        </div>
      </motion.div>
    </div>
  )
}
