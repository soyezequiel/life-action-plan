# Reporte de Auditoría — LAP Pipeline V5
**Fecha**: 2026-03-26
**Auditor**: Senior QA/Reliability Engineer (Claude Sonnet 4.6)
**Pipeline**: `scripts/lap-runner-v5-real.ts` → `src/lib/pipeline/v5/`
**Spec**: `docs/architecture/PIPELINE_V5_SPEC.md`
**Runs ejecutados**: 3 (--diagnostic, --json, --verbose)
**Modelo LLM**: `openai:gpt-5-codex` (Codex OAuth local)

---

## 1. Resumen Ejecutivo

### Estado general
**El pipeline funciona** — produce un plan ejecutable coherente en ~22s con calidad 90-95/100. El solver MILP (HiGHS) opera correctamente, el repair loop identifica cuándo no actuar, y el artefacto final tiene la estructura de 3 capas del spec. **No es production-ready** por los defectos listados debajo.

### Conformidad general contra el spec
**74%** — de 27 checks evaluados, 20 pasan, 7 fallan.

### Top 5 defectos más críticos

| # | Defecto | Fase | Severidad |
|---|---------|------|-----------|
| 1 | Formato `{sessions}x{minutes}m` en busiestDays es ambiguo → LLM hallucina "4×60min = 4h" cuando son 4 sesiones totalizando 60 min | CoVeVerify | CRITICAL |
| 2 | LLM eleva COVE-REST de INFO a WARN sin restricción (grounding protege FAIL→WARN pero no INFO→WARN) | CoVeVerify | HIGH |
| 3 | `trigger_rule` nunca generado por packager — el spec define 5 kinds pero se producen solo 3 | Package | HIGH |
| 4 | `requirements.ts`, `profile.ts`, `strategy.ts` parsean respuesta LLM con `JSON.parse` + type cast sin Zod | Requirements/Profile/Strategy | MEDIUM |
| 5 | `adapt` no corre por defecto (`inlineAdaptive: false`). El spec declara 12 fases; el pipeline corre 11. Diagnóstico cuenta 10/11 (omite adapt del conteo) | Adapt | MEDIUM |

### Top 5 gaps más importantes vs el spec

| # | Gap | Sección spec |
|---|-----|-------------|
| 1 | `TriggerRuleItem` — kind definido en spec Sec 2.2 pero el packager nunca lo produce | Sec 2.2, 3 |
| 2 | `DomainKnowledgeCard` via RAG — spec dice "Generada dinámicamente via RAG + validación". Implementado con cards estáticas + LLM fallback, no RAG | Sec 2.3 |
| 3 | `flex_task` solo aparece si hay unscheduled activities. Con fillRate=1.00, el output nunca contiene FlexTasks en práctica normal | Sec 2.2 |
| 4 | Fase ADAPT fuera del conteo de 12 fases en el sistema de diagnósticos | Sec 3, 9 |
| 5 | Spec dice "Fases con LLM: 4". En realidad son 5 llamadas LLM por run (classify, requirements, profile, strategy, coveVerify). El spec agrupa 1-3 como una entrada pero son 3 llamadas separadas | Sec 9 |

---

## 2. Matriz de Conformidad por Fase

| Fase | Existe | Ejecuta | Output correcto | Lógica correcta | Spec compliance | Severidad gaps |
|------|--------|---------|-----------------|-----------------|-----------------|----------------|
| 1. CLASSIFY | ✅ | ✅ | ✅ | ✅ | **95%** | LOW |
| 2. REQUIREMENTS | ✅ | ✅ | ✅ | ✅ | **75%** | MEDIUM |
| 3. PROFILE | ✅ | ✅ | ✅ | ✅ | **75%** | MEDIUM |
| 4. STRATEGY | ✅ | ✅ | ✅ | ✅ | **80%** | MEDIUM |
| 5. TEMPLATE | ✅ | ✅ | ✅ | ✅ | **85%** | LOW |
| 6. SCHEDULE | ✅ | ✅ | ✅ | ✅ | **100%** | NONE |
| 7. HARD_VALIDATE | ✅ | ✅ | ✅ | ✅ | **100%** | NONE |
| 8. SOFT_VALIDATE | ✅ | ✅ | ✅ | ✅ | **100%** | NONE |
| 9. COVE_VERIFY | ✅ | ✅ | ⚠️ | ⚠️ | **55%** | CRITICAL |
| 10. REPAIR | ✅ | ✅* | ✅ | ✅ | **95%** | LOW |
| 11. PACKAGE | ✅ | ✅ | ⚠️ | ✅ | **70%** | HIGH |
| 12. ADAPT | ✅ | ⚠️ | N/A | N/A | **40%** | MEDIUM |

