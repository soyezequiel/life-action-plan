# Plan de correcciones del Flow Engine

Este documento contiene todas las tareas priorizadas para corregir el flow engine (`src/lib/flow/engine.ts`, `src/lib/flow/intake-agent.ts`, rutas en `app/api/flow/`). Cada tarea es autocontenida: describe el problema, la ubicación exacta del código, y el fix esperado.

Lee `CLAUDE.md` y `AGENTS.md` antes de empezar.

**Regla general**: no romper tests existentes. Después de cada grupo de cambios, correr `npm test` y verificar que pasan. Si un test falla porque el comportamiento cambió intencionalmente, actualizar el test.

---

## GRUPO A — BUGS (prioridad máxima)

### A1. Fecha absoluta sin mes produce horizonte de 1 mes

**Archivo:** `src/lib/flow/engine.ts`, función `inferGoalHorizonMonths`, líneas ~103-136

**Problema:** El regex `/\b(20\d{2})\b/` captura el año pero ignora el mes. "diciembre 2026" con fecha actual marzo 2026 calcula `diffMonths = 0` → clamped a 1 mes. Debería ser 9 meses.

**Fix:** Antes del regex de año absoluto, agregar un regex que capture mes + año:

```ts
const monthNames: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
}
const monthYearMatch = text.match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*(?:de\s*|del?\s*)?(20\d{2})/)
if (monthYearMatch) {
  const targetMonth = monthNames[monthYearMatch[1] ?? ''] ?? 1
  const targetYear = Number.parseInt(monthYearMatch[2] ?? '', 10)
  if (Number.isFinite(targetYear)) {
    const target = currentMonth.set({ year: targetYear, month: targetMonth })
    const diff = Math.ceil(target.diff(currentMonth, 'months').months)
    return Math.min(Math.max(diff, 1), 60)
  }
}
```

Colocar ANTES del bloque `absoluteYearMatch` para que tenga prioridad.

**Test:** Verificar que `inferGoalHorizonMonths("Aprobar en diciembre 2026", 'medio')` devuelve ~9 (no 1). Agregar test en `tests/flow-engine.test.ts`.

---

### A2. Slots bloqueados se mezclan entre eventos diferentes

**Archivo:** `src/lib/flow/engine.ts`, función `buildBlockedSlotSet`, líneas ~1092-1118

**Problema:** Un solo string con múltiples horarios ("martes y jueves 18 a 20, sábados a la mañana") se procesa como una sola unidad. Los day matches y slot matches se combinan incorrectamente: morning se bloquea para martes/jueves (incorrecto) y evening se bloquea para sábados (incorrecto).

**Fix:** Separar el string por comas o punto y coma antes de procesarlo. Cada fragmento se procesa independientemente:

```ts
function buildBlockedSlotSet(profile: Perfil): Set<string> {
  const blocked = new Set<string>()
  const events = profile.participantes[0]?.calendario?.eventosInamovibles ?? []

  for (const event of events) {
    const schedule = normalizeText(event.horario)
    if (!schedule) continue

    // Separar por coma, punto y coma, o " y " seguido de día
    const fragments = schedule.split(/[;,]|(?=\b(?:lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b)/i)
      .map(f => f.trim())
      .filter(Boolean)

    for (const fragment of fragments) {
      const normalized = normalizeComparableText(fragment)
      const dayMatches = DAY_KEYS.filter((day) => normalized.includes(DAY_LABELS[day]))
      const blockedSlots = extractBlockedSlots(fragment)

      if (dayMatches.length === 0 || blockedSlots.length === 0) continue

      for (const day of dayMatches) {
        for (const slot of blockedSlots) {
          blocked.add(`${day}:${slot}`)
        }
      }
    }
  }

  return blocked
}
```

**Test:** Agregar test con input "martes y jueves 18 a 20, sabados a la mañana". Verificar que `tuesday:morning` NO está bloqueado y `saturday:evening` NO está bloqueado.

---

### A3. Resume no recalcula strategy después de cambiar perfil

