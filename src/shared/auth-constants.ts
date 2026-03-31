/**
 * Shared authentication constants between frontend and backend.
 */
export const MIN_PASSWORD_LENGTH = 10;

export const AUTH_ERROR_CODES = {
  PASSWORD_TOO_SHORT: 'PASSWORD_TOO_SHORT',
  ACCOUNT_ALREADY_EXISTS: 'ACCOUNT_ALREADY_EXISTS',
  INVALID_EMAIL: 'INVALID_EMAIL',
  INVALID_INPUT: 'INVALID_INPUT',
  USER_NOT_FOUND: 'user_not_found',
  INVALID_PASSWORD: 'invalid_password'
} as const;

export type AuthErrorCode = typeof AUTH_ERROR_CODES[keyof typeof AUTH_ERROR_CODES];
