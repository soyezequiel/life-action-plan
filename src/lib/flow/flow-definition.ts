import type { FlowStep, FlowPhase } from './types'

export const FLOW_PHASES: FlowPhase[] = [
  { id: 'intake', name: '1. Ingesta Multi-Agente', color: '#6ed7a5' },
  { id: 'enrich', name: '2. Enriquecimiento (LLM)', color: '#4fc3f7' },
  { id: 'build', name: '3. Construcción', color: '#f2bf82' },
  { id: 'simulation', name: '4. Auditoría de Realidad', color: '#b987ff' },
  { id: 'repair', name: '5. Loop de Reparación', color: '#ff8a65' },
  { id: 'output', name: '6. Entrega Final', color: '#ffffff' }
]

export const FLOW_STEPS: FlowStep[] = [
  // 1. INTAKE
  {
    id: 'user-narrative-input',
    phaseId: 'intake',
    name: 'INPUT: Narrativa de Vida',
    description: 'Captura de texto/voz del usuario.',
    type: 'action',
    questions: ['¿Cuál es tu objetivo?', '¿Qué disponibilidad tenés?']
  },
  {
    id: 'intake-agent',
    phaseId: 'intake',
    name: 'Agente: Intake Analyst',
    description: 'Extracción de intenciones y metas SMART.',
    type: 'external',
    dependsOn: ['user-narrative-input'],
    tags: ['ia', 'parsing'],
    prompt: 'Analizá y extraé metas concretas y métricas de éxito.'
  },

  // 2. ENRICHMENT
  {
    id: 'enrichment-agent',
    phaseId: 'enrich',
    name: 'Agente: Profile Enricher',
    description: 'Inferencia de rasgos y campos faltantes.',
    type: 'external',
    dependsOn: ['intake-agent'],
    tags: ['ia', 'inference'],
    prompt: 'Inferí energía, disciplina y obstáculos basados en su narrativa.'
  },

  // 3. BUILD
  {
    id: 'strategist-agent',
    phaseId: 'build',
    name: 'Agente: Lead Strategist',
    description: 'Diseño del plan de acción inicial.',
    type: 'external',
    dependsOn: ['enrichment-agent'],
    tags: ['ia', 'strategy'],
    prompt: 'Generá un plan realista de 1 mes respetando sueño/trabajo.'
  },

  // 4. SIMULATION (Audit)
  {
    id: 'simulator-agent',
    phaseId: 'simulation',
    name: 'Agente: Reality Simulator',
    description: 'Evaluación de colisiones, fatiga y viabilidad.',
    type: 'external',
    dependsOn: ['strategist-agent', 're-verification-loop'], // LOOP BACK
    tags: ['ia', 'audit'],
    prompt: 'Detectá lapsos imposibles o sobrecarga energética.',
    questions: ['¿Status: PASS | FAIL?']
  },

  // 5. REPAIR LOOP (Decision & Healing)
  {
    id: 'viability-branch',
    phaseId: 'repair',
    name: 'Decision: ¿Plan Viable?',
    description: 'Bifurcación lógica basada en el resultado de la simulación.',
    type: 'branch',
    dependsOn: ['simulator-agent'],
    questions: [
      'Si PASS -> Ir a Entrega', 
      'Si FAIL -> Enviar a Reparación Quirúrgica'
    ]
  },
  {
    id: 'repair-agent',
    phaseId: 'repair',
    name: 'Agente: Surgical Repair',
    description: 'Corrección activa de los problemas detectados.',
    type: 'external',
    dependsOn: ['viability-branch'],
    tags: ['ia', 'healing', 'loop-entry'],
    prompt: 'Repará EXCLUSIVAMENTE los puntos marcados como fallidos por el simulador.',
    questions: ['¿Se resolvieron los conflictos?']
  },
  {
    id: 're-verification-loop',
    phaseId: 'repair',
    name: 'Re-Verificación (LOOP BACK)',
    description: 'El plan corregido vuelve a ser auditado por el simulador de realidad.',
    type: 'loop',
    dependsOn: ['repair-agent'],
    tags: ['loop-exit'],
    questions: ['¿Regresar a simulación para validez final?']
  },

  // 6. OUTPUT
  {
    id: 'final-delivery-bundle',
    phaseId: 'output',
    name: 'OUTPUT: Plan Validado',
    description: 'Entrega final después de confirmar viabilidad.',
    type: 'output',
    dependsOn: ['viability-branch'],
    questions: ['¿El plan final es "Infalible"?']
  }
]
