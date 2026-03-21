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
  'errors.charge_wallet_required': 'Conecta tu billetera antes de usar esta accion.',
  'errors.charge_balance_insufficient': 'Tu saldo disponible no alcanza para esta accion.',
  'errors.charge_budget_insufficient': 'Tu presupuesto disponible no alcanza para esta accion.',
  'errors.charge_permission_denied': 'La billetera conectada no habilita este pago.',
  'errors.charge_temporarily_unavailable': 'No pude preparar el cobro ahora. Intenta de nuevo en un ratito.',
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
  'dashboard.today_summary_one': '1 actividad para hoy',
  'dashboard.today_summary_other': '{{count}} actividades para hoy',
  'dashboard.actions_title': 'Acciones del plan',
  'dashboard.actions_hint_local': 'En esta maquina tambien podes usar el asistente local.',
  'dashboard.wallet_saved': 'Conexion guardada',
  'dashboard.wallet_alias': 'Alias: {{alias}}',
  'dashboard.wallet_budget': 'Presupuesto usado: {{used}} de {{total}} sats',
  'dashboard.wallet_budget_remaining': 'Todavia te quedan {{sats}} sats disponibles',
  'dashboard.wallet_budget_open': 'Esta conexion no marco un tope de gasto.',
  'dashboard.wallet_saved_hint': 'La conexion esta guardada, pero ahora no pude validar la billetera.',
  'dashboard.wallet_connect_hint': 'Conectala cuando quieras habilitar pagos y presupuesto.',
  'dashboard.wallet_build_ready': 'Lista para armar planes pagos',
  'dashboard.wallet_build_ready_hint': 'Esta accion puede cobrar {{sats}} sats.',
  'dashboard.wallet_build_not_ready': 'Todavia no lista para cobrar',
  'dashboard.wallet_build_blocked.wallet_not_connected': 'Conecta tu billetera para usar el armado pago.',
  'dashboard.wallet_build_blocked.insufficient_balance': 'Tu saldo disponible no alcanza para esta accion.',
  'dashboard.wallet_build_blocked.insufficient_budget': 'Tu presupuesto disponible no alcanza para esta accion.',
  'dashboard.wallet_build_blocked.payment_not_allowed': 'Esta conexion no habilita pagos.',
  'dashboard.wallet_build_blocked.receiver_not_configured': 'El cobro real todavia no esta listo en esta maquina.',
  'dashboard.wallet_build_blocked.wallet_connection_unavailable': 'No pude revisar la billetera ahora.',
  'dashboard.wallet_build_blocked.provider_unavailable': 'El cobro real no esta disponible ahora.',
  'dashboard.wallet_build_blocked.invoice_creation_failed': 'No pude preparar el cobro ahora.',
  'dashboard.wallet_build_blocked.payment_failed': 'No pude completar el cobro ahora.',
  'dashboard.wallet_build_blocked.unknown_error': 'No pude confirmar el cobro ahora.',
  'dashboard.wallet_build_blocked.other': 'No pude confirmar si esta accion puede cobrar ahora.',
  'dashboard.cost_title': 'Costo del plan',
  'dashboard.cost_sats_estimated': '{{sats}} sats estimados',
  'dashboard.cost_usd': 'Equivale a {{usd}} aprox.',
  'dashboard.cost_estimated_hint': 'Es una referencia del uso del asistente en linea.',
  'dashboard.cost_local_free': 'Sin gasto en sats',
  'dashboard.cost_local_hint': 'Este armado se resolvio con el asistente local en esta maquina.',
  'dashboard.cost_empty_hint': 'Cuando armes o revises el plan, vas a verlo aca.',
  'dashboard.charge_paid': 'Se cobraron {{sats}} sats',
  'dashboard.charge_paid_hint': 'Esta accion quedo cobrada en tu billetera.',
  'dashboard.charge_rejected': 'El cobro fue rechazado',
  'dashboard.charge_rejected_hint': 'La accion no se llego a guardar.',
  'dashboard.charge_failed': 'No se pudo cobrar',
  'dashboard.charge_failed_hint': 'La accion no quedo confirmada.',
  'dashboard.charge_skipped': 'Esta accion no cobro',
  'dashboard.charge_skipped_hint': 'No correspondia cobrar por esta ruta.',
  'dashboard.cost_operation_repeat': '{{label}} x{{count}}',
  'dashboard.cost_operation_estimated': '{{sats}} sats estimados',
  'dashboard.cost_operation_free': 'Sin costo',
  'dashboard.charge_operation_paid': '{{sats}} sats cobrados',
  'dashboard.charge_operation_rejected': 'Cobro rechazado',
  'dashboard.charge_operation_failed': 'Cobro fallido',
  'dashboard.charge_operation_skipped': 'No cobro',
  'dashboard.cost_operation.plan_build': 'Armado del plan',
  'dashboard.cost_operation.plan_simulate': 'Revision del plan',
  'dashboard.cost_operation.other': 'Otra accion',
  'dashboard.build_openrouter': 'Armar con asistente alternativo',
  'settings.local_build_title': 'Preparar asistente local',
  'settings.local_build_hint': 'En esta maquina podes armar el plan sin cargar una clave.',
  'settings.build_route_hint': 'Ruta elegida: {{provider}}',
  'settings.build_charge_hint': 'Esta accion va a cobrar {{sats}} sats.',
  'settings.build_charge_ready': 'Tu billetera esta lista para este cobro.',
  'settings.build_resource_choice_title': 'Elegi que recurso queres usar',
  'settings.build_resource_choice_backend': 'Usar una API del sistema',
  'settings.build_resource_choice_user': 'Usar mi propia clave',
  'settings.backend_credential_default_label': 'principal',
  'settings.backend_credential_select_empty': 'Todavia no hay una API del sistema para esta ruta.',
  'settings.backend_credential_selected': 'API del sistema elegida: {{name}}',
  'settings.backend_credential_missing_for_build': 'Elegi una API del sistema antes de armar el plan.',
  'settings.backend_credentials_eyebrow': 'APIs del sistema',
  'settings.backend_credentials_title': 'Cargar APIs del backend',
  'settings.backend_credentials_hint': 'Guarda las claves del sistema en el servidor y despues elegi cual usar en el armado.',
  'settings.backend_credentials_empty': 'Todavia no guardaste ninguna API del sistema.',
  'settings.backend_credential_label_placeholder': 'Nombre interno, por ejemplo principal',
  'settings.backend_credential_key_placeholder': 'Pegá la clave del sistema',
  'settings.backend_credential_save': 'Guardar API del sistema',
  'settings.backend_credential_saving': 'Guardando API...',
  'settings.backend_credential_saved': 'La API del sistema quedo guardada.',
  'settings.backend_credential_error': 'No pude guardar la API del sistema. Revisa la clave e intenta de nuevo.',
  'settings.backend_credential_status.active': 'Lista',
  'settings.backend_credential_status.inactive': 'Pausada',
  'settings.backend_credential_status.invalid': 'Revisar',
  'settings.wallet_error_invalid_url': 'Ese enlace no parece una conexion NWC valida.',
  'settings.wallet_error_nwc_incompatible': 'Esta billetera no respondio como una conexion NWC compatible. Proba otra wallet o genera una conexion nueva.'
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