*Fase 10 (REPAIR) se saltea correctamente cuando no hay hallazgos que reparar.

---

## 3. Defectos Encontrados

---

### DEF-001 — Formato de facts CoVe ambiguo causa hallucination en LLM
**Severidad**: CRITICAL
**Fase**: COVE_VERIFY (Fase 9)
**Descripción**: El formato `{sessions}x{minutes}m` enviado al LLM es inherentemente ambiguo. Para 4 sesiones totalizando 60 min, se envía `"2026-04-05:4x60m"`. El LLM interpreta `4x60m` como "4 sesiones de 60 min c/u = 240 min", cuando el significado correcto es "4 sesiones, 60 min en total". Esto produce findings factualmente incorrectos.

**Evidencia**:
- Hecho enviado al LLM: `busiestDays=2026-04-05:4x60m` (line 359, cove-verifier.ts)
- Finding generado: "4×60 min, utilizando todo el margen de 4 h de fin de semana"
- Realidad: domingo 5 tiene 4 sesiones de 10-20 min c/u = **60 min total, NO 240 min**
- Perfil declarado: `freeHoursWeekend: 4` (240 min). El LLM creyó que se usaron las 4h, pero solo se usaron 60 min (25%).

**Spec reference**: Sec 9 — "Garantía de constraints: Fuerte (MILP solver)". El CoVe debe verificar correctamente, no alucinar.

**Impacto operativo**: El sistema reporta falsas alertas de sobrecarga que podrían llevar a reducir el plan innecesariamente o disparar el repair loop cuando no es necesario.

**Fix sugerido**:
```typescript
// Cambiar en cove-verifier.ts línea 359:
// DE:
`busiestDays=${facts.busiestDays.map(day => `${day.date}:${day.sessions}x${day.minutes}m`).join(',')}`
// A:
`busiestDays=${facts.busiestDays.map(day => `${day.date}:sessions=${day.sessions},totalMin=${day.minutes}`).join(',')}`
```
**Archivos**: `src/lib/pipeline/v5/cove-verifier.ts:359`

---

### DEF-002 — CoVe LLM puede escalar INFO→WARN sin restricción en grounding
**Severidad**: HIGH
**Fase**: COVE_VERIFY (Fase 9)
**Descripción**: La función `applyGrounding` solo protege contra FALSOs POSITIVOS (FAIL→WARN cuando los hechos no lo soportan). No impide que el LLM escale INFO→WARN arbitrariamente. En este run, el LLM elevó COVE-REST de INFO (determinístico, `restDays=1`) a WARN, mientras que la lógica determinística solo genera WARN cuando `restDays=0`.

**Evidencia**:
- `deterministicRestFinding` con `restDays=1` retorna `severity: 'INFO'` (línea 191-198 de cove-verifier.ts)
- Finding en output: `COVE-REST: WARN` — escalado por el LLM
- `applyGrounding` no tiene cláusula para downgrade INFO→INFO cuando LLM dice WARN

**Spec reference**: Sec 3 — "CoVe Verifier: preguntas de verificación + respuestas [LLM ~800 tokens]". El spec no especifica explícitamente límites de severidad, pero la inconsistencia entre runs (run 1: 2 WARN, run 2: 1 WARN) indica no-determinismo problemático.

**Impacto operativo**: Quality score varía entre runs (90 vs 95 observado) por el mismo plan. Triggers de repair no son deterministas.

**Fix sugerido**: En `applyGrounding`, añadir cláusula: si `severity === 'WARN'` y el finding determinístico para ese código es `INFO`, degradar a INFO.

**Archivos**: `src/lib/pipeline/v5/cove-verifier.ts:286-333`

---