**Archivo:** `app/api/flow/session/[workflowId]/resume/route.ts`, líneas ~32-47

**Problema:** `applyResumePatch` modifica el perfil (horas disponibles, narrativa) pero la ruta persiste el state sin recalcular `strategy` ni `realityCheck`. El plan queda con datos viejos.

**Fix:** Después de aplicar el patch, si hay strategy y profile, recalcular:

```ts
const resolved = applyResumePatch(profile, session.state, parsed.data.changeSummary)

let nextState = resolved.state

// Recalcular strategy y reality check si el perfil cambió
if (resolved.profile && nextState.strategy && nextState.goals.length > 0) {
  const { buildStrategicPlanRefined, resolveRealityCheck } = await import('../../../../../../src/lib/flow/engine')
  const newStrategy = buildStrategicPlanRefined(nextState.goals, resolved.profile)
  const newReality = resolveRealityCheck(newStrategy, resolved.profile, 'keep')
  nextState = {
    ...nextState,
    strategy: newReality.strategy,
    realityCheck: newReality.result,
    simulation: null,      // invalidar simulación vieja
    presentation: null      // invalidar presentación vieja
  }
}
```

Ajustar el `currentStep`: si se invalidó la strategy, retroceder a `'reality-check'` en vez de `'presentation'`.

**Test:** Agregar test que verifique: después de resume con "menos tiempo", strategy.estimatedWeeklyHours refleja la nueva disponibilidad.

---

### A4. goalClarity almacenado en campo semánticamente incorrecto

**Archivo:** `src/lib/flow/engine.ts`, función `buildProfileFromFlow`, línea ~261

**Problema:** `answers.goalClarity` se guarda en `patronesConocidos.diaTipicoBueno`. Ese campo debería describir "cómo es un buen día", no la clarificación de una meta.

**Fix:** Guardar goalClarity en un campo más apropiado. La respuesta de goalClarity es una clarificación del objetivo, así que debe ir en los objetivos o como nota:

```ts
patronesConocidos: {
  diaTipicoBueno: 'Semana con bloques cortos y sostenidos.',
  diaTipicoMalo: normalizeText(answers.restricciones) || 'Semana caótica sin espacio real.',
  tendencias: [
    ...(normalizeText(answers.horariosFijos) ? [normalizeText(answers.horariosFijos)] : []),
    ...(normalizeText(answers.goalClarity) ? [`Meta clarificada: ${normalizeText(answers.goalClarity)}`] : [])
  ]
}
```

Y en los objetivos, enriquecer la motivación:

```ts
objetivos: goals.map((goal) => ({
  ...existingFields,
  motivacion: normalizeText(answers.goalClarity) || normalizeText(answers.motivacion) || goal.text,
}))
```

**Test:** Verificar que `patronesConocidos.diaTipicoBueno` nunca contiene el valor de goalClarity.

---

## GRUPO B — HEURÍSTICAS DE CATEGORIZACIÓN (prioridad alta, fixes rápidos)

### B1. Expandir regex de inferGoalCategory

**Archivo:** `src/lib/flow/engine.ts`, función `inferGoalCategory`, líneas ~84-93

**Fix:** Agregar patterns faltantes:

```ts
function inferGoalCategory(value: string): GoalDraft['category'] {
  const text = normalizeComparableText(value)

  if (/(salud|correr|entren|gim|peso|dormir|energia|fumar|tabaco|adiccion|meditar|yoga|nutricion|dieta|deporte|nadar|bici|ciclismo|maraton|triatlon|ironman|natacion|boxeo|crossfit)/.test(text)) return 'salud'
  if (/(ahorro|dinero|ingreso|finanza|deuda|presupuesto|invertir|inversion|plata|sueldo|cobrar)/.test(text)) return 'finanzas'
  if (/(curso|estudio|aprend|idioma|certificacion|examen|tesis|final|parcial|materia|carrera universitaria|facultad|maestria|doctorado|leer\s+\d+|libro)/.test(text)) return 'educacion'
  if (/(hobby|musica|arte|dibujo|foto|cocina|lectura|piano|guitarra|pintura|jardin|manualidad)/.test(text)) return 'hobby'
  if (/(trabajo|carrera|cliente|empresa|laburo|portfolio|freelance|emprendimiento|negocio|startup|ascenso|promocion|cv|entrevista|linkedin|remote.?job|developer|programador)/.test(text)) return 'carrera'
  if (/(mudanza|mudar|visa|emigrar|pasaporte|tramite|documento|licencia)/.test(text)) return 'mixto'
  return 'mixto'
}
```

