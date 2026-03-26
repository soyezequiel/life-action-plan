import { z } from 'zod';

import { getLatestProfileIdForUser, getPlansByProfile } from '../../../_db';
import { jsonResponse } from '../../../_shared';
import { resolveUserId } from '../../../_user-settings';
import { t } from '../../../../../src/i18n';
import type { PlanPackage } from '../../../../../src/lib/pipeline/v5/phase-io-v5';
import { getPlanPackageMock } from '../../../../../src/lib/pipeline/v5/__mocks__/plan-package.mock';

const packageQuerySchema = z.object({
  planId: z.string().trim().min(1).optional(),
}).strict();

const packageSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.custom<PlanPackage>((value) => typeof value === 'object' && value !== null),
}).strict();

const packageErrorSchema = z.object({
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
  const parsedQuery = packageQuerySchema.safeParse({
    planId: url.searchParams.get('planId') ?? undefined,
  });

  if (!parsedQuery.success) {
    return jsonResponse(packageErrorSchema.parse({
      ok: false,
      error: t('planV5.error'),
    }), { status: 400 });
  }

  try {
    const resolvedPlanId = parsedQuery.data.planId ?? await resolveLatestPlanId(request) ?? 'plan-v5-mock';
    const data = getPlanPackageMock(resolvedPlanId);

    return jsonResponse(packageSuccessSchema.parse({
      ok: true,
      data,
    }));
  } catch {
    return jsonResponse(packageErrorSchema.parse({
      ok: false,
      error: t('planV5.error'),
    }), { status: 500 });
  }
}
