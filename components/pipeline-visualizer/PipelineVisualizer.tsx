'use client';

import React from 'react';
import { t } from '../../src/i18n';
import { PipelinePhaseNode } from './PipelinePhaseNode';
import { PipelineConnector } from './PipelineConnector';
import { PipelineNotificationBar } from './PipelineNotificationBar';
import { PipelineVisualizerState, PhaseNodeData } from './pipeline-visualizer-types';
import styles from './PipelineVisualizer.module.css';
import { cn } from './PipelinePhaseNode';

interface PipelineVisualizerProps {
  state: PipelineVisualizerState;
}

export const PipelineVisualizer: React.FC<PipelineVisualizerProps> = ({ state }) => {
  const getNode = (phase: string) => state.phases.find(p => p.phase === phase) as PhaseNodeData;

  const interpret = getNode('interpret');
  const clarify = getNode('clarify');
  const plan = getNode('plan');
  const check = getNode('check');
  const schedule = getNode('schedule');
  const critique = getNode('critique');
  const revise = getNode('revise');
  const pkg = getNode('package');
  const done = getNode('done');
  const failed = getNode('failed');

  const showFailedNode = state.lifecycle === 'failed' || state.phases.some(p => p.status === 'failed');
  const finalNode = showFailedNode ? failed : done;

  return (
    <div className={styles.visualizerContainer} role="region" aria-label={t('visualizer.title')}>
      
      {/* 1. SECCIÓN USUARIO */}
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

      {/* 2. SECCIÓN MOTOR DE GENERACIÓN */}
      <section className={cn(styles.section, styles.sectionEngine)}>
        <h3 className={styles.sectionTitle}>{t('visualizer.section_engine')}</h3>
        
        {/* Progress Bar */}
        <div className={styles.progressContainer}>
          <div className={styles.progressText}>
            <span>{t('visualizer.progress', { score: state.progressScore })}</span>
            {state.lastAction && <span>{t('visualizer.last_action', { action: state.lastAction })}</span>}
          </div>
          <div 
            className={styles.progressBarBg} 
            role="progressbar" 
            aria-valuenow={state.progressScore} 
            aria-valuemin={0} 
            aria-valuemax={100}
          >
            <div 
              className={styles.progressBarFill} 
              style={{ width: `${state.progressScore}%` }} 
            />
          </div>
        </div>

        {/* Phase Graph */}
        <div className={styles.graphContainer}>
          
          {/* Fila 1 */}
          <div className={styles.graphRow}>
            <PipelinePhaseNode data={interpret} isCurrent={state.currentPhase === 'interpret'} />
            <PipelineConnector fromStatus={interpret.status} toStatus={clarify.status} />
            
            <div className={styles.nodeWithLoopContainer}>
              <PipelinePhaseNode data={clarify} isCurrent={state.currentPhase === 'clarify'} />
              {/* Loop arco over clarify */}
              {(clarify.status === 'active' || clarify.status === 'waiting') && clarify.iteration && clarify.iteration > 1 && (
                 <PipelineConnector 
                    fromStatus={clarify.status} 
                    toStatus={clarify.status} 
                    isLoopBack={true} 
                 />
              )}
            </div>
            
            <PipelineConnector fromStatus={clarify.status} toStatus={plan.status} />
            <PipelinePhaseNode data={plan} isCurrent={state.currentPhase === 'plan'} />
            <PipelineConnector fromStatus={plan.status} toStatus={check.status} />
            <PipelinePhaseNode data={check} isCurrent={state.currentPhase === 'check'} />
            <PipelineConnector fromStatus={check.status} toStatus={schedule.status} />
            <PipelinePhaseNode data={schedule} isCurrent={state.currentPhase === 'schedule'} />
          </div>

          <PipelineConnector fromStatus={schedule.status} toStatus={critique.status} />

          {/* Fila 2 */}
          <div className={styles.graphRow}>
             <PipelinePhaseNode data={critique} isCurrent={state.currentPhase === 'critique'} />
             
             {/* Loop critique <-> revise */}
             <div className={styles.nodeWithLoopContainer}>
                <PipelineConnector 
                  fromStatus={critique.status} 
                  toStatus={revise.status} 
                />
                {(revise.status === 'active' || critique.status === 'active' && revise.iteration && revise.iteration > 0) && (
                   <div style={{ position: 'absolute', top: -40, left: -60, right: 0 }}>
                     <PipelineConnector 
                       fromStatus={revise.status} 
                       toStatus={critique.status} 
                       isLoopBack={true} 
                     />
                   </div>
                )}
             </div>

             <PipelinePhaseNode data={revise} isCurrent={state.currentPhase === 'revise'} />
             <PipelineConnector fromStatus={revise.status} toStatus={pkg.status} />
             <PipelinePhaseNode data={pkg} isCurrent={state.currentPhase === 'package'} />
             <PipelineConnector fromStatus={pkg.status} toStatus={finalNode.status} />
             <PipelinePhaseNode data={finalNode} isCurrent={state.currentPhase === finalNode.phase} />
          </div>
        </div>
      </section>

      {/* 3. SECCIÓN NOTIFICACIONES */}
      <section className={cn(styles.section, styles.sectionNotifications)}>
        <h3 className={styles.sectionTitle}>{t('visualizer.section_notifications')}</h3>
        <PipelineNotificationBar notifications={state.notifications} />
      </section>

      {/* 4. SECCIÓN DATOS */}
      <section className={cn(styles.section, styles.sectionStorage)}>
        <h3 className={styles.sectionTitle}>{t('visualizer.section_storage')}</h3>
        <div className={styles.storageIndicators}>
          <div className={styles.storageItem}>
             <span className={styles.storageDot} style={{ backgroundColor: state.storage.sessionSaved ? 'var(--success)' : 'var(--slate-400)' }} />
             <span>
               {t('visualizer.storage.session_label')}: {state.storage.sessionSaved ? t('visualizer.storage.saved') : t('visualizer.storage.pending')}
             </span>
          </div>
          <div className={styles.storageItem}>
             <span className={styles.storageDot} style={{ backgroundColor: state.storage.planSaved ? 'var(--success)' : 'var(--slate-400)' }} />
             <span>
               {t('visualizer.storage.plan_label')}: {state.storage.planSaved ? t('visualizer.storage.saved') : t('visualizer.storage.pending')}
             </span>
          </div>
        </div>
      </section>

    </div>
  );
};