**Test:** Agregar tests para: "Dejar de fumar" → salud, "Aprobar el final" → educacion, "Meditar todos los días" → salud, "Mudanza" → mixto (ya matcheado), "Get a remote job" → carrera (por "remote.*job").

---

### B2. Expandir regex de inferGoalEffort

**Archivo:** `src/lib/flow/engine.ts`, función `inferGoalEffort`, líneas ~95-101

**Fix:**

```ts
function inferGoalEffort(value: string): GoalDraft['effort'] {
  const text = normalizeComparableText(value)

  if (/(empresa|maraton|mudanza|cambio de carrera|emprendimiento|tesis|presidente|gobernador|intendente|senador|diputado|campana|candidatura|politica|emigrar|triatlon|ironman|doctorado|startup|42\s*km|full.?stack)/.test(text)) return 'alto'
  if (/(dejar de fumar|dejar de|adiccion|tabaco)/.test(text)) return 'alto'
  if (/(curso|ahorrar|rutina|habito|constancia|idioma|leer|piano|guitarra|meditar|dieta)/.test(text)) return 'medio'
  return value.length > 80 ? 'alto' : 'medio'
}
```

**Test:** "Dejar de fumar" → alto, "Correr 42 km" → alto.

---

### B3. Horizonte: parsear "N libros al año" y formatos indirectos

**Archivo:** `src/lib/flow/engine.ts`, función `inferGoalHorizonMonths`, líneas ~103-136

**Fix:** Agregar regex para "al año", "por año", "anual" antes del fallback:

```ts
// Después del weekMatch y antes del fallback por effort:
if (/(al ano|al año|por ano|por año|anual)/.test(text)) {
  return 12
}

if (/(al mes|por mes|mensual)/.test(text)) {
  return 1
}
```

**Test:** "Leer 24 libros al año" → 12 meses.

---

### B4. needsBestMoment debe incluir salud

**Archivo:** `src/lib/flow/intake-agent.ts`, función `needsBestMoment`, líneas ~486-488

**Fix:**

```ts
function needsBestMoment(goals: GoalDraft[]): boolean {
  return goals.some((goal) =>
    goal.category === 'educacion'
    || goal.category === 'carrera'
    || goal.category === 'hobby'
    || goal.category === 'salud'
  )
}
```

**Test:** Goal con category='salud' → needsBestMoment returns true.

---

## GRUPO C — DESFASE DE HORAS EN EVENTOS (prioridad alta)

### C1. Las sesiones generadas deben sumar las horas semanales del plan

**Archivo:** `src/lib/flow/engine.ts`, función `buildPlanEventsFromFlow`, líneas ~1212-1285

**Problema:** `resolveSessionDuration` clampea duraciones (ej: 105min → 90min para salud), lo que hace que `sessions * duration < hoursPerWeek * 60`. El plan dice 5h/semana pero genera 4.5h.

**Fix:** Después de calcular sessions y duration, verificar que sumen. Si no, ajustar sessions o duration:

```ts
function resolveSessionCountAndDuration(goal: GoalDraft): { sessions: number; duration: number } {
  let sessions = resolveWeeklySessions(goal)
  let duration = resolveSessionDuration(goal, sessions)
  const targetMinutes = goal.hoursPerWeek * 60

  // Si el total queda corto, agregar sesiones o alargar duración
  let totalMinutes = sessions * duration
  while (totalMinutes < targetMinutes && sessions < 7) {
    sessions += 1
    duration = resolveSessionDuration(goal, sessions)
    totalMinutes = sessions * duration
  }

  // Si sigue corto, alargar duración sin respetar el clamp
  if (totalMinutes < targetMinutes && sessions > 0) {
    duration = Math.ceil(targetMinutes / sessions / 15) * 15
  }

  return { sessions, duration }
}
```