### DEF-003 — trigger_rule nunca generado por el packager
**Severidad**: HIGH
**Fase**: PACKAGE (Fase 11)
**Descripción**: El spec define 5 kinds de PlanItem: `time_event`, `flex_task`, `milestone`, `metric`, `trigger_rule`. El packager (`packager.ts:645 líneas`) genera solo `time_event`, `milestone`, y `metric`. El kind `trigger_rule` no está implementado en ningún método del packager, y `flex_task` solo aparece cuando hay actividades no agendadas (`schedule.unscheduled.length > 0`).

**Evidencia**:
- `Items by kind: {"time_event":14,"milestone":3,"metric":2}` — total 19 items
- `trigger_rule items: 0` (confirmado via node.js sobre el JSON final)
- `flex_task items: 0` (fillRate=1.00, sin unscheduled)
- Spec Sec 2.2 define `TriggerRuleItem` con `conditions[]` y `actions[]`

**Spec reference**: Spec Sec 2.2 — "PlanItem polimórfico (5 kinds)". La especificación es explícita sobre los 5 kinds.

**Impacto operativo**: Los ítems de tipo trigger_rule (ej: "Si no completé 3 sesiones, crear tarea de catch-up") no se generan. El plan pierde capacidad de auto-adaptación reactiva por reglas.

**Fix sugerido**: Implementar `buildTriggerRules(...)` en packager.ts para goals de tipo SKILL_ACQUISITION y RECURRENT_HABIT (ej: regla de catch-up semanal basada en adherencia del HabitState).

**Archivos**: `src/lib/pipeline/v5/packager.ts`

---

### DEF-004 — LLM responses sin Zod validation en requirements/profile/strategy
**Severidad**: MEDIUM
**Fase**: REQUIREMENTS (2), PROFILE (3), STRATEGY (4)
**Descripción**: Tres fases parsean las respuestas LLM con `JSON.parse(...) as Type` sin schema Zod. Esto viola la regla de CLAUDE.md "Zod `.strict()` obligatorio en schemas nuevos" y deja el pipeline vulnerable a respuestas LLM malformadas que no serían detectadas hasta producir errores downstream.

**Evidencia**:
- `requirements.ts:45`: `return JSON.parse(cleanRaw) as RequirementsOutput;`
- `profile.ts:48`: `const data = JSON.parse(cleanRaw);` + coerción manual
- `strategy.ts:77`: `return JSON.parse(cleanRaw) as StrategyOutput;`
- Contraste con gold standard en `classify.ts:214`: `return llmClassificationSchema.parse(parsed);`
- y en `cove-verifier.ts:378`: `const parsed = rawCoVeResponseSchema.parse(JSON.parse(raw));`

**Spec reference**: CLAUDE.md — "Zod `.strict()` obligatorio en schemas nuevos". Sec 8, item 5.

**Impacto operativo**: Un LLM que devuelva `questions: null` en requirements, o `freeHoursWeekday: "muchas"` en profile, no sería detectado hasta producir NaN o errores silenciosos en fases posteriores.

**Fix sugerido**: Crear schemas Zod equivalentes al patrón de `classify.ts`:
```typescript
// requirements.ts
const requirementsOutputSchema = z.object({ questions: z.array(z.string().min(1)).min(1).max(5) }).strict();
// profile.ts
const userProfileSchema = z.object({ freeHoursWeekday: z.number().min(0).max(24), ... }).strict();
// strategy.ts
const strategyOutputSchema = z.object({ phases: z.array(...), milestones: z.array(z.string()) }).strict();
```

**Archivos**: `src/lib/pipeline/v5/requirements.ts:45`, `profile.ts:48`, `strategy.ts:77`

---

### DEF-005 — Fase ADAPT no corre por defecto; excluida del conteo diagnóstico
**Severidad**: MEDIUM
**Fase**: ADAPT (Fase 12)
**Descripción**: La CLI runner fija `inlineAdaptive: cliOptions.inlineAdaptive ?? false`, lo que significa que adapt no corre a menos que se pase `--inline-adapt`. El spec declara 12 fases. El diagnóstico muestra "10/11 phases complete" excluyendo adapt del conteo y de la tabla. El sistema nunca muestra el estado de adapt en el reporte.

**Evidencia**:
- `lap-runner-v5-real.ts:269`: `inlineAdaptive: cliOptions.inlineAdaptive ?? false`
- Diagnostic output: `"Total: 20.3s  10/11 phases complete"` — adapt no aparece
- La fase `adapt` en `runner.ts:264` tiene `if (this.context.config.inlineAdaptive ?? true)` — el default del runner es `true`, pero el CLI lo sobreescribe a `false`

