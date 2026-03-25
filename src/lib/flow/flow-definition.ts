import type { FlowStep, FlowPhase } from './types'

export const FLOW_PHASES: FlowPhase[] = [
  { id: 'intake', name: '1. Ingesta Multi-Agente', color: '#6ed7a5' },
  { id: 'enrich', name: '2. Enriquecimiento (LLM)', color: '#4fc3f7' },
  { id: 'readiness', name: '3. Comprobación de Preparación', color: '#80deea' },
  { id: 'build', name: '4. Construcción', color: '#f2bf82' },
  { id: 'simulation', name: '5. Auditoría de Realidad', color: '#b987ff' },
  { id: 'repair', name: '6. Loop de Reparación', color: '#ff8a65' },
  { id: 'output', name: '7. Entrega Final', color: '#ffffff' }
]

export const FLOW_STEPS: FlowStep[] = [
  // 1. INGESTA
  {
    id: 'user-narrative-input',
    phaseId: 'intake',
    name: 'ENTRADA: Narrativa de Vida',
    description: 'Captura de texto/voz del usuario.',
    type: 'action',
    questions: ['¿Cuál es tu objetivo?', '¿Qué disponibilidad tenés?']
  },
  {
    id: 'intake-agent',
    phaseId: 'intake',
    name: 'Agente: Analista de Ingesta',
    description: 'Extracción de intenciones y metas SMART.',
    type: 'external',
    dependsOn: ['user-narrative-input'],
    tags: ['ia', 'parsing'],
    prompt: 'Analizá y extraé metas concretas y métricas de éxito.'
  },

  // 2. ENRIQUECIMIENTO
  {
    id: 'enrichment-agent',
    phaseId: 'enrich',
    name: 'Agente: Enriquecedor de Perfil',
    description: 'Inferencia de rasgos y campos faltantes.',
    type: 'external',
    dependsOn: ['intake-agent'],
    tags: ['ia', 'inferencia'],
    prompt: 'Inferí energía, disciplina y obstáculos basados en su narrativa.'
  },

  // 3. COMPROBACIÓN DE PREPARACIÓN
  {
    id: 'readiness-gate',
    phaseId: 'readiness',
    name: 'Comprobación: ¿Listo para planificar?',
    description: 'Valida que el perfil tenga datos suficientes para construir un plan viable.',
    type: 'validation',
    dependsOn: ['enrichment-agent'],
    tags: ['compuerta', 'validación'],
    questions: ['¿El perfil tiene datos suficientes?', '¿Hay restricciones críticas?']
  },

  // 4. CONSTRUCCIÓN
  {
    id: 'strategist-agent',
    phaseId: 'build',
    name: 'Agente: Estratega Principal',
    description: 'Diseño del plan de acción inicial.',
    type: 'external',
    dependsOn: ['readiness-gate'],
    tags: ['ia', 'estrategia'],
    prompt: 'Generá un plan realista de 1 mes respetando sueño/trabajo.'
  },

  // 5. SIMULACIÓN (Auditoría)
  {
    id: 'simulator-agent',
    phaseId: 'simulation',
    name: 'Agente: Simulador de Realidad',
    description: 'Evaluación de colisiones, fatiga y viabilidad.',
    type: 'external',
    dependsOn: ['strategist-agent', 're-verification-loop'], // LOOP BACK
    tags: ['ia', 'auditoría'],
    prompt: 'Detectá lapsos imposibles o sobrecarga energética.',
    questions: ['¿Estado: PASA | FALLA?']
  },

  // 6. LOOP DE REPARACIÓN (Decisión y Corrección)
  {
    id: 'viability-branch',
    phaseId: 'repair',
    name: 'Decisión: ¿Plan Viable?',
    description: 'Bifurcación lógica basada en el resultado de la simulación.',
    type: 'branch',
    dependsOn: ['simulator-agent'],
    questions: [
      'Si PASA → Ir a Entrega', 
      'Si FALLA → Enviar a Reparación Quirúrgica'
    ]
  },
  {
    id: 'repair-agent',
    phaseId: 'repair',
    name: 'Agente: Reparación Quirúrgica',
    description: 'Corrección activa de los problemas detectados.',
    type: 'external',
    dependsOn: ['viability-branch'],
    tags: ['ia', 'reparación', 'entrada-loop'],
    prompt: 'Repará EXCLUSIVAMENTE los puntos marcados como fallidos por el simulador.',
    questions: ['¿Se resolvieron los conflictos?']
  },
  {
    id: 're-verification-loop',
    phaseId: 'repair',
    name: 'Re-Verificación (VOLVER AL LOOP)',
    description: 'El plan corregido vuelve a ser auditado por el simulador de realidad.',
    type: 'loop',
    dependsOn: ['repair-agent'],
    tags: ['salida-loop'],
    questions: ['¿Regresar a simulación para validez final?']
  },

  // 7. ENTREGA
  {
    id: 'final-delivery-bundle',
    phaseId: 'output',
    name: 'SALIDA: Plan Validado',
    description: 'Entrega final después de confirmar viabilidad.',
    type: 'output',
    dependsOn: ['viability-branch'],
    questions: ['¿El plan final es "Infalible"?']
  }
]
