'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { t } from '../../src/i18n';
import { PhaseNodeData, PhaseNodeStatus } from './pipeline-visualizer-types';
import styles from './PipelineVisualizer.module.css';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for safe class merging
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface PipelinePhaseNodeProps {
  data: PhaseNodeData;
  isCurrent: boolean;
}

const statusConfig: Record<PhaseNodeStatus, { icon: string; className: string }> = {
  pending: { icon: '○', className: styles.statusPending },
  active: { icon: '●', className: styles.statusActive },
  waiting: { icon: '⏳', className: styles.statusWaiting },
  completed: { icon: '✓', className: styles.statusCompleted },
  failed: { icon: '✕', className: styles.statusFailed },
  skipped: { icon: '—', className: styles.statusSkipped },
  degraded: { icon: '⚠', className: styles.statusDegraded }
};

export const PipelinePhaseNode: React.FC<PipelinePhaseNodeProps> = ({ data, isCurrent }) => {
  const config = statusConfig[data.status];

  // Determinar loop text si existe
  let loopText = null;
  if (data.phase === 'clarify' && data.maxIterations) {
    loopText = `ronda ${data.iteration || 1}/${data.maxIterations}`;
  } else if (data.phase === 'revise' && data.maxIterations) {
    loopText = `ciclo ${data.iteration || 1}/${data.maxIterations}`;
  }

  // Animation variants
  const nodeVariants = {
    pending: { scale: 1, opacity: 0.5 },
    active: { 
      scale: 1.05, 
      opacity: 1,
      boxShadow: ['0px 0px 0px rgba(105, 167, 255, 0)', '0px 0px 15px rgba(105, 167, 255, 0.4)', '0px 0px 0px rgba(105, 167, 255, 0)'],
      transition: { boxShadow: { repeat: Infinity, duration: 2 } }
    },
    waiting: { 
      scale: 1.02,
      opacity: [1, 0.6, 1],
      transition: { opacity: { repeat: Infinity, duration: 1.5 } }
    },
    completed: { scale: 1, opacity: 1 },
    failed: { scale: 1, opacity: 1 },
    skipped: { scale: 0.95, opacity: 0.4 },
    degraded: { scale: 1, opacity: 0.9 }
  };

  return (
    <motion.div
      className={cn(styles.phaseNode, config.className, isCurrent && styles.isCurrent)}
      variants={nodeVariants}
      initial="pending"
      animate={data.status}
      layout
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      role="status"
      aria-label={`${t(data.labelKey)}: ${t(`visualizer.status.${data.status}`)}`}
    >
      <div className={styles.nodeHeader}>
        <span className={styles.nodeIcon}>{config.icon}</span>
        <span className={styles.nodePercentage}>{data.targetProgress}%</span>
      </div>
      
      <div className={styles.nodeContent}>
        <h4 className={styles.nodeTitle}>{t(data.labelKey)}</h4>
        {loopText && (
          <span className={styles.nodeLoop}>{loopText}</span>
        )}
      </div>
    </motion.div>
  );
};
