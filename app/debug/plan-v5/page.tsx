import type { Metadata } from 'next';
import Link from 'next/link';

import { PlanPackageExplorer } from '@components/plan-v5/PlanPackageExplorer';
import { PlanDashboardV5Content } from '@components/plan-v5/PlanDashboardV5Content';
import runnerResults from '@lib/debug/v5-runner-results';
import esAR from '@i18n/locales/es-AR.json';

export const metadata: Metadata = {
  title: esAR.planV5.preview.page.title,
};

export const dynamic = 'force-dynamic';

export default function DebugPlanV5Page() {
  const result = runnerResults.readLatestRunnerPlanResult();

  return (
    <main className="app-shell dashboard-shell">
      <div className="view-layer" style={{ display: 'grid', gap: '16px' }}>
        <section className="app-screen--card" style={{ display: 'grid', gap: '12px' }}>
          <div style={{ display: 'grid', gap: '6px' }}>
            <span className="app-eyebrow">{esAR.planV5.preview.page.eyebrow}</span>
            <h1 style={{ margin: 0 }}>{esAR.planV5.preview.page.title}</h1>
            <p className="dashboard-copy" style={{ margin: 0 }}>
              {esAR.planV5.preview.page.subtitle}
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <Link href="/debug/flow" className="app-button app-button--secondary">
              {esAR.planV5.preview.page.openFlow}
            </Link>
            {result.package ? (
              <a href="#plan-v5-data-explorer" className="app-button app-button--secondary">
                {esAR.planV5.preview.page.openData}
              </a>
            ) : null}
            <span className="dashboard-copy" style={{ margin: 0 }}>
              {esAR.planV5.preview.page.outputFile}: <code>{result.outputFile ?? '--'}</code>
            </span>
          </div>
        </section>

        {result.package ? (
          <>
            <PlanDashboardV5Content
              pkg={result.package}
              adaptive={null}
              adaptiveStatus="pending"
            />
            <PlanPackageExplorer
              pkg={result.package}
              outputFile={result.outputFile}
              source={result.source}
            />
          </>
        ) : (
          <section className="app-screen--card" style={{ display: 'grid', gap: '8px' }}>
            <p className="app-status" style={{ margin: 0 }}>
              {esAR.planV5.preview.empty}
            </p>
            <p className="dashboard-copy" style={{ margin: 0 }}>
              {esAR.planV5.preview.hint}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
