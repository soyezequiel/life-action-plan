import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import type { PlanPackage } from '../pipeline/v5/phase-io-v5';
import { readLatestSuccessfulRuntimeData, readPipelineRuntimeData } from '../flow/pipeline-runtime-data';

const DEFAULT_OUTPUT_FILE = resolve(process.cwd(), 'tmp/pipeline-v5-real.json');

export interface LatestRunnerPlanResult {
  package: PlanPackage | null;
  outputFile: string | null;
  source: 'latest' | 'latest-success' | 'default-file' | 'missing';
}

function resolveCandidateFiles(): string[] {
  const latest = readPipelineRuntimeData()?.run.outputFile ?? null;
  const latestSuccess = readLatestSuccessfulRuntimeData()?.run.outputFile ?? null;

  return [latest, latestSuccess, DEFAULT_OUTPUT_FILE].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
}

function readPlanPackageFromFile(filePath: string): PlanPackage | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as PlanPackage;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function readLatestRunnerPlanResult(): LatestRunnerPlanResult {
  const candidates = resolveCandidateFiles();

  for (const [index, filePath] of candidates.entries()) {
    const pkg = readPlanPackageFromFile(filePath);
    if (pkg) {
      return {
        package: pkg,
        outputFile: filePath,
        source: index === 0 ? 'latest' : index === 1 ? 'latest-success' : 'default-file',
      };
    }
  }

  return {
    package: null,
    outputFile: candidates[0] ?? DEFAULT_OUTPUT_FILE,
    source: 'missing',
  };
}
