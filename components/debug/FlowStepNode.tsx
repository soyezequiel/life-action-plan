'use client'

import React, { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

export const FlowStepNode = memo(({ data }: { data: any }) => {
  const { label, description, type, phase, color, tags, questions, prompt } = data

  const typeClassMap: Record<string, string> = {
    action: 'type-action',
    validation: 'type-validation',
    persistence: 'type-persistence',
    external: 'type-external',
    output: 'type-output',
  }

  const typeLabels: Record<string, string> = {
    action: 'Step',
    validation: 'Validation',
    persistence: 'Persistence',
    external: 'Agent (LLM)',
    output: 'Output',
  }

  return (
    <div className={`flow-step-node`}>
      {/* Indicador lateral de fase con glow */}
      <div 
        className="node-phase-indicator" 
        style={{ backgroundColor: color, color: color }}
      />

      <Handle type="target" position={Position.Left} />
      
      <div className="node-content">
        <div className="node-header">
          <span className="node-phase-label">{phase}</span>
          <span className={`node-type-badge ${typeClassMap[type] || ''}`}>
            {typeLabels[type] || type}
          </span>
        </div>
        
        <h3 className="node-title">{label}</h3>
        <p className="node-description">{description}</p>
        
        {/* Renderizado del PROMPT del Agente si existe */}
        {prompt && (
          <div className="node-prompt-section">
            <h4 className="node-prompt-title">📥 Entry Prompt / Mission:</h4>
            <div className="node-prompt-box">
              <span className="prompt-quote">“</span>
              {prompt}
              <span className="prompt-quote">”</span>
            </div>
          </div>
        )}

        {/* Renderizado de preguntas clave / campos exactos */}
        {questions && questions.length > 0 && (
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

        {tags && tags.length > 0 && (
          <div className="node-tags">
            {tags.map((tag: string) => (
              <span key={tag} className="node-tag">#{tag}</span>
            ))}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  )
})

FlowStepNode.displayName = 'FlowStepNode'
