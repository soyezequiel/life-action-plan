import type { FlowPhase, FlowPhaseGroup, FlowStep } from './types'

export const FLOW_PHASE_GROUPS: FlowPhaseGroup[] = [
  { id: 'understand', label: 'Entender', color: '#6ed7a5' },
  { id: 'plan', label: 'Planificar', color: '#8fa8ff' },
  { id: 'deliver', label: 'Validar y entregar', color: '#f2bf82' }
]

export const FLOW_PHASES: FlowPhase[] = [
  { id: 'classify', name: 'Classify', color: '#6ed7a5', groupId: 'understand' },
  { id: 'requirements', name: 'Requirements', color: '#6ed7a5', groupId: 'understand' },
  { id: 'profile', name: 'Profile', color: '#6ed7a5', groupId: 'understand' },
  { id: 'strategy', name: 'Strategy', color: '#8fa8ff', groupId: 'plan' },
  { id: 'template', name: 'Template', color: '#8fa8ff', groupId: 'plan' },
  { id: 'schedule', name: 'Schedule', color: '#8fa8ff', groupId: 'plan' },
  { id: 'hardValidate', name: 'Hard Validate', color: '#f2bf82', groupId: 'deliver' },
  { id: 'softValidate', name: 'Soft Validate', color: '#f2bf82', groupId: 'deliver' },
  { id: 'coveVerify', name: 'CoVe Verify', color: '#f2bf82', groupId: 'deliver' },
  { id: 'repair', name: 'Repair', color: '#f2bf82', groupId: 'deliver' },
  { id: 'package', name: 'Package', color: '#f2bf82', groupId: 'deliver' },
  { id: 'adapt', name: 'Adapt', color: '#f2bf82', groupId: 'deliver' }
]

export const FLOW_STEPS: FlowStep[] = [
  {
    id: 'classify',
    phaseId: 'classify',
    name: 'Classify Goal',
    description: 'Clasifica el objetivo y detecta senales para decidir el tipo de plan.',
    type: 'validation',
    tags: ['goal-type', 'signals']
  },
  {
    id: 'requirements',
    phaseId: 'requirements',
    name: 'Generate Requirements',
    description: 'Genera preguntas concretas para completar el contexto minimo del objetivo.',
    type: 'external',
    dependsOn: ['classify'],
    tags: ['llm', 'questions']
  },
  {
    id: 'profile',
    phaseId: 'profile',
    name: 'Build Profile',
    description: 'Convierte respuestas abiertas en un perfil operativo con disponibilidad y restricciones.',
    type: 'external',
    dependsOn: ['requirements'],
    tags: ['llm', 'constraints']
  },
  {
    id: 'strategy',
    phaseId: 'strategy',
    name: 'Build Strategy',
    description: 'Arma el roadmap estrategico con etapas e hitos usando el perfil y el tipo de objetivo.',
    type: 'external',
    dependsOn: ['profile'],
    tags: ['llm', 'roadmap']
  },
  {
    id: 'template',
    phaseId: 'template',
    name: 'Build Template',
    description: 'Baja la estrategia a actividades pedibles por el scheduler de manera deterministica.',
    type: 'action',
    dependsOn: ['strategy'],
    tags: ['activities']
  },
  {
    id: 'schedule',
    phaseId: 'schedule',
    name: 'Solve Schedule',
    description: 'Resuelve el calendario semanal con el scheduler MILP.',
    type: 'action',
    dependsOn: ['template'],
    tags: ['milp', 'calendar']
  },
  {
    id: 'hardValidate',
    phaseId: 'hardValidate',
    name: 'Hard Validate',
    description: 'Verifica reglas duras del calendario contra disponibilidad, duracion y frecuencia.',
    type: 'validation',
    dependsOn: ['schedule', 'repair'],
    tags: ['fail-fast', 'rules']
  },
  {
    id: 'softValidate',
    phaseId: 'softValidate',
    name: 'Soft Validate',
    description: 'Evalua calidad practica del plan: fatiga, cambios de foco y descanso.',
    type: 'validation',
    dependsOn: ['hardValidate'],
    tags: ['warn', 'quality']
  },
  {
    id: 'coveVerify',
    phaseId: 'coveVerify',
    name: 'CoVe Verify',
    description: 'Hace chequeos de verificacion sobre el calendario y devuelve hallazgos explicitos.',
    type: 'external',
    dependsOn: ['softValidate'],
    tags: ['llm', 'verification']
  },
  {
    id: 'repair',
    phaseId: 'repair',
    name: 'Repair Loop',
    description: 'Aplica reparaciones sobre el calendario si hay fallas o advertencias relevantes.',
    type: 'loop',
    dependsOn: ['coveVerify'],
    tags: ['repair', 'loop']
  },
  {
    id: 'package',
    phaseId: 'package',
    name: 'Package Result',
    description: 'Empaqueta el resultado final en items del plan, resumen y advertencias honestas.',
    type: 'output',
    dependsOn: ['coveVerify'],
    tags: ['delivery', 'quality']
  },
  {
    id: 'adapt',
    phaseId: 'adapt',
    name: 'Adapt Week',
    description: 'Evalua adherencia, pronostica riesgo y emite el payload operativo para relanzar la semana.',
    type: 'external',
    dependsOn: ['package'],
    tags: ['feedback', 'rerun']
  }
]
