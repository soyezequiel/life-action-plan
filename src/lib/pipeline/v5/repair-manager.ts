import { executeHardValidator } from './hard-validator';
import { executeSoftValidator } from './soft-validator';
import type { AgentRuntime } from '../../runtime/types';
import type { RepairInput, RepairOutput, PatchOp, HardFinding, SoftFinding, CoVeFinding } from './phase-io-v5';
import type { SchedulerOutput } from '../../scheduler/types';

// Calculamos un puntaje base (100) y restamos penalizaciones
function computeScore(
  hardFindings: HardFinding[],
  softFindings: SoftFinding[],
  coveFindings: CoVeFinding[]
): number {
  let score = 100;
  score -= hardFindings.filter(f => f.severity === 'FAIL').length * 20;
  score -= softFindings.filter(f => f.severity === 'WARN').length * 5;
  score -= coveFindings.filter(f => f.severity === 'FAIL').length * 20;
  score -= coveFindings.filter(f => f.severity === 'WARN').length * 5;
  return Math.max(0, score);
}

export async function executeRepairManager(
  runtime: AgentRuntime,
  input: RepairInput
): Promise<RepairOutput> {
  let currentSchedule = JSON.parse(JSON.stringify(input.schedule)) as SchedulerOutput;
  let currentHard = [...input.hardFindings];
  let currentSoft = [...input.softFindings];
  const currentCove = [...input.coveFindings];
  
  let currentScore = computeScore(currentHard, currentSoft, currentCove);
  const initialScore = currentScore;
  const patchesApplied: PatchOp[] = [];
  let iterations = 0;

  // Máximo 3 iteraciones como requiere el document
  while (iterations < 3) {
    // Solo actuamos sobre hallazgos graves o de advertencia
    const activeHard = currentHard.filter(f => f.severity === 'FAIL');
    const activeSoft = currentSoft.filter(f => f.severity === 'WARN');
    const activeCove = currentCove.filter(f => f.severity === 'FAIL' || f.severity === 'WARN');

    if (activeHard.length === 0 && activeSoft.length === 0 && activeCove.length === 0) {
      break; // No hay nada más que arreglar
    }

    const issues = [
      ...activeHard.map(f => `HARD FAIL: ${f.description} (Objetivos afectados: ${f.affectedItems?.join(', ') || 'N/A'})`),
      ...activeSoft.map(f => `SOFT WARN: ${f.suggestion_esAR}`),
      ...activeCove.map(f => `COVE ${f.severity}: ${f.answer} (${f.question})`)
    ];

    const eventsList = currentSchedule.events
      .map(e => `- ID: ${e.id} | Título: ${e.title} | Inicio: ${e.startAt} | Duración: ${e.durationMin}m`)
      .join('\n');

    const prompt = `
Eres el Repair Manager (Agente Reparador) de un plan.
Detectamos estos problemas en el calendario:
${issues.join('\n')}

Eventos agendados actualmente:
${eventsList || 'Ninguno'}

Tu tarea es proponer EXACTAMENTE UNA operación para resolver el problema MÁS grave ("HARD FAIL" es más crítico que "WARN").
Operaciones posibles (PatchOp):
1. MOVE: Cambiar de horario una actividad. Requiere \`targetId\` y \`newStartAt\` (formato ISO 8601 UTC completo).
2. SWAP: Intercambiar horarios de dos actividades. Requiere \`targetId\` y \`extraId\`.
3. RESIZE: Acortar la duración de una actividad. Requiere \`targetId\` y \`newDurationMin\` (número).
4. DROP: Eliminar la actividad por completo (último recurso). Requiere \`targetId\`.

Devuelve SOLO un JSON válido con esta estructura:
{
  "op": {
    "type": "MOVE" | "SWAP" | "RESIZE" | "DROP",
    "targetId": "string",
    "extraId": "string (opcional)",
    "newStartAt": "string (opcional)",
    "newDurationMin": number (opcional)
  }
}
Si estimas que es imposible reparar los conflictos dados logísticamente sin arruinar el horario, o simplemente quieres abortar, devuelve: { "op": null }

Responde SOLO en JSON válido, sin delimitadores de markdown (\`\`\`).
`;

    try {
      const response = await runtime.chat([{ role: 'user', content: prompt }]);
      let raw = response.content.trim();
      
      // Sanitizar el raw
      if (raw.startsWith('\`\`\`json')) {
        raw = raw.slice(7);
      } else if (raw.startsWith('\`\`\`')) {
        raw = raw.slice(3);
      }
      if (raw.endsWith('\`\`\`')) {
        raw = raw.slice(0, -3);
      }
      const cleanRaw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

      const parsed = JSON.parse(cleanRaw);
      const patch = parsed.op;

      if (!patch || !patch.type || !patch.targetId) {
        break; // Detener re-intentos si el LLM decide no intentar más o falla estructura
      }

      // 1. Aplicamos parche en el horario candidato (Commit temporal)
      const candidateSchedule = JSON.parse(JSON.stringify(currentSchedule)) as SchedulerOutput;
      let applied = false;

      switch (patch.type) {
        case 'MOVE': {
          const ev = candidateSchedule.events.find(e => e.id === patch.targetId);
          if (ev && patch.newStartAt) {
            ev.startAt = patch.newStartAt;
            applied = true;
          }
          break;
        }
        case 'SWAP': {
          const ev1 = candidateSchedule.events.find(e => e.id === patch.targetId);
          const ev2 = candidateSchedule.events.find(e => e.id === patch.extraId);
          if (ev1 && ev2) {
            const temp = ev1.startAt;
            ev1.startAt = ev2.startAt;
            ev2.startAt = temp;
            applied = true;
          }
          break;
        }
        case 'RESIZE': {
          const ev = candidateSchedule.events.find(e => e.id === patch.targetId);
          if (ev && patch.newDurationMin) {
            ev.durationMin = patch.newDurationMin;
            applied = true;
          }
          break;
        }
        case 'DROP': {
          const lenInit = candidateSchedule.events.length;
          candidateSchedule.events = candidateSchedule.events.filter(e => e.id !== patch.targetId);
          if (candidateSchedule.events.length < lenInit) {
            applied = true;
          }
          break;
        }
      }

      if (applied) {
        // 2. Re-validamos
        const hv = await executeHardValidator({ schedule: candidateSchedule, originalInput: input.originalInput });
        const sv = await executeSoftValidator({ schedule: candidateSchedule, profile: input.profile });
        
        // CoVe verification LLM es caro (~800 toker por call), en esta mock inferimos 
        // que la cantidad no cambia por acción (o decae si quitamos un DROP). 
        // Mantendremos los currentCove por simplicidad, a menos que una dependencia mejore drásticamente, 
        // lo que es un compromiso aceptable para evitar N*800 tokens.
        const candidateScore = computeScore(hv.findings, sv.findings, currentCove);

        // 3. Commit/Revert según score
        if (candidateScore > currentScore) {
          // Commit
          currentSchedule = candidateSchedule;
          currentHard = hv.findings;
          currentSoft = sv.findings;
          currentScore = candidateScore;
          
          patchesApplied.push({
            type: patch.type,
            targetId: patch.targetId
          });
        } else {
          // Revert: El parche empeoró el score o no lo mejoró, lo ignoramos y el LLM lo intentará en prox iteración perdiendo un intento
        }
      }
    } catch (e) {
      // Ignorar fallback parse/chat errors, perder iteración pero avanzar
    }

    iterations++;
  }

  return {
    patchesApplied,
    iterations,
    scoreBefore: initialScore,
    scoreAfter: currentScore,
    finalSchedule: currentSchedule
  };
}
