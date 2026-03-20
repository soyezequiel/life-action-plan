import esAR from './locales/es-AR.json'

type NestedKeyOf<T, Prefix extends string = ''> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? NestedKeyOf<T[K], `${Prefix}${K}.`>
        : `${Prefix}${K}`
    }[keyof T & string]
  : never

export type TranslationKey = NestedKeyOf<typeof esAR>

const locales: Record<string, Record<string, unknown>> = {
  'es-AR': esAR
}

const runtimeFallbacks: Record<string, string> = {
  'errors.request_timeout': 'La respuesta esta tardando demasiado. Intenta de nuevo en un ratito.',
  'errors.network_unavailable': 'No pude conectarme. Revisa tu internet o el servicio local y volve a intentar.',
  'errors.service_unavailable': 'Hay una configuracion pendiente del lado del servidor. Revisala y volve a intentar.',
  'errors.dev_missing_env': 'Falta {{name}} en el servidor local. Revisalo y volve a intentar.',
  'errors.save_failed': 'No pude guardar ese dato. Intenta de nuevo.',
  'errors.invalid_request': 'No pude entender ese pedido. Revisalo e intenta de nuevo.',
  'errors.profile_not_found': 'No encontre tu perfil guardado.',
  'errors.plan_not_found': 'No encontre ese plan.',
  'debug.snapshot_connecting': 'Conectando el inspector...',
  'debug.snapshot_ready': 'Snapshot activo.',
  'debug.snapshot_ready_at': 'Snapshot activo. Ultima actualizacion: {{date}}',
  'debug.snapshot_error': 'No pude actualizar el inspector. Voy a seguir reintentando.',
  'builder.provider_online': 'asistente en linea',
  'builder.provider_local': 'asistente local',
  'builder.progress_provider': 'Ruta activa: {{provider}}',
  'builder.route_online_done': 'Este plan se armo con el asistente en linea.',
  'builder.route_local_done': 'Este plan se armo con el asistente local.',
  'builder.route_fallback_done': 'Este plan se termino con el respaldo local.',
  'builder.local_unavailable_deploy': 'El asistente local solo funciona en tu maquina. En este entorno usa el asistente en linea.',
  'intake.tip_enter': 'Podes avanzar con Enter.',
  'intake.tip_finish': 'La ultima respuesta dispara el armado de tu plan.',
  'dashboard.today_summary': '{{count}} actividades para hoy',
  'dashboard.actions_title': 'Acciones del plan',
  'dashboard.actions_hint_local': 'En esta maquina tambien podes usar el asistente local.',
  'dashboard.wallet_saved': 'Conexion guardada',
  'dashboard.wallet_alias': 'Alias: {{alias}}',
  'dashboard.wallet_budget': 'Presupuesto usado: {{used}} de {{total}} sats',
  'dashboard.wallet_budget_remaining': 'Todavia te quedan {{sats}} sats disponibles',
  'dashboard.wallet_budget_open': 'Esta conexion no marco un tope de gasto.',
  'dashboard.wallet_saved_hint': 'La conexion esta guardada, pero ahora no pude validar la billetera.',
  'dashboard.wallet_connect_hint': 'Conectala cuando quieras habilitar pagos y presupuesto.',
  'dashboard.cost_title': 'Costo del plan',
  'dashboard.cost_sats_estimated': '{{sats}} sats estimados',
  'dashboard.cost_usd': 'Equivale a {{usd}} aprox.',
  'dashboard.cost_estimated_hint': 'Es una referencia del uso del asistente en linea.',
  'dashboard.cost_local_free': 'Sin gasto en sats',
  'dashboard.cost_local_hint': 'Este armado se resolvio con el asistente local en esta maquina.',
  'dashboard.cost_empty_hint': 'Cuando armes o revises el plan, vas a verlo aca.',
  'dashboard.cost_operation_repeat': '{{label}} x{{count}}',
  'dashboard.cost_operation_estimated': '{{sats}} sats estimados',
  'dashboard.cost_operation_free': 'Sin costo',
  'dashboard.cost_operation.plan_build': 'Armado del plan',
  'dashboard.cost_operation.plan_simulate': 'Revision del plan',
  'dashboard.cost_operation.other': 'Otra accion',
  'settings.local_build_title': 'Preparar asistente local',
  'settings.local_build_hint': 'En esta maquina podes armar el plan sin cargar una clave.',
  'settings.build_route_hint': 'Ruta elegida: {{provider}}'
}

let currentLocale = 'es-AR'

export function setLocale(locale: string): void {
  if (locales[locale]) {
    currentLocale = locale
  }
}

export function getCurrentLocale(): string {
  return currentLocale
}

export function t(key: string, params?: Record<string, string | number>): string {
  const keys = key.split('.')
  let value: unknown = locales[currentLocale] ?? locales['es-AR']

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k]
    } else {
      value = runtimeFallbacks[key]
      break
    }
  }

  if (typeof value !== 'string') return key

  if (params) {
    return value.replace(/\{\{(\w+)\}\}/g, (_, paramKey) =>
      params[paramKey] !== undefined ? String(params[paramKey]) : `{{${paramKey}}}`
    )
  }

  return value
}
