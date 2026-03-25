'use client'

import React, { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

export const FlowStepNode = memo(({ data }: { data: any }) => {
  const { label, description, type, id, phaseId: rawPhaseId, phase, color, tags, questions, prompt, active, completed, results } = data
  // Normalize: flow-definition uses 'simulation' but pipeline stores 'simulate'
  const phaseId = rawPhaseId === 'simulation' ? 'simulate' : rawPhaseId

  const typeClassMap: Record<string, string> = {
    action: 'type-action',
    validation: 'type-validation',
    persistence: 'type-persistence',
    external: 'type-external',
    output: 'type-output',
    branch: 'type-validation',
    loop: 'type-action'
  }

  const typeLabels: Record<string, string> = {
    action: 'Step',
    validation: 'Validation',
    persistence: 'Persistence',
    external: 'Agent (LLM)',
    output: 'Output',
    branch: 'Decision',
    loop: 'Loop'
  }

  // Si está completado, usamos un color desaturado o un check
  const nodeClass = `flow-step-node ${active ? 'node-active-pulse' : ''} ${completed ? 'node-completed' : ''}`

  return (
    <div className={nodeClass}>
      {/* Indicador lateral de fase con glow */}
      <div 
        className="node-phase-indicator" 
        style={{ 
          backgroundColor: completed ? '#444' : color, 
          boxShadow: completed ? 'none' : `0 0 12px ${color}`
        }}
      />

      <Handle type="target" position={Position.Left} />
      
      <div className="node-content">
        <div className="node-header">
          <span className="node-phase-label" style={{ color: completed ? '#555' : '#8f8a86' }}>{phase}</span>
          <span className={`node-type-badge ${typeClassMap[type] || ''}`}>
            {completed ? '✓ Finalizado' : typeLabels[type] || type}
          </span>
        </div>
        
        <h3 className="node-title" style={{ color: completed ? '#777' : '#fff' }}>{label}</h3>
        <p className="node-description" style={{ color: completed ? '#555' : '#b9b5b2' }}>{description}</p>
        
        {/* Indicador visual de ejecución en vivo */}
        {active && (
          <div className="node-execution-badge">
            <span className="execution-pulse"></span>
            PROCESANDO...
          </div>
        )}

        {/* Renderizado del PROMPT del Agente si existe (Oculto en completado para limpiar la vista) */}
        {prompt && !completed && (
          <div className="node-prompt-section">
            <h4 className="node-prompt-title">📥 Mission Context:</h4>
            <div className="node-prompt-box">
              <span className="prompt-quote">“</span>
              {prompt}
              <span className="prompt-quote">”</span>
            </div>
          </div>
        )}

        {/* Renderizado de preguntas clave / campos exactos */}
        {questions && questions.length > 0 && !completed && (
          <div className="node-questions-section">
            <h4 className="node-questions-title">🔍 Context & Inputs:</h4>
            <ul className="node-questions-list">
              {questions.map((q: string, idx: number) => (
                <li key={idx} className="node-question-item">
                  <span className="question-bullet">•</span> {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        {tags && tags.length > 0 && !completed && (
          <div className="node-tags">
            {tags.map((tag: string) => (
              <span key={tag} className="node-tag">#{tag}</span>
            ))}
          </div>
        )}

        {/* --- RESULTS SECTION --- */}
        {completed && results && (
          <div className="node-results-section">
            <div className="results-header">
              <span className="results-duration">⏱ {results.durationMs}ms</span>
              {results.tracesCount > 0 && (
                <span className="results-traces">🧠 {results.tracesCount} LLM Call{results.tracesCount > 1 ? 's' : ''}</span>
              )}
            </div>

            {phaseId === 'intake' && results.input?.config?.intake && (
              <div className="result-item">
                <span className="result-label">Usuario:</span>
                <span className="result-value">{results.input.config.intake.nombre}</span>
              </div>
            )}
            
            {phaseId === 'enrich' && results.output?.inferences && (
              <div className="result-item">
                <span className="result-label">Lógica:</span>
                <span className="result-value">{results.output.inferences.length} Inferencias deducidas</span>
              </div>
            )}

            {phaseId === 'build' && results.output?.planId && (
              <>
                <div className="result-item">
                  <span className="result-label">Plan ID:</span>
                  <span className="result-value" style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.7rem' }}>
                    {results.output.planId.split('-')[0]}...
                  </span>
                </div>
                <div className="result-item">
                  <span className="result-label">Eventos:</span>
                  <span className="result-value">{results.output.eventsCount}</span>
                </div>
              </>
            )}

            {phaseId === 'simulate' && results.output?.qualityScore !== undefined && (
              <>
                <div className="result-item">
                  <span className="result-label">Calidad:</span>
                  <span className="result-value">
                    <span className={`result-badge-${results.output.status?.toLowerCase() || 'pass'}`}>
                      {results.output.qualityScore}/100
                    </span>
                  </span>
                </div>
                {results.output.findings && results.output.findings.length > 0 && (
                  <div className="result-findings">
                    {results.output.findings.slice(0, 2).map((f: any, i: number) => (
                      <div key={i} className="finding-row">
                        <span className={`finding-status ${f.status === 'WARN' ? 'text-warn' : 'text-pass'}`}>
                          [{f.status}]
                        </span> {f.code}
                      </div>
                    ))}
                    {results.output.findings.length > 2 && (
                      <div className="finding-row text-muted">...y {results.output.findings.length - 2} más</div>
                    )}
                  </div>
                )}
              </>
            )}

            {phaseId === 'output' && results.output && (
              <div className="result-item">
                <span className="result-label">Score Final:</span>
                <span className="result-value result-badge-pass">{results.output.finalQualityScore}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  )
})

FlowStepNode.displayName = 'FlowStepNode'