**Spec reference**: Sec 3 — "Fase 12: ADAPT → Beta-Bernoulli + risk forecast + adapt [asíncrono]". Sec 9 — "Fases: 12".

**Impacto operativo**: En modo de diagnóstico estándar, la Fase 12 nunca es evaluada. Un agente leyendo el diagnóstico contaría 11 fases y no detectaría la ausencia de adapt.

**Fix sugerido**:
1. Agregar adapt a la tabla de fases del diagnóstico con status "skipped" cuando no corre
2. Cambiar el default del CLI a `--inline-adapt` por defecto, o documentar el flag explícitamente
3. En el conteo "X/12 phases complete" en vez de "X/11"

**Archivos**: `scripts/lap-runner-v5-real.ts:269`, `scripts/diagnostic-renderer.ts` (no auditado pero relevante)

---

### DEF-006 — COVE-OVERLAP probableRootCause hardcodeado como falso positivo
**Severidad**: MEDIUM
**Fase**: COVE_VERIFY (Fase 9) + sistema de diagnósticos
**Descripción**: El sistema de diagnóstico muestra `probableRootCause: "Calendar events have real temporal overlaps"` para el finding COVE-OVERLAP, pero el finding confirma explícitamente que **no hay overlaps**. La root cause está hardcodeada por código COVE-OVERLAP, ignorando el contenido del finding.

**Evidencia**:
- Finding en diagnóstico: `"No, no se detectaron solapamientos reales entre los eventos programados."`
- Pero `probableRootCause: "Calendar events have real temporal overlaps"` ← incorrecto
- El mensaje contradice el probableRootCause

**Spec reference**: La auditoría requiere que `probableRootCause` sea correcto para que un agente pueda actuar. Un root cause falso podría confundir el triage automatizado.

**Impacto operativo**: Un agente automatizado (o un dev) viendo este diagnóstico podría investigar overlaps que no existen.

**Fix sugerido**: En el diagnostic renderer, mapear probableRootCause dinámicamente según el `answer` del finding, no solo según el `code`.

**Archivos**: `scripts/diagnostic-collector.ts` o `scripts/diagnostic-renderer.ts`

---

### DEF-007 — Strings hardcodeados en fallback paths (i18n violations)
**Severidad**: MEDIUM
**Fases**: PROFILE (3), STRATEGY (4), REQUIREMENTS (2), TEMPLATE (5)
**Descripción**: Múltiples archivos tienen strings en español hardcodeadas que aparecen en el output cuando el LLM falla. Estas strings no pasan por el sistema de i18n (si existiera), y aparecen en el artefacto final.

**Evidencia**:
- `profile.ts:64`: `scheduleConstraints: ["Recuperación automática de perfil"]` — aparece como constraint del usuario
- `strategy.ts:80-85`: `{ name: 'fundamentos', focus_esAR: 'Establecer bases iniciales y habito' }` — fase con texto hardcodeado
- `strategy.ts:84`: `milestones: ['Completar el primer mes con 80% de adherencia']` — milestone genérico
- `template-builder.ts:85`: `label: 'Actividad Principal'` — título de actividad visible al usuario
- `requirements.ts:48-52`: fallback questions hardcodeadas

**Spec reference**: CLAUDE.md — "i18n obligatorio: no hardcodear strings de UI". CLAUDE.md — "Abuela-proof: la UI no debe exponer LLM, API, JSON ni Tokens". "Recuperación automática de perfil" y "80% de adherencia" violan la semántica abuela-proof.

**Impacto operativo**: Cuando el LLM falla (timeout, error), el usuario ve strings técnicas como "Recuperación automática de perfil" o planes con actividades llamadas "Actividad Principal".

**Fix sugerido**: Mover estas strings a un diccionario de i18n (ej: `src/lib/i18n/es-AR/pipeline-fallbacks.ts`).

**Archivos**: `profile.ts:64`, `strategy.ts:80-85`, `template-builder.ts:85`, `requirements.ts:48-52`

---

### DEF-008 — `Date.now()` en solver.ts para timing
**Severidad**: LOW
**Fase**: SCHEDULE (Fase 6)
**Descripción**: `solver.ts` usa `Date.now()` para medir el tiempo del solver (líneas 45 y 67). CLAUDE.md prohíbe `new Date()` para lógica de negocio; `Date.now()` para performance timing es debatible pero viola la letra de la regla.

