import { describe, it, expect } from 'vitest';
// @ts-ignore: MJS file import
import { CANONICALS, evaluateExpectations, parseRun } from '../scripts/eval-v6-canaries.mjs';

describe('V6 Canaries Evaluator', () => {
  it('should have 4 canonical categories', () => {
    expect(Object.keys(CANONICALS)).toHaveLength(4);
    expect(CANONICALS.finance).toBeDefined();
    expect(CANONICALS.cooking).toBeDefined();
    expect(CANONICALS.health).toBeDefined();
    expect(CANONICALS.ambiguous).toBeDefined();
  });

  it('should parse run correctly based on string contents', () => {
    const mockRun = {
      _rawContent: '{"goal_mismatch": true}',
      summary: {
        provider: 'openai',
        publicationState: 'publishable',
        status: 'success'
      },
      latestDebugStatus: {
        clarifyRounds: 2
      },
      pendingInput: null
    };

    const res = parseRun(mockRun);
    expect(res.providerLabel).toBe('openai');
    expect(res.runtimeProvider).toBe('openai');
    expect(res.goal_mismatch).toBe(true);
    expect(res.calendar_phase_leak).toBe(false);
    expect(res.requires_supervision).toBe(false);
    expect(res.finalState).toBe('publishable');
    expect(res.clarifyRounds).toBe(2);
    expect(res.pendingInput).toBe(false);
  });

  it('should detect paused state on pending input', () => {
    const mockRun = {
      _rawContent: '',
      pendingInput: { any: true },
      summary: {},
    };
    const res = parseRun(mockRun);
    expect(res.pendingInput).toBe(true);
    expect(res.finalState).toBe('paused');
  });

  it('should extract provider from sseEvents if available', () => {
    const mockRun = {
      _rawContent: '',
      summary: {
        provider: 'generic'
      },
      sseEvents: [
        {
          type: 'v6:provider',
          data: {
            resolvedModelId: 'openai:gpt-5-codex',
            executionMode: 'codex-cloud',
            authMode: 'codex-oauth'
          }
        }
      ]
    };
    const res = parseRun(mockRun);
    expect(res.providerLabel).toBe('generic');
    expect(res.resolvedModelId).toBe('openai:gpt-5-codex');
    expect(res.executionMode).toBe('codex-cloud');
    expect(res.authMode).toBe('codex-oauth');
    expect(res.runtimeProvider).toBe('codex-cloud');
  });

  it('should fail ambiguous expectation when the run is still paused without answers', () => {
    const mockRun = {
      _rawContent: '',
      pendingInput: {
        sessionId: 'ambiguous-session',
      },
      summary: {
        status: 'paused_for_input',
      },
      latestDebugStatus: {
        lifecycle: 'running',
      },
    };

    const res = parseRun(mockRun);
    const expectation = evaluateExpectations(res, CANONICALS.ambiguous.expected, mockRun._rawContent);

    expect(res.finalState).toBe('paused');
    expect(res.publicationState).toBe('none');
    expect(expectation.expectationStatus).toBe('fail');
    expect(expectation.expectationFailures).toContain('publicationState expected \'publishable\' got \'none\'');
    expect(expectation.expectationFailures).toContain('not allowed to be paused');
  });

  it('should pass ambiguous expectation after coherent answers produce a publishable plan', () => {
    const mockRun = {
      _rawContent: '',
      pendingInput: null,
      finalPackage: {
        id: 'pkg-1',
      },
      summary: {
        publicationState: 'publishable',
        failureCode: null,
        status: 'completed',
      },
      sseEvents: [
        {
          type: 'v6:debug',
          data: {
            category: 'publication',
            publicationState: 'ready',
            failureCode: null,
            details: { canPublish: true },
          },
        },
      ],
    };

    const res = parseRun(mockRun);
    const expectation = evaluateExpectations(res, CANONICALS.ambiguous.expected, mockRun._rawContent);

    expect(res.finalState).toBe('publishable');
    expect(res.publicationState).toBe('publishable');
    expect(expectation.expectationStatus).toBe('pass');
    expect(expectation.expectationFailures).toEqual([]);
  });

  it('should report blocked health runs from the final artifact instead of collapsing them to failed', () => {
    const mockRun = {
      _rawContent: '{"requires_supervision":true}',
      pendingInput: null,
      summary: {
        publicationState: 'blocked',
        failureCode: 'requires_supervision',
        status: 'failed',
      },
      finalResult: {
        success: false,
        publicationState: 'blocked',
        failureCode: 'requires_supervision',
        package: {
          plan: {},
        },
      },
      latestDebugStatus: {
        lifecycle: 'completed',
        publicationState: 'blocked',
        failureCode: 'requires_supervision',
      },
      sseEvents: [
        {
          type: 'v6:debug',
          data: {
            category: 'publication',
            publicationState: 'blocked',
            failureCode: 'requires_supervision',
            details: { canPublish: false },
          },
        },
      ],
    };

    const res = parseRun(mockRun);

    expect(res.publicationState).toBe('blocked');
    expect(res.failureCode).toBe('requires_supervision');
    expect(res.finalState).toBe('blocked');
    expect(res.requires_supervision).toBe(true);
  });
});
