'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';

import { usePlanV5 } from '../../src/lib/client/use-plan-v5';
import { t } from '../../src/i18n';
import { PlanDashboardV5Content } from './PlanDashboardV5Content';
import styles from './PlanDashboardV5.module.css';

export function PlanDashboardV5() {
  const searchParams = useSearchParams();
  const planId = searchParams?.get('planId') ?? undefined;
  const { package: pkg, adaptive, adaptiveStatus, loading, error, refetch } = usePlanV5(planId);

  if (loading) {
    return (
      <div className={styles.stateCard}>
        <p className="app-status app-status--busy">{t('planV5.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.stateCard}>
        <p className="app-status">{error}</p>
        <button type="button" className="app-button app-button--primary" onClick={refetch}>
          {t('planV5.refresh')}
        </button>
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className={styles.stateCard}>
        <p className="app-status">{t('planV5.empty')}</p>
        <button type="button" className="app-button app-button--primary" onClick={refetch}>
          {t('planV5.refresh')}
        </button>
      </div>
    );
  }

  return <PlanDashboardV5Content pkg={pkg} adaptive={adaptive} adaptiveStatus={adaptiveStatus} />;
}