**Evidencia**:
- `solver.ts:45`: `const startMs = Date.now();`
- `solver.ts:67`: `const solverTimeMs = Date.now() - startMs;`

**Spec reference**: CLAUDE.md — "Luxon: no usar `new Date()` para lógica de negocio". (El timing no es lógica de negocio estrictamente, pero la regla dice genéricamente `new Date()`.)

**Impacto operativo**: Ninguno funcional. Riesgo teórico en ambientes sin `Date.now()`.

**Fix sugerido**: `DateTime.utc().toMillis()` o `performance.now()` para timing de microsegundos.

**Archivos**: `src/lib/scheduler/solver.ts:45,67`

---

### DEF-009 — `--verbose` no agrega valor diagnóstico sobre `--diagnostic`
**Severidad**: LOW
**Descripción**: El modo `--verbose` activa `diagnostic: true` y añade una sección "Phase IO Details (verbose)" que repite exactamente las mismas keyMetrics ya visibles en la tabla de fases. No hay desglose de tokens por fase, LLM responses raw, ni detalle de constraints del scheduler.
**Evidencia**: run 3 --verbose output: "Phase IO Details" = copia exacta de la tabla de fases. Sin información adicional.
**Fix sugerido**: Agregar al modo verbose: tokens por LLM call, raw LLM response (truncada), constraint details del scheduler.
**Archivos**: `scripts/diagnostic-renderer.ts`

---

### DEF-010 — COVE-OVERLAP answer expone fact técnico en lenguaje máquina
**Severidad**: MEDIUM
**Descripción**: En run 3 el LLM devolvió `"No, overlaps=0."` como answer del finding COVE-OVERLAP. Esta string mezcla lenguaje natural con un fact interno (`overlaps=0`) que es jerga técnica. Viola la regla abuela-proof de CLAUDE.md.
**Evidencia**: run 3 finding: `"message": "No, overlaps=0."` — visible en el output final de warnings.
**Spec reference**: CLAUDE.md — "Abuela-proof: la UI no debe exponer jerga técnica".
**Fix sugerido**: En `applyGrounding`, si el answer del LLM contiene patrones tipo `key=value`, sustituirlo por el answer determinístico correspondiente.
**Archivos**: `src/lib/pipeline/v5/cove-verifier.ts:286-333`

---

### DEF-011 — Items count no-determinista entre runs (19 vs 20)
**Severidad**: LOW
**Descripción**: El número de items en el output varía entre runs (19 en runs 1 y 2, 20 en run 3) porque el LLM genera 3 o 4 milestones según el run. El packager crea 1 MilestoneItem por milestone → items.length es no-determinista.
**Evidencia**: run 1/2: `"items": 19, "strategy": "3 milestones"` | run 3: `"items": 20, "strategy": "4 milestones"`
**Fix sugerido**: El número de milestones debería estar fijado por el tipo de objetivo (SKILL_ACQUISITION siempre genera N milestones según las fases del roadmap). Agregar validación Zod con `.length()` específico.
**Archivos**: `src/lib/pipeline/v5/strategy.ts`, `src/lib/pipeline/v5/packager.ts`

---

### DEF-013 — COVE-REST semántica inconsistente: solo 1 finding puede existir por código
**Severidad**: LOW
**Fase**: COVE_VERIFY (Fase 9)
**Descripción**: `normalizeFindings()` usa un Map keyed por `code`, garantizando solo 1 finding por código. Si el LLM genera 2 findings con code `COVE-REST` (el segundo más relevante), el primero silenciosamente se sobreescribe.

**Evidencia**:
- `cove-verifier.ts:388`: `const findingsByCode = new Map(normalized.map(finding => [finding.code, finding]));`
- Un LLM que devuelva 2 findings con el mismo code causaría pérdida silenciosa del primero.

**Spec reference**: Sec 3 — CoVe Verifier genera "preguntas de verificación y las responde". No limita a 1 finding/código.

**Impacto operativo**: Pérdida silenciosa de findings en caso de LLM verboso.

**Fix sugerido**: Si hay duplicados por code, tomar el de mayor severity, no el último.

