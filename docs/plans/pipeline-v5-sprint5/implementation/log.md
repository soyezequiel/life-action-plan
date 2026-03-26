## Sesión 2026-03-25T22:04:04-03:00 — codex

### Tareas completadas
- [x] Tarea 1: Modelo Beta-Bernoulli de Adherencia
- [x] Tarea 2: Generador de Risk Forecast
- [ ] Tarea 3: Fase 12: Adaptive Loop (Lanzador)
- [ ] Tarea 4: Tests Proactivos

### Archivos tocados
- `src/lib/domain/adherence-model.ts` — cálculo Beta-Bernoulli con alpha, beta, meanProbability, tendencia y señales derivadas.
- `src/lib/domain/risk-forecast.ts` — forecast determinístico SAFE / AT_RISK / CRITICAL apoyado en `HabitState`.
- `tests/pipeline-v5/adherence-risk.test.ts` — cobertura unitaria de adherencia, caída reciente y racha crítica de fallos.
- `docs/plans/pipeline-v5-sprint5/status.json` — status operativo actualizado para reflejar avance parcial.
- `docs/plans/pipeline-v5-sprint5/history/20260325-220030-codex.md` — toma formal del plan.

### Decisiones tomadas
- La tendencia `DECAYING` solo se activa si existe suficiente base previa para comparar contra la ventana reciente y evitar falsos positivos en historiales cortos.
- `forecastRisk` no relee tracking crudo: consume el resultado de `calculateAdherence` y reutiliza `HabitState` del Sprint 4.
- La condición `CRITICAL` se dispara con 6 fallos consecutivos, equivalente a la regla pedida de "más de 5".

### Tests ejecutados
- `npm run typecheck` → OK
- `npm run test -- tests/pipeline-v5/adherence-risk.test.ts` → OK

### Estado final: in-progress
