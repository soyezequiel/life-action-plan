# Pipeline v5 — Sprint 3: Pipeline 12 Fases

> **Status**: `pending`
> **Spec**: `docs/architecture/PIPELINE_V5_SPEC.md` (secciones 3-4)
> **Depends on**: Sprint 1 (domain types) + Sprint 2 (scheduler MILP)
> **Scope**: Conectar las 12 fases en un runner v5 funcional
> **NO incluye**: Rolling Wave, HabitState, Adaptación, UI changes

---

## Objetivo

Crear un runner v5 que ejecute las 12 fases del pipeline, conectando el clasificador (Sprint 1), el scheduler MILP (Sprint 2), y las fases nuevas (strategy, template builder, validators, CoVe, repair).

**El runner v1 NO se modifica.** El v5 vive en `src/lib/pipeline/v5/runner.ts` como un runner separado.

---

## Las 12 Fases

| # | Fase | Tipo | Archivo | Depende de |
|---|------|------|---------|-----------|
| 1 | CLASSIFY | regex+LLM | `classify.ts` (Sprint 1 ✅) | Input del usuario |
| 2 | REQUIREMENTS | LLM | `requirements.ts` (NUEVO) | Fase 1 |
| 3 | PROFILE | LLM | `profile.ts` (NUEVO) | Fase 2 |
| 4 | STRATEGY | LLM | `strategy.ts` (NUEVO) | Fases 1-3 |
| 5 | TEMPLATE | Determinístico | `template-builder.ts` (NUEVO) | Fases 1, 4 |
| 6 | SCHEDULE | MILP | `solver.ts` (Sprint 2 ✅) | Fase 5 |
| 7 | HARD_VALIDATE | Determinístico | `hard-validator.ts` (NUEVO) | Fase 6 |
| 8 | SOFT_VALIDATE | Determinístico | `soft-validator.ts` (NUEVO) | Fase 6 |
| 9 | COVE_VERIFY | LLM | `cove-verifier.ts` (NUEVO) | Fases 6-8 |
| 10 | REPAIR | LLM | `repair-manager.ts` (NUEVO) | Fase 9 |
| 11 | PACKAGE | Determinístico | `packager.ts` (NUEVO) | Fases 6-10 |
| 12 | ADAPT | Async | `adaptive.ts` (Sprint 5) | Post-entrega |

---

## Tareas

### 1. Fase 2: Requirements Agent
**Archivo**: `src/lib/pipeline/v5/requirements.ts`
- Dado el `GoalClassification`, genera preguntas adaptadas al tipo de objetivo
- Ej: SKILL_ACQUISITION → pregunta nivel actual, tiempo disponible, experiencia previa
- Ej: QUANT_TARGET_TRACKING → pregunta target, plazo, situación actual
- ~300 tokens de LLM

### 2. Fase 3: Profile Finalizer
**Archivo**: `src/lib/pipeline/v5/profile.ts`
- Consolida respuestas del usuario en un perfil con anclas numéricas
- Calcula: horas libres/día, energía estimada, constraints de horario
- ~500 tokens de LLM

### 3. Fase 4: Strategic Roadmap Agent
**Archivo**: `src/lib/pipeline/v5/strategy.ts`
- Dado el perfil + clasificación + domain knowledge card, genera:
  - Fases del plan (ej: "fundamentos → consolidación → avanzado")
  - Hitos concretos con deadline estimada
  - Frecuencias recomendadas por fase
  - Progresiones (si aplica al tipo de objetivo)
- ~800 tokens de LLM
- Usa `DomainKnowledgeCard` del Sprint 1 para informar recomendaciones

### 4. Fase 5: Template Builder
**Archivo**: `src/lib/pipeline/v5/template-builder.ts`
- Traduce la estrategia a `ActivityRequest[]` para el scheduler
- Para cada actividad del roadmap, genera un `ActivityRequest` con:
  - `frequencyPerWeek`, `durationMin`, `constraintTier`
  - `preferredSlots` basados en el perfil del usuario
  - `minRestDaysBetween` basado en la domain knowledge card
- **Determinístico**: no usa LLM

### 5. Fase 7: Hard Validator
**Archivo**: `src/lib/pipeline/v5/hard-validator.ts`
- Verifica el output del scheduler contra constraints duras:
  - No hay overlaps
  - Ningún evento fuera de availability windows
  - Duraciones correctas
  - Frecuencias mínimas cumplidas
- **Determinístico**: puro código

### 6. Fase 8: Soft Validator
**Archivo**: `src/lib/pipeline/v5/soft-validator.ts`
- Verifica adherencia y calidad del plan:
  - ¿Hay demasiados context switches? (programar → cocinar → programar)
  - ¿Energía cognitiva bien distribuida? (no deep work a las 22h)
  - ¿Días de descanso suficientes?
  - ¿Ramp-up demasiado agresivo?
- Genera `SoftFinding[]` con severidad (warn/info)
- **Determinístico**: puro código

### 7. Fase 9: CoVe Verifier
**Archivo**: `src/lib/pipeline/v5/cove-verifier.ts`
- Chain-of-Verification: genera preguntas concretas sobre el plan
- Ej: "¿El plan incluye descanso después de 2 días de running?"
- Ej: "¿Las sesiones de guitarra son distribuidas o concentradas?"
- Se auto-responde verificando los PlanItems
- ~800 tokens de LLM

### 8. Fase 10: Repair Manager
**Archivo**: `src/lib/pipeline/v5/repair-manager.ts`
- Recibe findings de fases 7-9
- Para cada finding FAIL, genera un patch op:
  - `MOVE`: mover actividad a otro slot
  - `SWAP`: intercambiar 2 actividades
  - `DROP`: eliminar actividad (último recurso)
  - `RESIZE`: acortar duración
- Máx 3 iteraciones de repair
- Commit/revert: si el patch empeora el score, se revierte
- ~500 tokens/iteración

### 9. Fase 11: Packager
**Archivo**: `src/lib/pipeline/v5/packager.ts`
- Empaqueta el resultado final:
  - Lista de `PlanItem[]` polimórficos
  - Resumen en español abuela-proof
  - Implementation intentions pre-generadas
  - Score de calidad final
- **Determinístico**: puro código

### 10. Runner v5
**Archivo**: `src/lib/pipeline/v5/runner.ts`
- Orquesta las 12 fases secuencialmente
- Mantiene contexto entre fases
- Emite PhaseIO para cada fase (compatible con Flow Viewer)
- Repair loop: fases 7-10 se repiten hasta 3 veces si hay FAILs
- NO modifica el runner v1

### 11. Phase IO v5
**Archivo**: `src/lib/pipeline/v5/phase-io-v5.ts`
- Tipos de input/output para cada una de las 12 fases
- Compatible con el `PhaseIO` wrapper genérico existente

### 12. Tests
**Archivo**: `tests/pipeline-v5/runner.test.ts`
- Test E2E: objetivo simple → plan completo
- Test de repair loop: findings → patches → score mejora
- Test de CoVe: verifier detecta problema real

---

## Gates de calidad

- [ ] `npm run typecheck` pasa
- [ ] `npm run test` pasa
- [ ] `npm run build` pasa
- [ ] Pipeline v1 sigue funcionando (0 archivos v1 modificados)
- [ ] Repair loop se detiene en ≤3 iteraciones
- [ ] Runner v5 emite PhaseIO compatible con Flow Viewer
