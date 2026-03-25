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
  fullRuntimeData?: any
  onClose: () => void
}

// ─── Human-readable field labels ──────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  // Intake
  nombre: 'Nombre',
  edad: 'Edad',
  ubicacion: 'Ubicación',
  ocupacion: 'Ocupación',
  objetivo: 'Objetivo',
  ciudad: 'Ciudad',
  profileId: 'ID de perfil',
  // Enrich
  persona: 'Persona',
  provider: 'Proveedor',
  enrichedProfileId: 'ID de perfil enriquecido',
  inferences: 'Inferencias del agente',
  warnings: 'Advertencias',
  tokensUsed: 'Tokens consumidos',
  // Readiness
  objectiveCount: 'Cantidad de objetivos',
  freeHoursWeekday: 'Horas libres (día laboral)',
  freeHoursWeekend: 'Horas libres (fin de semana)',
  ready: '¿Listo para planificar?',
  errors: 'Errores',
  constraints: 'Restricciones detectadas',
  // Build
  planId: 'ID del plan',
  nombreDelPlan: 'Nombre del plan',
  horasLibresLaborales: 'Horas libres (día laboral)',
  horasLibresFinDeSemana: 'Horas libres (fin de semana)',
  eventCount: 'Cantidad de eventos',
  resumen: 'Resumen',
  eventos: 'Eventos del plan',
  fallbackUsed: '¿Usó respaldo local?',
  previousFindings: 'Hallazgos previos',
  // Simulate
  mode: 'Modo de simulación',
  qualityScore: 'Puntaje de calidad',
  overallStatus: 'Estado general',
  pass: 'Aprobados',
  warn: 'Con aviso',
  fail: 'Fallidos',
  findings: 'Hallazgos',
  // Repair
  attempt: 'Intento actual',
  maxAttempts: 'Máximos intentos',
  failingFindings: 'Hallazgos a reparar',
  currentEventCount: 'Eventos actuales',
  newPlanId: 'ID del plan reparado',
  repairedEventCount: 'Eventos reparados',
  repairNotes: 'Notas de reparación',
  // Output
  deliveryMode: 'Modo de entrega',
  finalQualityScore: 'Puntaje final',
  repairAttempts: 'Intentos de reparación',
  unresolvableFindings: 'Hallazgos sin resolver',
  honestWarning: 'Aviso honesto',
}

const DELIVERY_LABELS: Record<string, string> = {
  'pass': '✅ Aprobado',
  'warn-acceptable': '⚠️ Aceptable con avisos',
  'best-effort': '🔶 Mejor esfuerzo',
}

const SIM_MODE_LABELS: Record<string, string> = {
  'automatic': 'Automático',
  'interactive': 'Interactivo',
}

const STATUS_LABELS: Record<string, string> = {
  'PASS': '✅ Pasa',
  'WARN': '⚠️ Aviso',
  'FAIL': '❌ Falla',
}

const CONFIDENCE_LABELS: Record<string, string> = {
  'high': '🟢 Alta',
  'medium': '🟡 Media',
  'low': '🔴 Baja',
}

// ─── DataRenderer ─────────────────────────────────────────────────────────────