Reemplazar las llamadas separadas a `resolveWeeklySessions` y `resolveSessionDuration` por esta función unificada dentro de `buildPlanEventsFromFlow`.

**Test:** Para goal salud con 5h/week, verificar que `sum(sessions * duration) >= 5 * 60`.

---

### C2. Meses muertos al final del plan

**Archivo:** `src/lib/flow/engine.ts`, función `buildStrategicPlanRefined`, líneas ~635-686

**Problema:** Con múltiples metas, las fases pueden terminar antes de `totalMonths`. Ej: totalMonths=12 pero última fase termina en mes 10. Meses 11-12 vacíos.

**Fix:** Después de construir las fases, extender la última fase hasta `totalMonths` si hay gap:

```ts
// Después de construir phases, antes de return:
if (phases.length > 0) {
  const lastPhase = phases[phases.length - 1]!
  if (lastPhase.endMonth < totalMonths) {
    phases[phases.length - 1] = {
      ...lastPhase,
      endMonth: totalMonths
    }
  }
}
```

**Test:** Plan con 2 goals de 3 meses cada uno secuenciales en un horizonte de 12 → última fase debe llegar a mes 12.

---

## GRUPO D — MODELO DE META: distinguir hábitos vs proyectos (prioridad media)

### D1. Metas de comportamiento no deben generar bloques de agenda

**Archivo:** `src/lib/flow/engine.ts`, funciones `inferGoalHoursPerWeek` y `buildStrategicPlanRefined`

**Problema:** "Ahorrar $5000", "Dejar de fumar", "Meditar 10 min" generan 3-8 horas semanales de bloques como si fueran proyectos.

**Fix:** Agregar un flag `isHabit` al GoalDraft. Requiere cambio de schema.

1. En `src/shared/schemas/flow.ts`, agregar al `goalDraftSchema`:
```ts
isHabit: z.boolean().default(false)
```

2. En `engine.ts`, función `analyzeObjectives`, inferir isHabit:
```ts
function inferIsHabit(text: string, category: GoalDraft['category']): boolean {
  const normalized = normalizeComparableText(text)
  if (category === 'finanzas') return true
  if (/(dejar de|meditar|habito|rutina|diario|todos los dias|constancia|mantener)/.test(normalized)) return true
  return false
}
```

3. Para goals con `isHabit: true`:
   - `hoursPerWeek`: mínimo viable (ej: meditar = 2h/week, finanzas = 1h/week)
   - En `buildStrategicPlanRefined`: siempre son support track (paralelos desde mes 1), no secuenciales
   - En `buildPlanEventsFromFlow`: generar recordatorios cortos (15-30 min) en vez de bloques largos

**Test:** "Ahorrar $5000" → isHabit=true, hoursPerWeek=1, support track. "Meditar todos los días" → isHabit=true, 7 sesiones de 15min.

---

## GRUPO E — TITULO Y UX (prioridad baja)

### E1. Limpiar título del plan

**Archivo:** `src/lib/flow/engine.ts`, línea ~674

**Problema:** "Plan para Quiero bajar de peso" incluye el verbo conjugado del input.

**Fix:**

```ts
function cleanGoalTextForTitle(text: string): string {
  return normalizeText(text)
    .replace(/^(quiero|necesito|me gustaria|voy a|tengo que|debo|quisiera|planeo)\s+/i, '')
}

// En buildStrategicPlanRefined:
title: goals.length > 1
  ? 'Plan unificado de objetivos'
  : `Plan para ${clipText(cleanGoalTextForTitle(goals[0]?.text || 'tu objetivo'), 80)}`
```

**Test:** "Quiero bajar de peso" → "Plan para bajar de peso".

---

### E2. Metas no-accionables: detectar y pedir reformulación

**Archivo:** `src/lib/flow/engine.ts`, función `analyzeObjectives`

