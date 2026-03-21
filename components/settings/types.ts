export interface AuthUser {
  id: string
  username: string
  email?: string | null
}

export interface AuthState {
  loading: boolean
  authenticated: boolean
  user: AuthUser | null
}

export interface ServiceModelOption {
  providerId: string
  modelId: string
  displayName: string
}

export type LlmMode = 'own' | 'service'
