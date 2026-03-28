// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlanPackageExplorer } from '../../components/plan-v5/PlanPackageExplorer';
import { getPlanPackageMock } from '../../src/lib/pipeline/v5/__mocks__/plan-package.mock';
import { t } from '../../src/i18n';

describe('PlanPackageExplorer', () => {
  it('muestra el paquete completo y deja visibles tipos de item no cubiertos por el dashboard resumido', () => {
    const base = getPlanPackageMock('plan-v5-explorer');
    const pkg = {
      ...base,
      items: [
        ...base.items,
        {
          id: 'trigger-rule-1',
          kind: 'trigger_rule' as const,
          title: 'Crear recordatorio si baja el ritmo',
          status: 'active' as const,
          goalIds: base.plan.goalIds,
          enabled: true,
          conditions: [],
          actions: [],
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
        },
      ],
    };

    render(
      <PlanPackageExplorer
        pkg={pkg}
        outputFile="tmp/pipeline-v5-real.json"
        source="latest"
      />,
    );

    expect(screen.getByRole('heading', { name: t('planV5.data.title') })).toBeTruthy();
    expect(screen.getByText('tmp/pipeline-v5-real.json')).toBeTruthy();
    expect(screen.getAllByText('trigger_rule').length).toBeGreaterThan(0);
    expect(screen.getByText('Crear recordatorio si baja el ritmo')).toBeTruthy();
    expect(screen.getByText(t('planV5.data.rawJson'))).toBeTruthy();
  });
});
