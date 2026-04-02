import { describe, expect, it } from 'vitest'

import { getModelProviderName, resolveBuildModel } from '../src/lib/providers/provider-metadata'

describe('provider metadata', () => {
  it('treats bare OpenAI model ids as openai', () => {
    expect(getModelProviderName('gpt-4o-mini')).toBe('openai')
    expect(getModelProviderName('gpt-5-codex')).toBe('openai')
  })

  it('does not reinterpret unsupported bare provider ids as openai', () => {
    expect(resolveBuildModel('openai')).toBe('openai:gpt-4o-mini')
    expect(getModelProviderName('openai')).toBe('unknown')
  })
})
