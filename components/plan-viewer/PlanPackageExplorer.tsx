import React, { type ReactNode } from 'react';

import { t } from '../../src/i18n';
import type { PlanPackage } from '../../src/lib/pipeline/shared/phase-io';
import styles from './PlanPackageExplorer.module.css';

interface PlanPackageExplorerProps {
  pkg: PlanPackage;
  outputFile?: string | null;
  source?: 'latest' | 'latest-success' | 'default-file' | 'missing';
}

function humanizeKey(key: string): string {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();

  if (normalized.length === 0) {
    return key;
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatScalar(value: unknown): ReactNode {
  if (value === null || typeof value === 'undefined') {
    return <span className={styles.scalarMuted}>{t('planV5.data.nullValue')}</span>;
  }

  if (typeof value === 'boolean') {
    return (
      <span className={styles.scalarBoolean}>
        {value ? t('planV5.data.trueValue') : t('planV5.data.falseValue')}
      </span>
    );
  }

  if (typeof value === 'number') {
    return <span className={styles.scalarNumber}>{value.toLocaleString('es-AR')}</span>;
  }

  return <code className={styles.scalarCode}>{String(value)}</code>;
}

function summarizeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return t('planV5.data.arraySummary', { count: value.length });
  }

  if (value && typeof value === 'object') {
    return t('planV5.data.objectSummary', {
      count: Object.keys(value as Record<string, unknown>).length,
    });
  }

  if (value === null || typeof value === 'undefined') {
    return t('planV5.data.nullValue');
  }

  return String(value);
}

function collectItemKindCounts(items: PlanPackage['items']): Array<[string, number]> {
  const counts = new Map<string, number>();

  for (const item of items) {
    counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  }

  return Array.from(counts.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function renderNode(label: string, value: unknown, path: string, depth = 0): ReactNode {
  if (Array.isArray(value)) {
    return (
      <details key={path} className={styles.node} open={depth < 2}>
        <summary className={styles.summary}>
          <span className={styles.label}>{label}</span>
          <span className={styles.meta}>{summarizeValue(value)}</span>
        </summary>
        {value.length === 0 ? (
          <p className={styles.empty}>{t('planV5.data.emptyArray')}</p>
        ) : (
          <div className={styles.children}>
            {value.map((entry, index) => renderNode(
              t('planV5.data.entry', { count: index + 1 }),
              entry,
              `${path}.${index}`,
              depth + 1,
            ))}
          </div>
        )}
      </details>
    );
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);

    return (
      <details key={path} className={styles.node} open={depth < 2}>
        <summary className={styles.summary}>
          <span className={styles.label}>{label}</span>
          <span className={styles.meta}>{summarizeValue(value)}</span>
        </summary>
        {entries.length === 0 ? (
          <p className={styles.empty}>{t('planV5.data.emptyObject')}</p>
        ) : (
          <div className={styles.children}>
            {entries.map(([key, nestedValue]) => renderNode(
              humanizeKey(key),
              nestedValue,
              `${path}.${key}`,
              depth + 1,
            ))}
          </div>
        )}
      </details>
    );
  }

  return (
    <div key={path} className={styles.leaf}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{formatScalar(value)}</span>
    </div>
  );
}

export function PlanPackageExplorer({
  pkg,
  outputFile = null,
  source = 'missing',
}: PlanPackageExplorerProps) {
  const itemKindCounts = collectItemKindCounts(pkg.items);
  const stats = [
    { label: t('planV5.data.statGoals'), value: pkg.plan.goalIds.length },
    { label: t('planV5.data.statItems'), value: pkg.items.length },
    { label: t('planV5.data.statWeeks'), value: pkg.plan.detail.weeks.length },
    { label: t('planV5.data.statEvents'), value: pkg.plan.detail.scheduledEvents.length },
    { label: t('planV5.data.statHabits'), value: pkg.habitStates.length },
    { label: t('planV5.data.statWarnings'), value: pkg.warnings.length },
  ];

  return (
    <section id="plan-v5-data-explorer" className={styles.section} data-testid="plan-package-explorer">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{t('planV5.data.eyebrow')}</span>
          <h2 className={styles.title}>{t('planV5.data.title')}</h2>
          <p className={styles.copy}>{t('planV5.data.subtitle')}</p>
        </div>
      </header>

      <div className={styles.stats}>
        {stats.map((stat) => (
          <article key={stat.label} className={styles.statCard}>
            <span className={styles.statLabel}>{stat.label}</span>
            <strong className={styles.statValue}>{stat.value.toLocaleString('es-AR')}</strong>
          </article>
        ))}
      </div>

      <div className={styles.metaRow}>
        <p className={styles.metaItem}>
          <span>{t('planV5.data.outputFile')}</span>
          <code>{outputFile ?? '--'}</code>
        </p>
        <p className={styles.metaItem}>
          <span>{t('planV5.data.sourceLabel')}</span>
          <strong>{t(`planV5.data.source.${source}`)}</strong>
        </p>
      </div>

      <section className={styles.kindPanel}>
        <h3 className={styles.kindTitle}>{t('planV5.data.itemKindsTitle')}</h3>
        <div className={styles.kindList}>
          {itemKindCounts.map(([kind, count]) => (
            <span key={kind} className={styles.kindChip}>
              <code>{kind}</code> {count}
            </span>
          ))}
        </div>
      </section>

      <div className={styles.tree}>
        {renderNode(t('planV5.data.packageRoot'), pkg, 'package')}
      </div>

      <details className={styles.rawPanel}>
        <summary className={styles.summary}>
          <span className={styles.label}>{t('planV5.data.rawJson')}</span>
          <span className={styles.meta}>{t('planV5.data.objectSummary', { count: Object.keys(pkg).length })}</span>
        </summary>
        <pre className={styles.rawPre}>{JSON.stringify(pkg, null, 2)}</pre>
      </details>
    </section>
  );
}
