import type { CoVeVerifyOutput, HardValidateOutput, RepairOutput } from './phase-io-v5';

export interface OperationalAcceptanceResult {
  accepted: boolean;
  reason: string | null;
  remainingFindings: Array<{ severity: string; message: string }>;
}

function toRemainingFindings(
  hard: HardValidateOutput | undefined,
  cove: CoVeVerifyOutput | undefined,
): Array<{ severity: string; message: string }> {
  return [
    ...(hard?.findings ?? []).map((finding) => ({
      severity: finding.severity,
      message: finding.description,
    })),
    ...(cove?.findings ?? [])
      .filter((finding) => finding.severity === 'FAIL')
      .map((finding) => ({
        severity: finding.severity,
        message: finding.answer,
      })),
  ];
}

export function evaluateOperationalAcceptance(input: {
  hardValidate?: HardValidateOutput;
  coveVerify?: CoVeVerifyOutput;
  repair?: RepairOutput;
}): OperationalAcceptanceResult {
  const remainingFindings = toRemainingFindings(input.hardValidate, input.coveVerify);

  if (input.repair?.status === 'escalated') {
    return {
      accepted: false,
      reason: 'V5_OPERATIONAL_REPAIR_ESCALATED',
      remainingFindings,
    };
  }

  if (remainingFindings.length > 0) {
    return {
      accepted: false,
      reason: 'V5_OPERATIONAL_INVALID',
      remainingFindings,
    };
  }

  return {
    accepted: true,
    reason: null,
    remainingFindings: [],
  };
}
