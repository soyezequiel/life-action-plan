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
  'debug.snapshot_error': 'No pude actualizar el inspector. Voy a seguir reintentando.'
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
