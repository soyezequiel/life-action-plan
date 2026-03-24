import { NextResponse } from 'next/server'

export * from '../../src/shared/api-utils'

export function jsonResponse<T>(body: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, init)
}
