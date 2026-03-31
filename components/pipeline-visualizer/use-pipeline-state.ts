import { useState, useCallback, useRef } from 'react';
import type { PlanStreamCallbacks, PlanDegradedEvent } from '../../src/lib/client/plan-client';
import type { ClarificationRound, OrchestratorPhase } from '../../src/lib/pipeline/v6/types';
import {
  PhaseNodeData,
  PhaseNodeStatus,
  PipelineVisualizerState,
  PHASE_ORDER,
  VisualizerNotification
} from './pipeline-visualizer-types';

function createInitialState(): PipelineVisualizerState {
  return {
    phases: PHASE_ORDER.map(p => ({
      phase: p.phase,
      labelKey: p.labelKey,
      targetProgress: p.targetProgress,
      status: 'pending',
      agentName: p.agentName,
      maxIterations: p.phase === 'clarify' ? 3 : p.phase === 'revise' ? 2 : undefined
    })),
    currentPhase: null,
    progressScore: 0,
    lastAction: '',
    lifecycle: 'idle',
    sessionId: null,
    degraded: false,
    notifications: [],
    storage: {
      sessionSaved: false,
      planSaved: false,
    }
  };
}

export function usePipelineState(): {
  state: PipelineVisualizerState;
  callbacks: PlanStreamCallbacks;
  reset: () => void;
} {
  const [state, setState] = useState<PipelineVisualizerState>(createInitialState());
  const notificationIdRef = useRef(0);

  const addNotification = useCallback((type: VisualizerNotification['type'], messageKey: string, message?: string) => {
    notificationIdRef.current += 1;
    const newNotification: VisualizerNotification = {
      id: notificationIdRef.current.toString(),
      type,
      messageKey,
      message,
      timestamp: new Date().toISOString()
    };
    setState(prev => ({
      ...prev,
      notifications: [newNotification, ...prev.notifications].slice(0, 50)
    }));
  }, []);

  const reset = useCallback(() => {
    setState(createInitialState());
    notificationIdRef.current = 0;
  }, []);

  const onPhase = useCallback((phaseStr: string, iteration: number) => {
    const phase = phaseStr as OrchestratorPhase;
    setState(prev => {
      const nextPhases = prev.phases.map(p => {
        // Find index logic to properly mark completed
        const prevPhaseIndex = PHASE_ORDER.findIndex(o => o.phase === prev.currentPhase);
        const thisPhaseIndex = PHASE_ORDER.findIndex(o => o.phase === p.phase);

        if (p.phase === phase) {
          return {
            ...p,
            status: 'active' as PhaseNodeStatus,
            iteration: iteration > 0 ? iteration : undefined
          };
        }
        
        // Mark past phases as completed unless degraded
        if (p.status === 'active' || (prevPhaseIndex >= 0 && thisPhaseIndex <= prevPhaseIndex && p.status !== 'degraded' && p.status !== 'failed')) {
           return { ...p, status: 'completed' as PhaseNodeStatus };
        }
        return p;
      });

      return {
        ...prev,
        phases: nextPhases,
        currentPhase: phase,
        lifecycle: 'running'
      };
    });
  }, []);

  const onProgress = useCallback((score: number, lastAction: string) => {
    setState(prev => ({
      ...prev,
      // Prevent backward progress jumps visually across phase resets, unless it's a big logic jump
      progressScore: prev.progressScore > score && prev.progressScore - score < 15 ? prev.progressScore : score,
      lastAction,
      phases: prev.phases.map(p => 
        p.phase === prev.currentPhase ? { ...p, statusDetail: lastAction } : p
      )
    }));
  }, []);

  const onNeedsInput = useCallback((sessionId: string, _questions: ClarificationRound) => {
    setState(prev => ({
      ...prev,
      phases: prev.phases.map(p => p.phase === 'clarify' ? { ...p, status: 'waiting' as PhaseNodeStatus } : p),
      lifecycle: 'paused_for_input',
      sessionId,
      storage: { ...prev.storage, sessionSaved: true }
    }));
    addNotification('warning', 'visualizer.notification.needs_input');
  }, [addNotification]);

  const onDegraded = useCallback((data: PlanDegradedEvent) => {
    setState(prev => ({
      ...prev,
      degraded: true,
      phases: prev.phases.map(p => {
         // Naive check if agent string contains the agent name
         if (p.agentName && data.failedAgents.includes(p.agentName)) {
             return { ...p, status: 'degraded' as PhaseNodeStatus };
         }
         return p;
      })
    }));
    addNotification('warning', 'visualizer.notification.degraded', data.message);
  }, [addNotification]);

  const onComplete = useCallback((_planId: string, _score: number, _iterations: number) => {
    setState(prev => {
      const isFailed = prev.lifecycle === 'failed';
       return {
        ...prev,
        lifecycle: isFailed ? 'failed' : 'completed',
        storage: { ...prev.storage, planSaved: true },
        phases: prev.phases.map(p => {
          if (p.phase === 'done') return { ...p, status: 'completed' as PhaseNodeStatus };
          if (p.phase === 'failed') return p;
          if (p.status === 'pending') return { ...p, status: 'skipped' as PhaseNodeStatus };
          return p;
        })
      };
    });
    addNotification('success', 'visualizer.notification.completed');
  }, [addNotification]);

  const onError = useCallback((message: string) => {
    setState(prev => ({
      ...prev,
      lifecycle: 'failed',
      phases: prev.phases.map(p => {
          if (p.phase === prev.currentPhase || p.phase === 'failed') {
            return { ...p, status: 'failed' as PhaseNodeStatus }
          }
          return p;
      })
    }));
    addNotification('error', 'visualizer.notification.failed', message);
  }, [addNotification]);

  const onDebug = useCallback((event: any) => {
    // Mantener log en consola para debugueo comodo
    const { logPlanificadorDebug } = require('../../src/lib/client/debug-logger');
    logPlanificadorDebug?.(event);

    if (event?.summary_es) {
      setState(prev => ({
        ...prev,
        lastAction: event.summary_es,
        phases: prev.phases.map(p => 
          p.phase === prev.currentPhase ? { ...p, statusDetail: event.summary_es } : p
        )
      }));
    }
  }, []);

  const callbacks: PlanStreamCallbacks = {
    onPhase,
    onProgress,
    onNeedsInput,
    onDegraded,
    onDebug,
    onComplete,
    onError
  };

  return { state, callbacks, reset };
}
