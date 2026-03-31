/**
 * Utilidad para formatear eventos de debug del orquestador en la consola del navegador
 * con estetica Midnight Mint.
 */
export function logPlanificadorDebug(event: any) {
  if (!event || typeof event !== 'object') {
    console.log('[Planificador]', event)
    return
  }

  const { category, action, phase, agent, summary_es, details, sequence, timestamp } = event

  // Colores por categoria
  const categoryLabels: Record<string, string> = {
    lifecycle: 'CICLO DE VIDA',
    agent: 'AGENTE',
    validation: 'VALIDACIÓN',
    error: 'ERROR',
    default: 'SISTEMA'
  }

  const colors: Record<string, string> = {
    lifecycle: '#10b981', // Emerald
    agent: '#6366f1',     // Indigo
    validation: '#f59e0b', // Amber
    error: '#ef4444',      // Red
    default: '#64748b'    // Slate
  }

  const label = categoryLabels[category] || categoryLabels.default
  const bgColor = colors[category] || colors.default
  const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString() : ''
  
  // Header principal con estilo
  console.groupCollapsed(
    `%c LAP %c ${label} %c ${action} %c ${phase || ''} %c ${timeStr}`,
    'background: #1e293b; color: #f8fafc; padding: 2px 4px; border-radius: 4px 0 0 4px; font-weight: bold;',
    `background: ${bgColor}; color: white; padding: 2px 4px; font-weight: bold;`,
    'color: #334155; font-weight: bold; margin-left: 4px;',
    'color: #94a3b8; font-style: italic;',
    'color: #cbd5e1; font-size: 10px; float: right;'
  )

  if (summary_es) {
    console.log(`%c📝 ${summary_es}`, 'color: #334155; font-size: 13px; font-weight: 500; margin: 4px 0;')
  }

  if (agent) {
    console.log(`%c🕵️ Agente: %c${agent}`, 'color: #64748b;', 'color: #6366f1; font-weight: bold;')
  }

  if (details && Object.keys(details).length > 0) {
    console.log('%c🔍 Detalles:', 'color: #64748b; font-weight: bold;')
    console.dir(details)
  }

  console.groupEnd()
}
