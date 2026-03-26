# Prompts de Implementación — Sprint 5: Adaptación Proactiva

> **Prerequisito**: Sprint 4 finalizado.
> **Uso**: Pasale cada uno de los chats a Codex secuencialmente.

---

## 🛠 CHAT 1: Modelos Reactivos (Beta-Bernoulli y Risk Forecast)
**Cuándo**: AHORA (inicio del sprint 5).
**Modelo recomendado**: Claude Sonnet 4.7 (Thinking) o GPT-4o (Codex).
**Contexto para Codex**: Pegá esto en el chat.

```text
Codex, iniciamos el Sprint 5 del pipeline V5: Adaptación Proactiva.

1. Leé la spec MAESTRA en `docs/architecture/PIPELINE_V5_SPEC.md` (sección 5 y Adaptive loops).
2. Leé `docs/plans/pipeline-v5-sprint5/PLAN.md` (tareas 1 y 2).
3. Hacé uso de los objetos `HabitState` que implementaste previemente del sprint 4.

Tus objetivos (Todo en Zod y TypeScript estricto):
1. **Crear `src/lib/domain/adherence-model.ts`:**
   - Crear una función o clase `calculateAdherence` que reciba días de tracking (`1` success, `0` fail).
   - Aplicar una fórmula hiper-sencilla base de Beta-Bernoulli:
     `alpha` = priors_success + éxitos.
     `beta` = priors_fail + fallos. 
     `mean_prob` = alpha / (alpha + beta).
   - Generar un output predecible sobre la tendencia (estable / decayendo).

2. **Crear `src/lib/domain/risk-forecast.ts`:**
   - La función `forecastRisk(adherenceScore, habitState)` devuelve: `SAFE`, `AT_RISK` o `CRITICAL`.
   - Si the `mean_prob` es alta (>0.7) y está activo por semanas es `SAFE`. 
   - Si `mean_prob` bajó fuerte en los últimos 3 días, es `AT_RISK`.
   - Si hay una inactividad abismal (>5 fallos directos), es `CRITICAL`.

Esto será el cerebro analítico que dice si alguien requiere intervención en su rutina.
```

### ✅ Checklist — Qué verificar después del CHAT 1

| # | Qué chequear | Cómo |
|---|-------------|------|
| 1 | `adherence-model.ts` creado | Existe un cálculo de `alpha`, `beta`, `mean_prob`. |
| 2 | `risk-forecast.ts` creado | Existe función devolviendo `SAFE`/`AT_RISK`/`CRITICAL`. |
| 3 | Typechecking local pasa | `npm run typecheck` en subcarpeta V5 |

---

## 🛠 CHAT 2: Fase 12 (Adaptive Loop)
**Cuándo**: Pasaste el Chat 1
**Acción**: Copiá esto en la respuesta consecuente de Codex.

```text
Continuamos Sprint 5, pasamos a la TAREA 3.

1. Ya tenés la matemática de Adherencia y Riesgo. Ahora vamos a vincularlo a una función pipeline operativa, la Fase 12.
2. Leé los contratos en `src/lib/pipeline/v5/phase-io-v5.ts` (si es que la fase 12 `adapt` no está ahí, sumala como async input/output).

Crear `src/lib/pipeline/v5/adaptive.ts` (Fase 12):
- Función `generateAdaptiveResponse(input: AdaptiveInput)` que toma un plan existente, logs de actividad e invoca al `Risk Forecast`.
- Según el tipo de riesgo (`SAFE`, `AT_RISK`, `CRITICAL`), determina el modo de adaptación necesario:
   - `SAFE` u overlap muy banal -> `ABSORB` (Usa el solver pero mueve poco tiempo/casi nada, y usa la slack policy sin miedo).
   - `AT_RISK` -> `PARTIAL_REPAIR` (El recomendador propone relajar el constraint y sugerir usar el Minimum Viable Habit, ej: si debía ir 1h al gym, el adapt sugerirá que con 15 minutos vale como success para no perder state machine).
   - `CRITICAL` -> `REBASE` (Requiere gatillar las Fases 4 en adelante enteramente porque el schedule de la vida del usuario no era realista).

Asegurate de que esta Fase 12 sirva los payloads necesarios a `runner.ts` para que sepa cómo relanzar el schedule de la semana.
```

### ✅ Checklist — Qué verificar después del CHAT 2

| # | Qué chequear | Cómo |
|---|-------------|------|
| 1 | `adaptive.ts` resuelve en los modos core | Retorna `ABSORB`, `PARTIAL_REPAIR` o `REBASE`. |
| 2 | El modo partial repair usa MVH. | Recomienda acortar el schedule drásticamente como contingencia (Minimum Viable Habit). |

---

## 🛠 CHAT 3: Tests del Circuito de Aprendizaje (Tests Proactivos)
**Cuándo**: Pasaste el Chat 2.
**Acción**: En Codex, pegá esto.

```text
Última tarea del Sprint 5. Integremos `adaptive.ts` con tests empíricos en Vitest.

Crear `tests/pipeline-v5/adaptive.test.ts`:
Planteá 3 escenarios principales mockeando las etapas previas: 
1. **Healthy Streak**: Simular 6 completados (1s) y 1 fallo (0). `risk-forecast` debe arrojar `SAFE`. `adaptive` decide `ABSORB`.
2. **Burnout Riesgoso**: Simular 3 fallos seguidos recientes y promedio en caída. Forecast debe ser `AT_RISK`. `adaptive` decide `PARTIAL_REPAIR`, habilitando la métrica del plan para Minimum Viable Habit (MVH).
3. **Ghosting Completo**: 7 días seguidos de 0 fallos absolutos ignorando al sistema. El Forecast dicta `CRITICAL` y the adaptive response genera una orden de `REBASE`.

Corrobora que todas corran exitosamente y no rompan el schema.
```

### 🏁 Checklist Final del Sprint 5

| # | Gate | Comando |
|---|------|---------|
| 1 | Typecheck global para V5 | `npm run typecheck` en tus componentes V5 ✅ |
| 2 | Tests de adaptabilidad V5 | `npm run test tests/pipeline-v5/adaptive.test.ts` ✅ |
| 3 | Aislamiento | `runner.test.ts` de Sprint 3 no debe haberse estropeado en cadena. |
