'use client'

import React, { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { t } from '../../src/i18n'
import type { FlowNodeRuntimeStatus } from '@lib/flow/types'

const STATUS_COLORS: Record<FlowNodeRuntimeStatus, string> = {
  pending: '#888',
  running: '#f2bf82',
  success: '#6ed7a5',
  error: '#ff6b6b',
  skipped: '#64748b'
}

function RuntimeSummary({ phaseId, runtimeData }: { phaseId: string; runtimeData: Record<string, unknown> }) {
  const resolvedPhase = phaseId === 'simulation' ? 'simulate' : phaseId

  if (resolvedPhase === 'intake') {
    const d = runtimeData as { profileId?: string; nombre?: string; objetivo?: string }
    return (
      <div className="node-runtime-summary">
        {d.nombre && (
          <span className="node-runtime-row node-runtime-name">{d.nombre}</span>
        )}
        {d.objetivo && (
          <span className="node-runtime-row" style={{ fontSize: '0.75rem', color: '#9d9a97' }}>
            {d.objetivo.length > 80 ? d.objetivo.slice(0, 80) + '…' : d.objetivo}
          </span>
        )}
        <span className="node-runtime-row">{t('debug.flow.intake_profile_id')}: <code>{String(d.profileId ?? '').slice(0, 8)}...</code></span>
      </div>
    )
  }

  if (resolvedPhase === 'enrich') {
    const d = runtimeData as { inferences?: unknown[]; warnings?: unknown[] }
    return (
      <div className="node-runtime-summary">
        <span className="node-runtime-row">{t('debug.flow.summary_inferences', { count: d.inferences?.length ?? 0 })}</span>
        {(d.warnings?.length ?? 0) > 0 && (
          <span className="node-runtime-row node-runtime-warn">{t('debug.flow.summary_warnings', { count: d.warnings?.length ?? 0 })}</span>
        )}
      </div>
    )
  }

  if (resolvedPhase === 'readiness') {
    const d = runtimeData as { warnings?: string[]; constraints?: string[] }
    const warnCount = d.warnings?.length ?? 0
    const constraintCount = d.constraints?.length ?? 0
    return (
      <div className="node-runtime-summary">
        <span className="node-runtime-row">{t('debug.flow.summary_constraints', { count: constraintCount })}</span>
        {warnCount > 0 && (
          <span className="node-runtime-row node-runtime-warn">{t('debug.flow.summary_warnings', { count: warnCount })}</span>
        )}
      </div>
    )
  }

  if (resolvedPhase === 'build') {
    const d = runtimeData as { nombre?: string; eventCount?: number; resumen?: string; fallbackUsed?: boolean }
    return (
      <div className="node-runtime-summary">
        <span className="node-runtime-row node-runtime-name">{d.nombre ?? '—'}</span>
        {d.resumen && (
          <span className="node-runtime-row" style={{ fontSize: '0.75rem', color: '#9d9a97' }}>
            {d.resumen.length > 80 ? d.resumen.slice(0, 80) + '…' : d.resumen}
          </span>
        )}
        <span className="node-runtime-row">{t('debug.flow.summary_events', { count: d.eventCount ?? 0 })}</span>
        {d.fallbackUsed && (
          <span className="node-runtime-row node-runtime-warn">⚠ {t('debug.flow.build_fallback_used')}</span>
        )}
      </div>
    )
  }

  if (resolvedPhase === 'simulate') {
    const d = runtimeData as { qualityScore?: number; findings?: unknown[] }
    return (
      <div className="node-runtime-summary">
        <span className="node-runtime-row">{t('debug.flow.summary_score', { score: d.qualityScore ?? 0 })}</span>
        <span className="node-runtime-row">{t('debug.flow.summary_findings', { count: d.findings?.length ?? 0 })}</span>
      </div>
    )
  }

  if (resolvedPhase === 'repair') {
    const d = runtimeData as { attempts?: number; history?: Array<{ qualityScore?: number }> }
    const best = d.history?.reduce((max, h) => Math.max(max, h.qualityScore ?? 0), 0) ?? 0
    return (
      <div className="node-runtime-summary">
        <span className="node-runtime-row">{t('debug.flow.summary_attempts', { count: d.attempts ?? 0 })}</span>
        <span className="node-runtime-row">{t('debug.flow.summary_best_score', { score: best })}</span>
      </div>
    )
  }

  if (resolvedPhase === 'output') {
    const d = runtimeData as { deliveryMode?: string; finalQualityScore?: number }
    const modeLabels: Record<string, string> = { 'pass': 'aprobado', 'warn-acceptable': 'aceptable con avisos', 'best-effort': 'mejor esfuerzo' }
    const modeLabel = modeLabels[d.deliveryMode ?? ''] ?? d.deliveryMode ?? '—'
    return (
      <div className="node-runtime-summary">
        <span className="node-runtime-row">{t('debug.flow.summary_delivery', { mode: modeLabel })}</span>
        <span className="node-runtime-row">{t('debug.flow.summary_score', { score: d.finalQualityScore ?? 0 })}</span>
      </div>
    )
  }

  return null
}

export const FlowStepNode = memo(({ data }: { data: any }) => {
  const { label, description, type, phase, color, phaseId, tags, questions, prompt, runtimeData, fullRuntimeData, runtimeStatus, onInspect } = data

  const typeClassMap: Record<string, string> = {
    action: 'type-action',
    validation: 'type-validation',
    persistence: 'type-persistence',
    external: 'type-external',
    output: 'type-output',
    branch: 'type-action',
    loop: 'type-action',
  }

  const typeLabels: Record<string, string> = {
    action: 'Paso',
    validation: 'Validación',
    persistence: 'Persistencia',
    external: 'Agente (LLM)',
    output: 'Salida',
    branch: 'Bifurcación',
    loop: 'Loop',
  }

  const statusColor = runtimeStatus ? STATUS_COLORS[runtimeStatus as FlowNodeRuntimeStatus] : undefined

  return (
    <div
      className={`flow-step-node${runtimeData ? ' node-has-runtime' : ''}${runtimeStatus === 'skipped' ? ' flow-step-node--skipped' : ''}`}
      onClick={runtimeData && onInspect ? () => onInspect(data) : undefined}
    >
      {/* Indicador lateral de fase con glow */}
      <div
        className="node-phase-indicator"
        style={{ backgroundColor: color, color: color }}
      />

      {runtimeStatus && (
        <div
          className={`node-status-dot${runtimeStatus === 'running' ? ' node-status-dot--running' : ''}`}
          style={{ backgroundColor: statusColor }}
          title={t(`debug.flow.status_${runtimeStatus}`)}
        />
      )}

      <Handle type="target" position={Position.Left} />

      <div className="node-content">
        <div className="node-header">
          <span className="node-phase-label">{phase}</span>
          <div className="node-header-badges">
            {fullRuntimeData?.phases?.[phaseId === 'simulation' ? 'simulate' : phaseId] && (
              <span className="node-io-badge" title="Contrato E/S disponible">E/S</span>
            )}
            <span className={`node-type-badge ${typeClassMap[type] || ''}`}>
              {typeLabels[type] || type}
            </span>
          </div>
        </div>

        <h3 className="node-title">{label}</h3>
        <p className="node-description">{description}</p>

        {/* Runtime summary: datos reales del pipeline */}
        {runtimeData && (
          <RuntimeSummary phaseId={phaseId ?? ''} runtimeData={runtimeData} />
        )}

        {/* Renderizado del PROMPT del Agente si existe */}
        {prompt && (
          <div className="node-prompt-section">
            <h4 className="node-prompt-title">📥 Prompt de Entrada / Misión:</h4>
            <div className="node-prompt-box">
              <span className="prompt-quote">"</span>
              {prompt}
              <span className="prompt-quote">"</span>
            </div>
          </div>
        )}

        {/* Renderizado de preguntas clave / campos exactos */}
        {questions && questions.length > 0 && (
          <div className="node-questions-section">
            <h4 className="node-questions-title">🔍 Contexto y Entradas:</h4>
            <ul className="node-questions-list">
              {questions.map((q: string, idx: number) => (
                <li key={idx} className="node-question-item">
                  <span className="question-bullet">•</span> {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        {tags && tags.length > 0 && (
          <div className="node-tags">
            {tags.map((tag: string) => (
              <span key={tag} className="node-tag">#{tag}</span>
            ))}
          </div>
        )}

        {runtimeData && (
          <div className="node-click-hint">
            <span>🔍</span> {t('debug.flow.click_to_inspect')}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  )
})

FlowStepNode.displayName = 'FlowStepNode'