**Problema:** "Ser feliz", "Mejorar", "Cambiar" generan plan completo con contenido vacío.

**Fix:** Agregar flag `needsClarification` al GoalDraft:

```ts
function isVagueGoal(text: string): boolean {
  const normalized = normalizeComparableText(text)
  if (normalized.length < 10) return true
  if (/^(ser|estar|sentir|mejorar|cambiar|crecer|avanzar)\s/.test(normalized) && normalized.length < 25) return true
  return false
}
```

En `analyzeObjectives`, marcar goals vagos. El frontend puede mostrar un warning pidiendo reformulación. No bloquear el flujo pero sí pedir clarificación.

Agregar al schema: `needsClarification: z.boolean().default(false)`.

**Test:** "Ser feliz" → needsClarification=true. "Correr una maratón en octubre" → false.

---

## GRUPO F — SIMULACIÓN (prioridad media-baja)

### F1. Simulación debería considerar carga por mes, no solo diferencia global

**Archivo:** `src/lib/flow/engine.ts`, función `runStrategicSimulation`, líneas ~756-838

**Problema:** Solo mira `strategy.estimatedWeeklyHours - realityCheck.availableHours` como número global. No detecta meses individuales con sobrecarga.

**Fix:** Iterar mes a mes y detectar meses problemáticos:

```ts
export function runStrategicSimulation(
  strategy: StrategicPlanDraft,
  realityCheck: RealityCheckResult
): StrategicSimulationSnapshot {
  const available = realityCheck.availableHours
  const iterations: StrategicSimulationSnapshot['iterations'] = []
  const findings: string[] = []
  let worstMonth = 0
  let worstLoad = 0

  for (let month = 1; month <= strategy.totalMonths; month += 1) {
    const monthLoad = strategy.phases.reduce((total, phase) =>
      phase.startMonth <= month && phase.endMonth >= month
        ? total + phase.hoursPerWeek
        : total, 0)
    if (monthLoad > worstLoad) {
      worstLoad = monthLoad
      worstMonth = month
    }
  }

  const difference = worstLoad - available

  // Usar difference para las iteraciones (mismo pattern actual pero basado en peak real)
  // ... rest of existing logic using difference ...

  if (worstLoad > available) {
    findings.push(`El mes ${worstMonth} es el mas exigente con ${worstLoad}h semanales contra ${available}h disponibles.`)
  }

  // Detectar fases que se solapan
  const overlappingPhases = strategy.phases.filter(p => p.startMonth <= worstMonth && p.endMonth >= worstMonth)
  if (overlappingPhases.length > 1) {
    findings.push(`En el mes ${worstMonth} hay ${overlappingPhases.length} frentes activos al mismo tiempo.`)
  }

  // ... rest ...
}
```

**Test:** Plan con 2 fases paralelas mes 1-3 (16h total) y available=18 → finding menciona mes específico.

---

## GRUPO G — FIXES ESTRUCTURALES (prioridad máxima, previo a simulación jerárquica)

Estos fixes son prerequisito de `CODEX_SIMULATION_PLAN.md`. Aplicarlos junto con A-F.

### G1. inferGoalEffort: trabajo en otro continente es esfuerzo alto

**Archivo:** `src/lib/flow/engine.ts`, función `inferGoalEffort`, primer regex de 'alto'

**Problema:** "Conseguir un trabajo remoto en Europa" se clasifica como effort 'medio'. Buscar trabajo en otro continente con visa es claramente effort 'alto'.

**Fix:** Agregar al primer regex de alto:

```ts
if (/(empresa|maraton|...|trabajo remoto|remote work|europa|estados unidos|usa|canada|uk|australia|visa de trabajo|emigrar|...)/.test(text)) return 'alto'
```

**Test:** "Conseguir un trabajo remoto en Europa" → 'alto'. "Visa de trabajo para Canadá" → 'alto'.

---

### G2. isSupportTrackGoal: no tratar toda meta de salud como support

**Archivo:** `src/lib/flow/engine.ts`, función `isSupportTrackGoal`, línea ~499

