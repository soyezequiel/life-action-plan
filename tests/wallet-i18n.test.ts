import { describe, expect, it } from 'vitest'
import { t } from '../src/i18n'

describe('wallet i18n', () => {
  it('expone las keys de billetera y calendario', () => {
    expect(t('dashboard.wallet_connect')).toBe('Conectar billetera')
    expect(t('dashboard.wallet_balance', { sats: '21.000' })).toContain('21.000')
    expect(t('settings.wallet_confirm')).toBe('Guardar conexión')
    expect(t('calendar.file_type')).toBe('Calendario')
  })
})