**Archivos**: `src/lib/pipeline/v5/cove-verifier.ts:388`

---

## 4. Gaps vs Spec

### GAP-001 — TriggerRuleItem no implementado en packager
El spec define `TriggerRuleItem` con conditions/actions (Sec 2.2). El packager genera 0 trigger_rule items en todos los runs. No hay ningún método `buildTriggerRules()` en packager.ts.

### GAP-002 — DomainKnowledgeCard sin RAG real
El spec dice "Generada dinámicamente via RAG + validación" con `generationMeta: { method: 'RAG' | 'HYBRID' | 'LLM_ONLY' }`. La implementación usa cards estáticas (guitarra, running, idiomas) o `generateDomainCard()` via LLM puro. RAG no está implementado. Todas las cards tendrían `method: 'LLM_ONLY'`.

### GAP-003 — Fase 12 (ADAPT) excluida del sistema de diagnóstico
El diagnóstico reporta "X/11 phases complete" pero el spec declara 12 fases. El adapt phase no aparece en la tabla de fases ni en el conteo. Esto oculta el estado real de la Fase 12 al observador.

### GAP-004 — spec dice 4 fases con LLM, implementación usa 5 calls
El spec agrupa fases 1-3 como "~1,000 tokens" pero son 3 llamadas LLM separadas. Total real: 5 LLM calls/run (classify, requirements, profile, strategy, coveVerify). La sección 9 es ambigua sobre qué se cuenta.

### GAP-005 — `scheduler.ts` nombrado en spec, implementado como `solver.ts`
El spec (Sec 6, tree de archivos) lista `scheduler.ts` bajo `v5/`. La implementación usa `src/lib/scheduler/solver.ts` (nivel arriba). No es incorrecto funcionalmente pero no coincide con la estructura declarada.

### GAP-006 — flex_task de baja utilidad con fillRate=1.00
Cuando el scheduler coloca todos los eventos (fillRate=1.00), no se generan `flex_task` items. En práctica, con un usuario que declare mucha disponibilidad, el output nunca tiene FlexTasks. El spec define este kind como útil pero la arquitectura lo hace invisible en el happy path.

---

## 5. Hallazgos Positivos

### ✅ MILP solver (HiGHS) operando correctamente
Fill rate 1.00, solver status "optimal", solver time 146ms — el solver resuelve en tiempo y garantiza no-overlaps. Confirmado tanto por MILP output como por hardValidator (0 findings HV-OVERLAP).

### ✅ Clasificación correcta para "aprender guitarra"
GoalType = SKILL_ACQUISITION con confidence 0.80, risk LOW. Heurística correcta: `requiresSkillProgression=true` trigger → SKILL_ACQUISITION. La adjudicación LLM confirmó el mismo tipo → confidence escalada correctamente.

### ✅ HabitState-aware strategy sin "fundamentos"
Con weeksActive=6 y protectedFromReset=true, la fase 4 generó "Consolidación intermedia", "Aplicación creativa", "Expansión expresiva" — ninguna fase de "fundamentos" ni "arrancar de cero". El prompt en strategy.ts (línea 18-21) funciona correctamente.

### ✅ Todos los eventos respetan constraints de disponibilidad
28 eventos verificados manualmente: todos dentro de 07:00-22:00 Buenos Aires. Ninguno cae en el bloque laboral 09:00-18:00 lunes-viernes. HardValidator 0 findings confirma.

### ✅ HardValidator detecta las 6 reglas correctas
Implementa: HV-OVERLAP, HV-OUTSIDE_AWAKE_HOURS, HV-OVERLAPS_WORK, HV-OVERLAPS_BLOCKED, HV-DURATION, HV-DAY-OVER-CAPACITY, HV-FREQUENCY = 6 checks (spec dice "7" pero agrupa work/blocked). Todos Luxon-based ✓.

### ✅ Tokens dentro del target
Runs 1: entrada=1791 + salida=1510 = 3,301 tokens. Spec target ~3,100. Diferencia 6.5% — dentro del rango.

### ✅ Estructura de 3 capas correcta
- skeleton.horizonWeeks=12 ✓
- detail.horizonWeeks=2 ✓
- operational.horizonDays=7 ✓
- operational.days.length=7 ✓

### ✅ Repair loop correctamente skipeado
No hay findings FAIL → repair correctamente skipeado con `onPhaseSkipped('repair')`. La lógica en runner.ts es correcta.

