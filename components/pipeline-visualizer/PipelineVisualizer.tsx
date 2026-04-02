'use client';

import React, { useMemo } from 'react';

import { t } from '../../src/i18n';
import {
  getV6MachineVisualEdges,
  getV6MachineVisualNodes,
} from '../../src/lib/pipeline/v6/xstate/visualization';
import { PipelineConnector } from './PipelineConnector';
import { PipelineNotificationBar } from './PipelineNotificationBar';
import { PipelinePhaseNode } from './PipelinePhaseNode';
import type { PhaseNodeData, PipelineVisualizerState } from './pipeline-visualizer-types';
import styles from './PipelineVisualizer.module.css';
import { cn } from './PipelinePhaseNode';

interface PipelineVisualizerProps {
  state: PipelineVisualizerState;
}

const ROW_CAPACITY = 5;

function chunkRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }

  return rows;
}

function resolveTerminalPhase(state: PipelineVisualizerState): 'done' | 'failed' {
  if (
    state.lifecycle === 'failed'
    || state.currentPhase === 'blocked'
    || state.phases.some((phase) => phase.phase === 'failed' && phase.status === 'failed')
  ) {
    return 'failed';
  }

  return 'done';
}

function buildStandardPhases(state: PipelineVisualizerState): PhaseNodeData[] {
  const standardNodes = getV6MachineVisualNodes('standard');
  const phaseMap = new Map(state.phases.map((phase) => [phase.phase, phase]));
  const terminalPhase = resolveTerminalPhase(state);

  return standardNodes
    .filter((node) => !['done', 'failed'].includes(node.stateId) || node.stateId === terminalPhase)
    .map((node) => {
      const runtimePhase = phaseMap.get(node.stateId);

      return runtimePhase ?? {
        phase: node.stateId,
        labelKey: node.labelKey,
        fallbackLabel: node.fallbackLabel,
        targetProgress: node.progressTarget,
        status: 'pending',
        agentName: node.agentName,
      };
    });
}

function buildExtraTransitionLabels(phases: PhaseNodeData[]): Array<{ id: string; label: string }> {
  const visibleIds = phases.map((phase) => phase.phase);
  const visibleSet = new Set(visibleIds);
  const adjacentPairs = new Set<string>();

  visibleIds.forEach((phaseId, index) => {
    const next = visibleIds[index + 1];
    if (next) {
      adjacentPairs.add(`${phaseId}->${next}`);
    }
  });

  return getV6MachineVisualEdges('standard')
    .filter((edge) => visibleSet.has(edge.source) && visibleSet.has(edge.target))
    .filter((edge) => edge.source !== edge.target)
    .filter((edge) => !adjacentPairs.has(`${edge.source}->${edge.target}`))
    .map((edge) => ({
      id: edge.id,
      label: `${phases.find((phase) => phase.phase === edge.source)?.fallbackLabel ?? edge.source} -> ${phases.find((phase) => phase.phase === edge.target)?.fallbackLabel ?? edge.target}`,
    }));
}

