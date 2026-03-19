import type { LapAPI } from '../../../shared/types/lap-api'
import type { AppServices } from './index'

export function createTestAppServices(lapClient: LapAPI): AppServices {
  return { lapClient }
}
