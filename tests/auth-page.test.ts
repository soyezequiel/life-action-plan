import { describe, expect, it, vi } from 'vitest'

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`)
})

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}))

describe('auth page', () => {
  it('redirige a signin', async () => {
    const { default: AuthPage } = await import('../app/auth/page')

    expect(() => AuthPage()).toThrow('REDIRECT:/auth/signin')
  })
})