export const PipelineVisualizer: React.FC<PipelineVisualizerProps> = ({ state }) => {
  const phases = useMemo(() => buildStandardPhases(state), [state]);
  const rows = useMemo(() => chunkRows(phases, ROW_CAPACITY), [phases]);
  const extraTransitions = useMemo(() => buildExtraTransitionLabels(phases), [phases]);
  const activePhase = phases.find((phase) => phase.phase === state.currentPhase) ?? null;

  return (
    <div className={styles.visualizerContainer} role="region" aria-label={t('visualizer.title')}>
      <section className={styles.heroPanel}>
        <div>
          <span className={styles.heroEyebrow}>Lectura rápida</span>
          <h3 className={styles.heroTitle}>{t('visualizer.title')}</h3>
          <p className={styles.heroCopy}>
            Resumen lineal del motor para entender en qué etapa está, cuánto avanzó y qué ramas de revisión quedaron activas.
          </p>
        </div>
        <div className={styles.heroMetrics}>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>fase actual</span>
            <strong className={styles.metricValue}>{activePhase?.fallbackLabel ?? state.currentPhase ?? 'pendiente'}</strong>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>progreso</span>
            <strong className={styles.metricValue}>{state.progressScore}%</strong>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>estado</span>
            <strong className={styles.metricValue}>{state.lifecycle}</strong>
          </div>
        </div>
      </section>

      <section className={cn(styles.section, styles.sectionUser)}>
        <h3 className={styles.sectionTitle}>{t('visualizer.section_user')}</h3>
        <div className={styles.userNodesRow}>
          <div className={cn(styles.userNode, state.lifecycle === 'idle' && styles.userNodeActive)}>
            {t('visualizer.user_define_goal')}
          </div>
          <div className={cn(styles.userNode, state.lifecycle === 'paused_for_input' && styles.userNodeActive)}>
            {t('visualizer.user_answer_questions')}
          </div>
          <div className={cn(styles.userNode, state.lifecycle === 'completed' && styles.userNodeActive)}>
            {t('visualizer.user_review_plan')}
          </div>
        </div>
      </section>

      <section className={cn(styles.section, styles.sectionEngine)}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>{t('visualizer.section_engine')}</h3>
          <div className={styles.legendInline}>
            <span className={styles.legendInlineItem}><i className={styles.legendActive} /> Activo</span>
            <span className={styles.legendInlineItem}><i className={styles.legendComplete} /> Resuelto</span>
            <span className={styles.legendInlineItem}><i className={styles.legendWaiting} /> Espera</span>
          </div>
        </div>

        <div className={styles.progressContainer}>
          <div className={styles.progressText}>
            <span>{t('visualizer.progress', { score: state.progressScore })}</span>
            {state.lastAction ? <span>{t('visualizer.last_action', { action: state.lastAction })}</span> : null}
          </div>
          <div
            className={styles.progressBarBg}
            role="progressbar"
            aria-valuenow={state.progressScore}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className={styles.progressBarFill} style={{ width: `${state.progressScore}%` }} />
          </div>
        </div>

        <div className={styles.graphContainer}>
          {rows.map((row, rowIndex) => (
            <React.Fragment key={`row-${rowIndex}`}>
              <div className={styles.graphRowRail}>
                <span className={styles.rowLabel}>tramo {rowIndex + 1}</span>
                <div className={styles.graphRow}>
                {row.map((phase, phaseIndex) => {
                  const nextPhase = row[phaseIndex + 1];

                  return (
                    <React.Fragment key={phase.phase}>
                      <PipelinePhaseNode data={phase} isCurrent={state.currentPhase === phase.phase} />
                      {nextPhase ? (
                        <PipelineConnector fromStatus={phase.status} toStatus={nextPhase.status} />
                      ) : null}
                    </React.Fragment>
                  );
                })}
                </div>
              </div>

              {rows[rowIndex + 1] ? (
                <PipelineConnector
                  fromStatus={row[row.length - 1]?.status ?? 'pending'}
                  toStatus={rows[rowIndex + 1][0]?.status ?? 'pending'}
                />
              ) : null}
            </React.Fragment>
          ))}

          {extraTransitions.length > 0 ? (
            <div className={styles.extraTransitions}>
              <span className={styles.extraTransitionsLabel}>ramas adicionales</span>
              {extraTransitions.map((transition) => (
                <span key={transition.id} className={styles.extraTransitionChip}>
                  {transition.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className={cn(styles.section, styles.sectionNotifications)}>
        <h3 className={styles.sectionTitle}>{t('visualizer.section_notifications')}</h3>
        <PipelineNotificationBar notifications={state.notifications} />
      </section>

      <section className={cn(styles.section, styles.sectionStorage)}>
        <h3 className={styles.sectionTitle}>{t('visualizer.section_storage')}</h3>
        <div className={styles.storageIndicators}>
          <div className={styles.storageItem}>
            <span
              className={styles.storageDot}
              style={{ backgroundColor: state.storage.sessionSaved ? 'var(--success)' : 'var(--slate-400)' }}
            />
            <span>
              {t('visualizer.storage.session_label')}: {state.storage.sessionSaved ? t('visualizer.storage.saved') : t('visualizer.storage.pending')}
            </span>
          </div>
          <div className={styles.storageItem}>
            <span
              className={styles.storageDot}
              style={{ backgroundColor: state.storage.planSaved ? 'var(--success)' : 'var(--slate-400)' }}
            />
            <span>
              {t('visualizer.storage.plan_label')}: {state.storage.planSaved ? t('visualizer.storage.saved') : t('visualizer.storage.pending')}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};
