'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { t } from '../../src/i18n';
import { VisualizerNotification } from './pipeline-visualizer-types';
import styles from './PipelineVisualizer.module.css';
import { cn } from './PipelinePhaseNode';

interface PipelineNotificationBarProps {
  notifications: VisualizerNotification[];
}

export const PipelineNotificationBar: React.FC<PipelineNotificationBarProps> = ({ notifications }) => {
  const [expanded, setExpanded] = useState(false);
  
  const latest = notifications[0];
  const history = notifications.slice(1);
  
  if (!latest) return null;
  
  const iconMap = {
    info: 'ℹ️',
    warning: '⏳',
    success: '✓',
    error: '✕'
  };

  return (
    <div className={styles.notificationSection}>
      <div 
        className={cn(styles.notificationBar, styles[`notification${latest.type}`])}
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        <AnimatePresence mode="popLayout">
          <motion.div 
            key={latest.id}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={styles.notificationLatest}
            role="alert"
          >
            <span className={styles.notificationIcon}>{iconMap[latest.type]}</span>
            <span className={styles.notificationText}>
              {latest.messageKey ? t(latest.messageKey) : latest.message ?? ''}
            </span>
          </motion.div>
        </AnimatePresence>
        
        {history.length > 0 && (
          <span className={styles.notificationExpandIcon}>
            {expanded ? '▲' : '▼'}
          </span>
        )}
      </div>
      
      <AnimatePresence>
        {expanded && history.length > 0 && (
          <motion.div 
            className={styles.notificationHistory}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            {history.map((n) => (
              <div key={n.id} className={cn(styles.historyItem, styles[`history${n.type}`])}>
                <span className={styles.historyIcon}>{iconMap[n.type]}</span>
                <span className={styles.historyText}>
                  {n.messageKey ? t(n.messageKey) : n.message ?? ''}
                </span>
                <span className={styles.historyTime}>
                  {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
