# Pipeline v5 — Sprint 5: Adaptación Proactiva

> **Status**: `implemented`
> **Spec**: `docs/architecture/PIPELINE_V5_SPEC.md` (sección 5)
> **Depends on**: Sprint 4 completo (Robustez y capas de plan).
> **Scope**: Evaluar la adherencia (Beta-Bernoulli), generar Risk Forecast, e implementar los 3 modos de adaptación proactivos.
> **NO incluye**: Dashboard UX / Dashboards visuales.

---

## Objetivo

Convertir a LAP en un sistema que reacciona a los tropiezos **antes** de que el usuario abandone, determinando la tendencia real a través de modelos estadísticos, y ajustando automáticamente el plan mediante 3 niveles de severidad en lugar de tirar todo el plan a la basura y re-armarlo de cero.

---

## Conceptos Clave

### Adherencia (Beta-Bernoulli)
- Cada día de ejecución es un ensayo: Éxito (`1`) o Fallo (`0`).
- No medimos un ratio plano. Utilizamos distribución estadística (`alpha`, `beta`) para entender que "faltar 1 de 2 días" no es igual de grave que "faltar 10 de 20".

### Risk Forecast
- Con base en la adherencia calculada y `HabitState.level`, determinar si el hábito está en riesgo de abandono.
- Riesgos: `SAFE`, `AT_RISK`, `CRITICAL`.

### Modos de Adaptación (Adaptive Loop)
1. **ABSORB**: El risk está bien, hubo un fallo menor. El sistema simplemente usa la `SlackPolicy` para reacomodar un buffer cercano. Nada grave (0-2 movimientos/semana).
2. **PARTIAL_REPAIR**: El riesgo es alto de cara a 1 ó 2 semanas. El solver MILP se corre de nuevo relajando `soft_constraints` (baja requerimiento temporal) pero conservando el esqueleto general a 12 semanas. Puede haber fallback al Minimum Viable Habit (MVH).
3. **REBASE**: El plan original demostró ser incompatible. El usuario modificó drásticamente restricciones o pasaron muchas semanas inactivas. Se genera un reseteo de la `Fase 4 (Strategy)` completa.

---

## Tareas

### 1. Modelo Beta-Bernoulli de Adherencia
**Archivo**: `src/lib/domain/adherence-model.ts`
Implementar lógica estadística para inferir si una progresión es positiva o negativa.
- Input: Registro histórico del hábito y eventos (Success / Fail).
- Output: Alpha, Beta, Mean adherence prob., Trend.

### 2. Generador de Risk Forecast
**Archivo**: `src/lib/domain/risk-forecast.ts`
- Clasifica al usuario de forma reactiva a su estado. 
- Input: `AdherenceModel` metrics + `HabitState`.
- Determina uno de los tres estados: `SAFE`, `AT_RISK`, `CRITICAL`.

### 3. Fase 12: Adaptive Loop (Lanzador)
**Archivo**: `src/lib/pipeline/v5/adaptive.ts`
- Módulo post-planificación que recibe los `Risk Forecast` del usuario a mitad de la semana y decide ejecutar (y despachar) uno de los tres modos: `ABSORB`, `PARTIAL_REPAIR` o `REBASE`.
- Emite un payload a consumir que le dice al orquestador qué componentes invocar para parchear/ajustar.

### 4. Tests Proactivos
**Archivo**: `tests/pipeline-v5/adaptive.test.ts`
Simular un escenario de fallos seguidos (baja el Alpha en Bernoulli, salta forecast `CRITICAL`) y verificar que la Fase 12 sugiere un `PARTIAL_REPAIR` de contingencia como el *Minimum Viable Habit*.

---

## Gates de calidad

- [x] `npm run typecheck` sin errores.
- [x] `npm run test tests/pipeline-v5/adaptive.test.ts` demuestra que el sistema "se da cuenta" si venís fallando durante la misma semana.
- [x] Todo sigue encapsulado en el ecosistema de V5, `index.ts` o legacy v1 intactos.