**Problema:** `goal.category === 'salud'` → siempre support track. Pero "Correr una media maratón" con 8h/semana no es un support track, es un proyecto principal.

**Fix:** Reemplazar la función:

```ts
function isSupportTrackGoal(goal: GoalDraft): boolean {
  const text = normalizeComparableText(goal.text)

  return goal.isHabit
    || (goal.category === 'salud' && goal.hoursPerWeek <= 3)
    || /(veces por semana|por semana|rutina|habito|entren)/.test(text)
}
```

Solo metas de salud livianas (≤3h/semana, como meditar) son support. Entrenar para una media maratón (8h/semana) es goal principal.

**Test:** Goal salud con hoursPerWeek=8, effort='alto' → false. Goal salud con hoursPerWeek=2 → true.

---

### G3. buildStrategicPlanRefined: goals principales deben cubrir su horizonte completo

**Archivo:** `src/lib/flow/engine.ts`, función `buildStrategicPlanRefined`, cálculo de `duration`

**Problema:** Duration se clampea por effort: `Math.min(goal.horizonMonths, 3)` para medio, `Math.min(goal.horizonMonths, 4)` para alto. Un goal de carrera con horizonte 9 meses solo recibe una fase de 3-4 meses. Los meses restantes quedan vacíos.

**Fix:** Para goals principales (no habit, no support track), duration = horizonMonths:

```ts
const duration = goal.isHabit
  ? totalMonths
  : supportTrack
    ? Math.max(2, Math.min(goal.horizonMonths, 3))
    : goal.horizonMonths  // cubrir todo el horizonte
```

**Test:** Goal carrera con horizonMonths=9, effort='alto', priority=1 → fase startMonth=1, endMonth=9.

---

### G4. runStrategicSimulation: detectar goals sin cobertura temporal

**Archivo:** `src/lib/flow/engine.ts`, función `runStrategicSimulation`

**Problema:** La simulación dice PASS aunque un goal de 9 meses solo tenga 3 meses de fase activa. Solo mira horas pico globales.

**Fix:** Agregar `goals: GoalDraft[]` como tercer parámetro (default `[]` para backwards compat). Después de calcular worstLoad, verificar cobertura:

```ts
export function runStrategicSimulation(
  strategy: StrategicPlanDraft,
  realityCheck: RealityCheckResult,
  goals: GoalDraft[] = []
): StrategicSimulationSnapshot {
  // ... existing code ...

  // Detectar goals sin cobertura completa
  const allGoalIds = [...new Set(strategy.phases.flatMap(p => p.goalIds))]
  for (const goalId of allGoalIds) {
    const coveredMonths = new Set<number>()
    for (const phase of strategy.phases) {
      if (phase.goalIds.includes(goalId)) {
        for (let m = phase.startMonth; m <= phase.endMonth; m++) coveredMonths.add(m)
      }
    }
    const goalData = goals.find(g => g.id === goalId)
    if (goalData && coveredMonths.size < goalData.horizonMonths * 0.7) {
      findings.push(`El objetivo "${clipText(goalData.text, 40)}" tiene actividad en ${coveredMonths.size} de ${goalData.horizonMonths} meses de su horizonte.`)
      if (finalStatus === 'PASS') finalStatus = 'WARN'
    }
  }

  // ... rest ...
}
```

**Test:** Goal con horizonMonths=9 pero fase de 3 meses → finding "actividad en 3 de 9 meses", finalStatus WARN.

---

## Orden de ejecución sugerido

1. **A1, A2, A3, A4** — Bugs. Hacer primero, testear.
2. **B1, B2, B3, B4** — Regex. Rápidos, alto impacto.
3. **C1, C2** — Desfase de horas. Importante para coherencia.
4. **D1** — Hábitos vs proyectos. Cambio de schema, probar bien.
5. **E1, E2** — UX. Bajo riesgo.
6. **F1** — Simulación. Mejora gradual.
7. **G1, G2, G3, G4** — Fixes estructurales previos a simulación jerárquica.

Después de cada grupo, correr `npm test` y verificar que pasan todos los tests.
