import { z } from 'zod';

import { getLatestProfileIdForUser, getPlansByProfile } from '../../../_db';
import { jsonResponse } from '../../../_shared';
import { resolveUserId } from '../../../_user-settings';
import { t } from '../../../../../src/i18n';
import type { AdaptiveOutput } from '../../../../../src/lib/pipeline/v5/phase-io-v5';
import { getAdaptiveOutputMock } from '../../../../../src/lib/pipeline/v5/__mocks__/plan-package.mock';

const adaptiveQuerySchema = z.object({
  planId: z.string().trim().min(1).optional(),
}).strict();

const adaptiveSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.custom<AdaptiveOutput>((value) => typeof value === 'object' && value !== null).nullable(),
}).strict();

const adaptiveErrorSchema = z.object({
  ok: z.literal(false),
  error: z.string().trim().min(1),
}).strict();

async function resolveLatestPlanId(request: Request): Promise<string | null> {
  const latestProfileId = await getLatestProfileIdForUser(resolveUserId(request));
  if (!latestProfileId) {
    return null;
  }

  const plans = await getPlansByProfile(latestProfileId);
  const latestPlan = plans
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

  return latestPlan?.id ?? null;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsedQuery = adaptiveQuerySchema.safeParse({
    planId: url.searchParams.get('planId') ?? undefined,
  });

  if (!parsedQuery.success) {
    return jsonResponse(adaptiveErrorSchema.parse({
      ok: false,
      error: t('planV5.error'),
    }), { status: 400 });
  }

  try {
    const resolvedPlanId = parsedQuery.data.planId ?? await resolveLatestPlanId(request) ?? 'plan-v5-mock';
    const data = await getAdaptiveOutputMock(resolvedPlanId);

    return jsonResponse(adaptiveSuccessSchema.parse({
      ok: true,
      data,
    }));
  } catch {
    return jsonResponse(adaptiveErrorSchema.parse({
      ok: false,
      error: t('planV5.error'),
    }), { status: 500 });
  }
}
