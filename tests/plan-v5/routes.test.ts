import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getLatestProfileIdForUserMock: vi.fn(),
  getPlanMock: vi.fn(),
  getPlansByProfileMock: vi.fn(),
  updatePlanManifestMock: vi.fn(),
  resolveUserIdMock: vi.fn(() => 'local-user'),
}));

vi.mock('../../app/api/_db', () => ({
  getLatestProfileIdForUser: mocks.getLatestProfileIdForUserMock,
  getPlan: mocks.getPlanMock,
  getPlansByProfile: mocks.getPlansByProfileMock,
  updatePlanManifest: mocks.updatePlanManifestMock,
}));

vi.mock('../../app/api/_user-settings', () => ({
  resolveUserId: mocks.resolveUserIdMock,
}));

import { GET as getPackage } from '../../app/api/plan/package/route';
import { GET as getAdaptive, POST as postAdaptive } from '../../app/api/plan/adaptive/route';
import { buildPendingAdaptiveState, buildPlanManifest, readPlanV5Manifest } from '../../src/lib/domain/plan-helpers';
import { getPlanPackageMock } from '../helpers/plan-package.mock';

function buildPlanRow(manifest: string) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    profileId: '22222222-2222-4222-8222-222222222222',
    nombre: 'Plan V5',
    slug: 'plan-v5',
    manifest,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
  };
}

describe('plan v5 routes', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.resolveUserIdMock.mockReturnValue('local-user');
    mocks.getLatestProfileIdForUserMock.mockResolvedValue('22222222-2222-4222-8222-222222222222');
    mocks.getPlansByProfileMock.mockResolvedValue([buildPlanRow('{}')]);
    mocks.updatePlanManifestMock.mockResolvedValue(undefined);
  });

  it('GET /api/plan/package devuelve el package persistido en manifest.v5', async () => {
    const pkg = getPlanPackageMock('plan-v5-route-package');
    const manifest = buildPlanManifest({
      nombre: 'Plan V5',
      fallbackUsed: false,
      modelId: 'openrouter:openai/gpt-4o-mini',
      tokensInput: 10,
      tokensOutput: 20,
      costUsd: 0.01,
      costSats: 10,
      v5: {
        package: pkg,
        adaptive: buildPendingAdaptiveState('2026-03-30T00:00:00.000Z'),
        run: null,
      },
    });
    mocks.getPlanMock.mockResolvedValue(buildPlanRow(manifest));

    const response = await getPackage(new Request('http://localhost/api/plan/package?planId=11111111-1111-4111-8111-111111111111'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: pkg,
    });
  });

  it('GET /api/plan/package devuelve 404 PLAN_V5_NOT_AVAILABLE si el plan no tiene artefacto V5', async () => {
    mocks.getPlanMock.mockResolvedValue(buildPlanRow('{}'));

    const response = await getPackage(new Request('http://localhost/api/plan/package?planId=11111111-1111-4111-8111-111111111111'));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'PLAN_V5_NOT_AVAILABLE',
    });
  });

  it('GET /api/plan/adaptive devuelve pending cuando el build termino pero adapt no corrio', async () => {
    const pkg = getPlanPackageMock('plan-v5-route-adaptive');
    const manifest = buildPlanManifest({
      nombre: 'Plan V5',
      fallbackUsed: false,
      modelId: 'openrouter:openai/gpt-4o-mini',
      tokensInput: 10,
      tokensOutput: 20,
      costUsd: 0.01,
      costSats: 10,
      v5: {
        package: pkg,
        adaptive: buildPendingAdaptiveState('2026-03-30T00:00:00.000Z'),
        run: null,
      },
    });
    mocks.getPlanMock.mockResolvedValue(buildPlanRow(manifest));

    const response = await getAdaptive(new Request('http://localhost/api/plan/adaptive?planId=11111111-1111-4111-8111-111111111111'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      status: 'pending',
      data: null,
    });
  });

  it('POST /api/plan/adaptive calcula adaptive y persiste status ready', async () => {
    const pkg = getPlanPackageMock('plan-v5-route-post');
    const manifest = buildPlanManifest({
      nombre: 'Plan V5',
      fallbackUsed: false,
      modelId: 'openrouter:openai/gpt-4o-mini',
      tokensInput: 10,
      tokensOutput: 20,
      costUsd: 0.01,
      costSats: 10,
      v5: {
        package: pkg,
        adaptive: buildPendingAdaptiveState('2026-03-30T00:00:00.000Z'),
        run: null,
      },
    });
    const planRow = buildPlanRow(manifest);
    mocks.getPlanMock.mockResolvedValue(planRow);

    const response = await postAdaptive(new Request('http://localhost/api/plan/adaptive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: planRow.id,
        activityLogs: [],
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('ready');
    expect(body.data.mode).toBe('ABSORB');
    expect(mocks.updatePlanManifestMock).toHaveBeenCalledTimes(1);

    const persistedManifest = mocks.updatePlanManifestMock.mock.calls[0]?.[1] as string;
    const stored = readPlanV5Manifest(persistedManifest);

    expect(stored?.adaptive?.status).toBe('ready');
    expect(stored?.adaptive?.output?.mode).toBe('ABSORB');
    expect(stored?.package?.summary_esAR).toBe(pkg.summary_esAR);
  });
});