function renderValue(key: string, value: unknown): React.ReactNode {
  if (value === null || value === undefined) return <span className="dr-null">—</span>

  // Booleans
  if (typeof value === 'boolean') {
    return <span className={value ? 'dr-bool-true' : 'dr-bool-false'}>{value ? '✅ Sí' : '❌ No'}</span>
  }

  // Numbers
  if (typeof value === 'number') {
    if (key === 'qualityScore' || key === 'finalQualityScore') {
      return <span className="dr-score">{value}<span className="dr-score-max">/100</span></span>
    }
    return <span className="dr-number">{value.toLocaleString('es-AR')}</span>
  }

  // Strings
  if (typeof value === 'string') {
    // UUIDs → mostrar abreviado
    if (/^[0-9a-f]{8}-[0-9a-f]{4}/.test(value)) {
      return <code className="dr-uuid">{value.slice(0, 8)}…</code>
    }
    // Delivery modes
    if (key === 'deliveryMode' && DELIVERY_LABELS[value]) {
      return <span className="dr-badge">{DELIVERY_LABELS[value]}</span>
    }
    // Simulation mode
    if (key === 'mode' && SIM_MODE_LABELS[value]) {
      return <span>{SIM_MODE_LABELS[value]}</span>
    }
    // Overall status
    if (key === 'overallStatus' && STATUS_LABELS[value]) {
      return <span className="dr-badge">{STATUS_LABELS[value]}</span>
    }
    return <span className="dr-string">{value}</span>
  }

  // Arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="dr-null">— ninguno —</span>

    // Inferences (enrich output)
    if (key === 'inferences' && value[0]?.field) {
      return (
        <div className="dr-list">
          {value.map((inf: any, i: number) => (
            <div key={i} className="dr-inference-card">
              <div className="dr-inference-header">
                <strong>{inf.field}</strong>
                <span className="dr-conf-badge">{CONFIDENCE_LABELS[inf.confidence] ?? inf.confidence}</span>
              </div>
              <div className="dr-inference-value">→ {String(inf.value)}</div>
              {inf.reason && <div className="dr-inference-reason">{inf.reason}</div>}
            </div>
          ))}
        </div>
      )
    }

    // Findings (simulate output)
    if (key === 'findings' || key === 'failingFindings' || key === 'unresolvableFindings') {
      return (
        <div className="dr-list">
          {value.map((f: any, i: number) => (
            <div key={i} className="dr-finding-card">
              <span className="dr-finding-status">{STATUS_LABELS[f.status] ?? f.status}</span>
              <code className="dr-finding-code">{f.code}</code>
              {f.params && <span className="dr-finding-params">{JSON.stringify(f.params)}</span>}
            </div>
          ))}
        </div>
      )
    }

    // Eventos (build output): show count + first 3
    if (key === 'eventos') {
      const preview = value.slice(0, 3)
      return (
        <div className="dr-eventos">
          <div className="dr-eventos-count">{value.length} eventos programados</div>
          {preview.map((ev: any, i: number) => (
            <div key={i} className="dr-evento-card">
              <span className="dr-evento-when">Sem {ev.semana} · {ev.dia} {ev.hora}</span>
              <span className="dr-evento-what">{ev.actividad}</span>
              <span className="dr-evento-meta">{ev.duracion} min · {ev.categoria}</span>
            </div>
          ))}
          {value.length > 3 && (
            <div className="dr-eventos-more">… y {value.length - 3} eventos más</div>
          )}
        </div>
      )
    }

    // Strings array (warnings, errors, constraints)
    if (typeof value[0] === 'string') {
      return (
        <ul className="dr-string-list">
          {value.map((s: string, i: number) => <li key={i}>{s}</li>)}
        </ul>
      )
    }

    // Fallback for unknown arrays
    return <span className="dr-array">[{value.length} elementos]</span>
  }

  // Objects (tokensUsed, etc.)
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>

    // Tokens
    if (key === 'tokensUsed' && ('input' in obj || 'output' in obj)) {
      return (
        <span className="dr-tokens">
          📥 {Number(obj.input ?? 0).toLocaleString('es-AR')} entrada · 📤 {Number(obj.output ?? 0).toLocaleString('es-AR')} salida
        </span>
      )
    }

    // Fallback: render as mini key-value
    return (
      <div className="dr-nested">
        {Object.entries(obj).map(([k, v]) => (
          <div key={k} className="dr-nested-row">
            <span className="dr-nested-key">{FIELD_LABELS[k] ?? k}:</span>
            <span className="dr-nested-val">{String(v)}</span>
          </div>
        ))}
      </div>
    )
  }

  return <span>{String(value)}</span>
}

function DataRenderer({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="dr-container">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="dr-row">
          <div className="dr-label">{FIELD_LABELS[key] ?? key}</div>
          <div className="dr-value">{renderValue(key, value)}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Phase I/O Tabbed Renderer ────────────────────────────────────────────────

function IOTabs({ input, output, processing, durationMs }: { input: any, output: any, processing?: string, durationMs?: number }) {
  const [activeTab, setActiveTab] = React.useState<'in' | 'proc' | 'out'>('proc')

  return (
    <div className="io-tabs-container">
      <div className="io-tabs-header">
        <button 
          className={`io-tab-btn ${activeTab === 'in' ? 'active' : ''}`}
          onClick={() => setActiveTab('in')}
        >
          {t('debug.flow.tab_input')}
        </button>
        <button 
          className={`io-tab-btn ${activeTab === 'proc' ? 'active' : ''}`}
          onClick={() => setActiveTab('proc')}
        >
          {t('debug.flow.tab_processing')}
        </button>
        <button 
          className={`io-tab-btn ${activeTab === 'out' ? 'active' : ''}`}
          onClick={() => setActiveTab('out')}
        >
          {t('debug.flow.tab_output')}
        </button>
      </div>

      <div className="io-tab-content">
        {activeTab === 'in' && (
          <DataRenderer data={input as Record<string, unknown>} />
        )}
        {activeTab === 'proc' && (
          <div className="io-proc-view">
            <p className="proc-desc">{processing || t('debug.flow.no_processing_info')}</p>
            {durationMs !== undefined && (
              <div className="proc-meta">
                <span>{t('debug.flow.duration')}:</span>
                <strong>{formatDuration(durationMs)}</strong>
              </div>
            )}
          </div>
        )}
        {activeTab === 'out' && (
          <DataRenderer data={output as Record<string, unknown>} />
        )}
      </div>
    </div>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const secs = (ms / 1000).toFixed(1)
  return `${secs}s`
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

export function FlowDetailModal({ phaseId, phaseName, phaseColor, runtimeData, fullRuntimeData, onClose }: ModalProps) {
  const resolvedPhase = phaseId === 'simulation' ? 'simulate' : phaseId

  useEffect(() => {
    document.body.classList.add('antigravity-scroll-lock')
    return () => document.body.classList.remove('antigravity-scroll-lock')
  }, [])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  function renderContent() {
    // v3: si hay datos PhaseIO en el contexto global, usar tabs genéricos
    const phaseData = fullRuntimeData?.phases?.[resolvedPhase]
    if (phaseData) {
      return <IOTabs input={phaseData.input} output={phaseData.output} processing={phaseData.processing} durationMs={phaseData.durationMs} />
    }
    // v2 Legacy fallback: renderers específicos por fase
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
