import { z } from 'zod';

import { getLatestProfileIdForUser, getPlan, getPlansByProfile } from '../../_db';
import { jsonResponse } from '../../_shared';
import { resolveUserId } from '../../_user-settings';
import { t } from '../../../../src/i18n';
import { readPlanV5Manifest, safeParseJsonRecord } from '../../../../src/lib/domain/plan-helpers';
import {
  evaluatePackageValidation,
  projectPackageDetailWindow,
  projectValidatedPackage,
} from '../../../../src/lib/pipeline/shared/packager';
import type { PlanPackage } from '../../../../src/lib/pipeline/shared/phase-io';

const packageQuerySchema = z.object({
  planId: z.string().trim().min(1).optional(),
  detailStartWeek: z.coerce.number().int().min(1).max(104).optional(),
  detailWeeks: z.coerce.number().int().min(1).max(104).optional(),
}).strict();

const packageSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.custom<PlanPackage>((value) => typeof value === 'object' && value !== null).nullable(),
  meta: z.object({
    modelId: z.string().trim().min(1).nullable(),
  }).strict(),
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

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsedQuery = packageQuerySchema.safeParse({
    planId: url.searchParams.get('planId') ?? undefined,
    detailStartWeek: url.searchParams.get('detailStartWeek') ?? undefined,
    detailWeeks: url.searchParams.get('detailWeeks') ?? undefined,
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
      return jsonResponse(packageSuccessSchema.parse({
        ok: true,
        data: null,
        meta: { modelId: null },
      }));
    }

    const plan = await getPlan(resolvedPlanId);
    if (!plan) {
      return jsonResponse(packageSuccessSchema.parse({
        ok: true,
        data: null,
        meta: { modelId: null },
      }));
    }

    const v5 = readPlanV5Manifest(plan.manifest);
    if (!v5?.package) {
      return jsonResponse(packageSuccessSchema.parse({
        ok: true,
        data: null,
        meta: { modelId: null },
      }));
    }

    let validatedPackage = v5.package;

    if (!v5.package.publicationState) {
      const validation = evaluatePackageValidation({
        goalText: plan.nombre,
        package: v5.package,
        requestedDomain: v5.package.requestDomain ?? null,
      });
      if (validation.status === 'blocked') {
        const blockingIssue = validation.issues.find((issue) => issue.severity === 'block');
        return jsonResponse(packageErrorSchema.parse({
          ok: false,
          error: blockingIssue?.message ?? validation.issues[0]?.message ?? t('planV5.error'),
        }), { status: 422 });
      }

      validatedPackage = projectValidatedPackage(v5.package, validation, plan.nombre);
    } else if (v5.package.publicationState === 'failed_for_quality_review') {
      const blockingIssue = v5.package.qualityIssues?.find((issue) => issue.severity === 'blocking');
      return jsonResponse(packageErrorSchema.parse({
        ok: false,
        error: blockingIssue?.message ?? v5.package.warnings?.[0] ?? t('planV5.error'),
      }), { status: 422 });
    }
    const detailStartWeek = parsedQuery.data.detailStartWeek ?? v5.package.plan.detail.weeks[0]?.weekIndex ?? 1;
    const detailWeeks = parsedQuery.data.detailWeeks ?? v5.package.plan.detail.horizonWeeks;
    const packageView = parsedQuery.data.detailStartWeek || parsedQuery.data.detailWeeks
      ? projectPackageDetailWindow(validatedPackage, detailStartWeek, detailWeeks)
      : validatedPackage;
    const manifest = safeParseJsonRecord(plan.manifest);
    const manifestModelId = typeof manifest.ultimoModeloUsado === 'string' && manifest.ultimoModeloUsado.trim().length > 0
      ? manifest.ultimoModeloUsado
      : null;
    const runModelId = typeof v5.run?.modelId === 'string' && v5.run.modelId.trim().length > 0
      ? v5.run.modelId
      : null;

    return jsonResponse(packageSuccessSchema.parse({
      ok: true,
      data: packageView,
      meta: {
        modelId: manifestModelId ?? runModelId,
      },
    }));
  } catch {
    return jsonResponse(packageErrorSchema.parse({
      ok: false,
      error: t('planV5.error'),
    }), { status: 500 });
  }
}