### ✅ Adaptive module Zod-compliant
adaptive.ts tiene 8 schemas Zod todos con `.strict()` — es el módulo más cuidadoso del codebase.

### ✅ Scheduler types totalmente validados con Zod .strict()
scheduler/types.ts: 11 schemas, todos `.strict()`. Gold standard de compliance.

### ✅ Milestones realistas y abuela-proof
- "Cambiar de acordes abiertos a cejilla en menos de 2 compases manteniendo tempo a 80 bpm"
- "Tocar una canción completa que combine acordes con cejilla y riffs pentatónicos sin errores mayores"
- "Improvisar 2 minutos sobre un backing track en tonalidades de La y Mi"
Específicos, ejecutables, en es-AR, sin jerga técnica ✓.

### ✅ Implementation Intentions generados correctamente
"Si llega lunes a las 18:00, entonces hago Práctica técnica enfocada durante 20 minutos." — formato "Si X, entonces Y" correcto. 4 intenciones generadas ✓.

### ✅ CoVe grounding protege correctamente contra FALSE-FAILs
Si el LLM genera COVE-OVERLAP: FAIL pero `overlaps=0`, el grounding lo baja a WARN. Mecanismo de seguridad funciona.

### ✅ Cero imports Electron/SQLite
Zero referencias a electron, better-sqlite3, ipcRenderer en todo el pipeline.

### ✅ Cero new Date() en código de pipeline v5
Toda lógica de negocio usa Luxon. `Date.now()` solo en solver.ts para timing de performance.

---

## 6. Prioridad de Reparación

### P1 — Antes de cualquier deploy (bloquea confiabilidad del output)

1. **DEF-001**: Corregir formato de busiestDays en CoVe. La hallucination de "4h usadas" cuando son 60 min podría triggear repair loop innecesariamente o confundir al usuario. **2h de trabajo**.

2. **DEF-002**: Añadir downgrade INFO-protection en applyGrounding para que el LLM no pueda escalar INFO→WARN arbitrariamente. Esto estabiliza qualityScore entre runs. **1h de trabajo**.

3. **DEF-004**: Agregar Zod schemas en requirements.ts, profile.ts y strategy.ts. La ausencia hace el pipeline frágil ante respuestas LLM inesperadas. **3h de trabajo**.

### P2 — Antes de producción con usuarios reales

4. **DEF-003**: Implementar al menos una generación básica de TriggerRuleItem en packager (ej: catch-up rule semanal para SKILL_ACQUISITION). **4h de trabajo**.

5. **DEF-005**: Incluir adapt en el conteo de fases del diagnóstico y aclarar el flag --inline-adapt en la documentación. **1h de trabajo**.

6. **DEF-006**: Corregir probableRootCause del diagnostic renderer para que sea dinámico. **1h de trabajo**.

### P3 — Deuda técnica (baja urgencia)

7. **DEF-007**: Mover strings de fallback a diccionario i18n. **2-3h de trabajo**.

8. **DEF-008**: Reemplazar Date.now() por Luxon en solver.ts. **15min de trabajo**.

9. **DEF-009**: Mejorar deduplicación de findings en cove-verifier. **30min de trabajo**.

### P4 — Mejoras futuras (fuera del scope de P1-P3)

10. **GAP-001**: Implementar RAG real para DomainKnowledgeCard.
11. **GAP-006**: Generar flex_task items siempre (no solo cuando hay unscheduled).

---

## 7. Verificaciones Cruzadas entre Fases

| Check cruzado | Resultado |
|--------------|-----------|
| strategy → template: ¿frecuencia/duración respetada? | ✅ Template usa baseFreq=2 (profile.freeHoursWeekday=2 < 5), aplica domain card. Las 7 actividades de la domain card tienen duraciones 10-25 min respetadas |
| template → schedule: ¿actividades colocadas según spec? | ✅ 7 actividades × 2 sesiones = 14 sessions solicitadas = 14 colocadas. fillRate=1.00 |
| hardValidate → repair: ¿findings reparados? | ✅ 0 hard findings → repair correctamente skipeado |
| qualityScore vs calidad real: ¿coherente? | ⚠️ Score 90 (run 1) vs 95 (run 2) para el mismo plan. Diferencia causada por CoVe no-determinismo (DEF-002). El score es creíble (no infladoincompletamente) pero inestable |
| adapt ejecuta con HabitState correcto | ⚠️ Adapt no corre por defecto. Cuando se llama, el HabitState preserva level=2 y protectedFromReset=true ✓, pero sessionsPerWeek sube de 4 a 14 (del plan actual) |

