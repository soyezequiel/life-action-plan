import { describe, expect, it } from 'vitest'
import { t } from '../src/i18n'

describe('wallet i18n', () => {
  it('expone las keys de billetera, cobro y calendario', () => {
    expect(t('dashboard.wallet_connect')).toBe('Conectar billetera')
    expect(t('dashboard.wallet_balance', { sats: '21.000' })).toContain('21.000')
    expect(t('dashboard.wallet_budget_remaining', { sats: '3.800' })).toContain('3.800')
    expect(t('dashboard.wallet_build_ready')).toBe('Lista para armar planes pagos')
    expect(t('dashboard.wallet_build_blocked.wallet_not_connected')).toContain('billetera')
    expect(t('dashboard.cost_title')).toBe('Costo del plan')
    expect(t('dashboard.cost_operation.plan_build')).toBe('Armado del plan')
    expect(t('dashboard.charge_operation_paid', { sats: '5' })).toContain('5')
    expect(t('settings.wallet_confirm')).toBe('Guardar conexión')
    expect(t('settings.wallet_error_nwc_incompatible')).toContain('NWC')
    expect(t('settings.build_charge_hint', { sats: '5' })).toContain('5')
    expect(t('calendar.file_type')).toBe('Calendario')
    expect(t('builder.fallback_notice')).toContain('asistente local')
  })
})
