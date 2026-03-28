import { z } from 'zod';

import { getLatestProfileIdForUser, getPlan, getPlansByProfile } from '../../_db';
import { jsonResponse } from '../../_shared';
import { resolveUserId } from '../../_user-settings';
import { t } from '../../../../src/i18n';
import { readPlanV5Manifest } from '../../../../src/lib/domain/plan-helpers';
import type { PlanPackage } from '../../../../src/lib/pipeline/shared/phase-io';

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

async function resolvePlanId(request: Request, explicitPlanId?: string): Promise<string | null> {
  if (explicitPlanId) {
    return explicitPlanId;
  }

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
    const resolvedPlanId = await resolvePlanId(request, parsedQuery.data.planId);
    if (!resolvedPlanId) {
      return jsonResponse(packageErrorSchema.parse({
        ok: false,
        error: t('errors.plan_not_found'),
      }), { status: 404 });
    }

    const plan = await getPlan(resolvedPlanId);
    if (!plan) {
      return jsonResponse(packageErrorSchema.parse({
        ok: false,
        error: t('errors.plan_not_found'),
      }), { status: 404 });
    }

    const v5 = readPlanV5Manifest(plan.manifest);
    if (!v5?.package) {
      return jsonResponse(packageErrorSchema.parse({
        ok: false,
        error: 'PLAN_V5_NOT_AVAILABLE',
      }), { status: 404 });
    }

    return jsonResponse(packageSuccessSchema.parse({
      ok: true,
      data: v5.package,
    }));
  } catch {
    return jsonResponse(packageErrorSchema.parse({
      ok: false,
      error: t('planV5.error'),
    }), { status: 500 });
  }
}