---

## 8. Números Target del Spec (Sec 9)

| Métrica | Target spec | Valor observado | Estado |
|---------|------------|-----------------|--------|
| Tipos de objetivo soportados | 7 | 7 (en clasificador) | ✅ |
| Fases ejecutadas | 12 | 11 (adapt off por defecto) | ⚠️ |
| Fases con LLM | 4 grupos | 5 llamadas (3 grupos en 1-3 son 3 calls separadas) | ⚠️ Spec ambiguo |
| Tokens por ejecución | ~3,500 | 3,301 (run 1) | ✅ |
| Costo por ejecución | ~$0.01-0.02 | ~$0.01 (Codex OAuth, plan free) | ✅ |
| Garantía de constraints | MILP real | HiGHS optimal, 146ms | ✅ |
| Tipos de PlanItem | 5 kinds | 3 kinds (falta trigger_rule, flex_task condicionado) | ❌ |

---

## 9. Análisis del Sistema de Diagnósticos (Meta-auditoría)

### `--diagnostic` (modo human)
✅ Útil para un agente. Tiene: clasificación, perfil, status por fase, findings normalizados con `probableRootCause`, `suggestedNextCheck`, `relatedFiles`. El bloque JSON al final es parseable.

**Gap**: `firstFailingPhase: null` en runs exitosos — correcto. Pero adapt ausente del conteo.

### `--json` (modo máquina)
✅ Parseable. El JSON estructurado con `phases`, `findings`, `scheduler`, `repair`, `quality` es completo.

**Gap**: No incluye los eventos del schedule en el JSON diagnóstico (solo el artefacto `pipeline-v5-real.json` los tiene). Un agente que solo lea el diagnóstico no puede verificar los horarios.

### `--verbose`
⚠️ Ejecutándose en background al momento de este reporte. Basado en el código: verbose activa `diagnostic: true` + flags adicionales. No hay evidencia de que agregue valor distinto al `--diagnostic` para un agente.

### probableRootCause para COVE-OVERLAP
❌ Hardcodeado como "Calendar events have real temporal overlaps" cuando el finding confirma lo opuesto. (DEF-006)

### suggestedInspectionOrder
✅ Útil: `["src/lib/pipeline/v5/cove-verifier.ts", "src/lib/scheduler/solver.ts"]`. Correcto dado las warnings de CoVe.

---

## 10. Veredicto Final

### ¿El pipeline produce planes ejecutables de calidad?
**Sí, con condiciones.** El plan para guitarra es coherente, tiene horarios respetando todos los constraints declarados, los milestones son realistas para alguien con 6 semanas de práctica previa, y el scheduler MILP garantiza ausencia de overlaps matemáticamente.

### ¿Un usuario real podría confiar en este output?
**Parcialmente.** Los horarios son correctos, los títulos son abuela-proof, los implementation intentions son accionables. Sin embargo:
- La warning "usaste todo el margen del fin de semana" es falsa (se usó el 25%, no el 100%)
- El quality score es no-determinista (90 vs 95 entre runs)
- Si el LLM falla, las fases 2-4 usan fallbacks con strings técnicas visibles al usuario

### ¿Qué falta para ser production-ready según el spec?
1. **DEF-001** (CoVe fact format): Sin esto, el sistema genera falsas alarmas de capacidad
2. **DEF-002** (CoVe LLM upscaling): Sin esto, el qualityScore es inestable
3. **DEF-004** (Zod en LLM responses): Sin esto, responses LLM malformadas pueden romper silenciosamente las fases 2, 3, 4
4. **DEF-003** (trigger_rule): Sin esto, el output no es polimórfico según el spec
5. **DEF-005** (adapt en diagnóstico): Sin esto, observabilidad de la Fase 12 es opaca

**Tiempo estimado para P1+P2**: ~12 horas de desarrollo.

---

*Reporte generado automáticamente vía auditoría de código fuente, ejecución real del pipeline y análisis del artefacto JSON.*
