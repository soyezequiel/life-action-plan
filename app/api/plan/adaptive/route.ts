import { DateTime } from 'luxon';
import { z } from 'zod';

import { getLatestProfileIdForUser, getPlan, getPlansByProfile, updatePlanManifest } from '../../_db';
import { jsonResponse } from '../../_shared';
import { resolveUserId } from '../../_user-settings';
import { t } from '../../../../src/i18n';
import {
  buildPendingAdaptiveState,
  readPlanV5Manifest,
  updatePlanManifestV5,
} from '../../../../src/lib/domain/plan-helpers';
import { generateAdaptiveResponse } from '../../../../src/lib/pipeline/shared/adaptive';
import type { AdaptiveOutput } from '../../../../src/lib/pipeline/shared/phase-io';

const adaptiveActivityLogSchema = z.object({
  progressionKey: z.string().trim().min(1).optional(),
  activityId: z.string().trim().min(1).optional(),
  planItemId: z.string().trim().min(1).optional(),
  occurredAt: z.string().trim().min(1),
  scheduledStartAt: z.string().trim().min(1).optional(),
  plannedMinutes: z.number().int().nonnegative().optional(),
  completedMinutes: z.number().int().nonnegative().optional(),
  overlapMinutes: z.number().int().nonnegative().optional(),
  note: z.string().trim().max(500).optional(),
  outcome: z.enum(['SUCCESS', 'PARTIAL', 'MISSED']),
}).strict();

const adaptiveQuerySchema = z.object({
  planId: z.string().trim().min(1).optional(),
}).strict();

const adaptiveMutationSchema = z.object({
  planId: z.string().trim().min(1).optional(),
  activityLogs: z.array(adaptiveActivityLogSchema).default([]),
  userFeedback: z.string().trim().max(1000).optional(),
  anchorAt: z.string().trim().min(1).optional(),
}).strict();

const adaptiveSuccessSchema = z.object({
  ok: z.literal(true),
  status: z.enum(['pending', 'ready', 'error']),
  data: z.custom<AdaptiveOutput>((value) => typeof value === 'object' && value !== null).nullable(),
}).strict();

const adaptiveErrorSchema = z.object({
  ok: z.literal(false),
  error: z.string().trim().min(1),
}).strict();

function nowIso(): string {
  return DateTime.utc().toISO() ?? DateTime.utc().toFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
}

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

export const dynamic = 'force-dynamic'

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
    const resolvedPlanId = await resolvePlanId(request, parsedQuery.data.planId);
    if (!resolvedPlanId) {
      return jsonResponse(adaptiveSuccessSchema.parse({
        ok: true,
        status: 'pending',
        data: null,
      }));
    }

    const plan = await getPlan(resolvedPlanId);
    if (!plan) {
      return jsonResponse(adaptiveSuccessSchema.parse({
        ok: true,
        status: 'pending',
        data: null,
      }));
    }

    const v5 = readPlanV5Manifest(plan.manifest);
    if (!v5?.package) {
      return jsonResponse(adaptiveSuccessSchema.parse({
        ok: true,
        status: 'pending',
        data: null,
      }));
    }

    const adaptive = v5.adaptive ?? buildPendingAdaptiveState();
    return jsonResponse(adaptiveSuccessSchema.parse({
      ok: true,
      status: adaptive.status,
      data: adaptive.output,
    }));
  } catch {
    return jsonResponse(adaptiveErrorSchema.parse({
      ok: false,
      error: t('planV5.error'),
    }), { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const parsedBody = adaptiveMutationSchema.safeParse(await request.json().catch(() => null));

  if (!parsedBody.success) {
    return jsonResponse(adaptiveErrorSchema.parse({
      ok: false,
      error: t('errors.invalid_request'),
    }), { status: 400 });
  }

  try {
    const resolvedPlanId = await resolvePlanId(request, parsedBody.data.planId);
    if (!resolvedPlanId) {
      return jsonResponse(adaptiveSuccessSchema.parse({
        ok: true,
        status: 'pending',
        data: null,
      }));
    }

    const plan = await getPlan(resolvedPlanId);
    if (!plan) {
      return jsonResponse(adaptiveSuccessSchema.parse({
        ok: true,
        status: 'pending',
        data: null,
      }));
    }

    const v5 = readPlanV5Manifest(plan.manifest);
    if (!v5?.package) {
      return jsonResponse(adaptiveSuccessSchema.parse({
        ok: true,
        status: 'pending',
        data: null,
      }));
    }

    const output = await generateAdaptiveResponse({
      package: v5.package,
      activityLogs: parsedBody.data.activityLogs,
      anchorAt: parsedBody.data.anchorAt,
      userFeedback: parsedBody.data.userFeedback,
    });
    const adaptiveState = {
      status: 'ready' as const,
      output,
      updatedAt: nowIso(),
      lastError: null,
    };

    await updatePlanManifest(
      plan.id,
      updatePlanManifestV5(plan.manifest, {
        adaptive: adaptiveState,
      }),
    );

    return jsonResponse(adaptiveSuccessSchema.parse({
      ok: true,
      status: adaptiveState.status,
      data: output,
    }));
  } catch (error) {
    const parsedBodyPlanId = parsedBody.data.planId;
    const resolvedPlanId = await resolvePlanId(request, parsedBodyPlanId).catch(() => null);
    if (resolvedPlanId) {
      const plan = await getPlan(resolvedPlanId).catch(() => null);
      if (plan) {
        await updatePlanManifest(
          plan.id,
          updatePlanManifestV5(plan.manifest, {
            adaptive: {
              status: 'error',
              output: null,
              updatedAt: nowIso(),
              lastError: error instanceof Error ? error.message : String(error),
            },
          }),
        ).catch(() => undefined);
      }
    }

    return jsonResponse(adaptiveErrorSchema.parse({
      ok: false,
      error: t('planV5.error'),
    }), { status: 500 });
  }
}
