import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PlanDashboardV5 } from '../../../components/plan-viewer/PlanDashboardV5';
import esAR from '../../../src/i18n/locales/es-AR.json';

export const metadata: Metadata = {
  title: esAR.planV5.page.title,
};

export default function PlanV5Page() {
  return (
    <Suspense fallback={<p className="app-status app-status--busy">{esAR.planV5.loading}</p>}>
      <PlanDashboardV5 />
    </Suspense>
  );
}
