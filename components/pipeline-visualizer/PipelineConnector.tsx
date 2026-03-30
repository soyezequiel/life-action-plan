'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { PhaseNodeStatus } from './pipeline-visualizer-types';
import styles from './PipelineVisualizer.module.css';

interface PipelineConnectorProps {
  fromStatus: PhaseNodeStatus;
  toStatus: PhaseNodeStatus;
  isLoopBack?: boolean;
  label?: string;
}

export const PipelineConnector: React.FC<PipelineConnectorProps> = ({ 
  fromStatus, 
  toStatus, 
  isLoopBack = false,
  label 
}) => {
  const isCompleted = fromStatus === 'completed' || fromStatus === 'degraded' || fromStatus === 'skipped';
  const isActive = isCompleted || fromStatus === 'active';
  
  const pathColor = isActive ? 'var(--brand, #69a7ff)' : 'var(--slate-300, #cbd5e1)';
  const strokeColor = isLoopBack ? 'var(--warning, #f2bf82)' : pathColor;
  
  return (
    <div className={styles.connector} aria-hidden="true">
      {isLoopBack ? (
        <svg viewBox="0 0 100 50" preserveAspectRatio="none" className={styles.connectorSvgLoop}>
          <motion.path 
            d="M 10 40 Q 50 -10 90 40" 
            fill="none" 
            stroke={strokeColor} 
            strokeWidth="3"
            strokeDasharray="5,5"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, ease: "easeInOut" }}
          />
          <polygon points="85,35 90,40 95,33" fill={strokeColor} />
        </svg>
      ) : (
        <div className={styles.connectorLineContainer}>
          <motion.div 
            className={styles.connectorLine}
            initial={{ width: "0%" }}
            animate={{ width: isCompleted ? "100%" : "0%" }}
            transition={{ type: "tween", duration: 0.5 }}
            style={{ backgroundColor: pathColor }}
          />
          <div className={styles.connectorLineBase} />
          
          <svg className={styles.connectorArrow} viewBox="0 0 10 10">
            <polygon points="0,0 10,5 0,10" fill={isCompleted ? pathColor : 'var(--slate-300, #cbd5e1)'} />
          </svg>
        </div>
      )}

      {label && (
        <span className={styles.connectorLabel}>
          {label}
        </span>
      )}
    </div>
  );
};
