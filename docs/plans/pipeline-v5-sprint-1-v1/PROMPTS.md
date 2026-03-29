# Prompts de Implementación — Sprint 1

> **Uso recomendado**: Copiar y pegar cada prompt en un CHAT NUEVO. No mezcles etapas en el mismo chat para evitar que el modelo alucine, consuma excesivos tokens y pierda el hilo.

---

## 🛠 CHAT 1: Fundamentos (Tipos y Clasificador)
**Cuándo**: AHORA (es el inicio del sprint).
**Modelo recomendado**: Gemini 3.1 Pro (Low) — *Es una transcripción de spec con lógica simple (regex).*
**Acción**: Abrí un chat nuevo y pegá esto:

```text
Quiero implementar las TAREAS 1, 2, 3 y 4 del Sprint 1 del pipeline v5.

1. Leé la spec en `docs/architecture/PIPELINE_V5_SPEC.md`
2. Leé el plan del sprint en `docs/plans/pipeline-v5-sprint-1-v1/PLAN.md`

Tus objetivos (escribí el código completo en Zod + TypeScript):
- Crear `src/lib/domain/goal-taxonomy.ts` (GoalType, GoalSignals, GoalClassification)
- Crear `src/lib/domain/plan-item.ts` (PlanItem union type con los 5 kinds)
- Crear `src/lib/domain/plan-patterns.ts` (Mapping de GoalType a patrones recomendados)
- Crear `src/lib/pipeline/v5/classify.ts` (Función classifyGoal(rawText) usando regex básicas y mapeos según la spec).

Recordá:
- Usá Zod `.strict()` para todo.
- Este código NO debe tocar ni importar de `src/lib/pipeline/runner.ts` ni ningún otro código de la v1. Todo es nuevo.
```

### ✅ Checklist — Qué verificar después del CHAT 1

| # | Qué chequear | Cómo |
|---|-------------|------|
| 1 | Existen los 4 archivos nuevos | Verificar que existan: `src/lib/domain/goal-taxonomy.ts`, `src/lib/domain/plan-item.ts`, `src/lib/domain/plan-patterns.ts`, `src/lib/pipeline/v5/classify.ts` |
| 2 | Compila sin errores | Correr `npm run typecheck` — debe pasar ✅ |
| 3 | GoalType tiene 7 valores | Abrir `goal-taxonomy.ts` → buscar el enum/union con: `RECURRENT_HABIT`, `SKILL_ACQUISITION`, `FINITE_PROJECT`, `QUANT_TARGET_TRACKING`, `IDENTITY_EXPLORATION`, `RELATIONAL_EMOTIONAL`, `HIGH_UNCERTAINTY_TRANSFORM` |
| 4 | GoalSignals tiene 7 booleanos | En el mismo archivo: `isRecurring`, `hasDeliverable`, `hasNumericTarget`, `requiresSkillProgression`, `dependsOnThirdParties`, `isOpenEnded`, `isRelational` |
| 5 | PlanItem tiene 5 kinds | Abrir `plan-item.ts` → buscar el union con: `time_event`, `flex_task`, `milestone`, `metric`, `trigger_rule` |
| 6 | Schemas usan Zod `.strict()` | Buscar `.strict()` en ambos archivos — debe aparecer en cada schema |
| 7 | Clasificador funciona con texto | Abrir `classify.ts` → buscar `export function classifyGoal(rawText: string)` → debería retornar un `GoalClassification` |
| 8 | Ningún import de v1 | Buscar en los 4 archivos que NO importan de `runner.ts`, `plan-builder.ts`, ni `plan-simulator.ts` |
| 9 | Pipeline v1 sigue OK | Correr `npm run build` — debe pasar igual que antes ✅ |

---

## 🛠 CHAT 2: Domain Knowledge Cards (Generación estructurada)
**Cuándo**: Luego de que el CHAT 1 pase toda la checklist.
**Modelo recomendado**: Claude Sonnet 4.6 (Thinking) — *Se necesita inventar datos plausibles de dominio (running, guitarra, idiomas).*
**Acción**: Abrí un **CHAT NUEVO** y pegá esto:

```text
Acabamos de implementar los tipos base del pipeline v5 en `src/lib/domain/`. Ahora quiero implementar las TAREAS 5 y 6 del Sprint 1.

1. Leé la spec en `docs/architecture/PIPELINE_V5_SPEC.md`
2. Leé los tipos en `src/lib/domain/goal-taxonomy.ts` y `src/lib/domain/plan-item.ts` para entender las restricciones.

Tus objetivos:
- Definir la estructura `DomainKnowledgeCard` en `src/lib/domain/domain-knowledge/bank.ts`.
- Crear las cartas estáticas en `src/lib/domain/domain-knowledge/cards/`:
  a. `running.ts` (niveles, regla del 10%, sesiones tipo)
  b. `guitarra.ts` (práctica distribuida, niveles, sesiones tipo)
  c. `idiomas.ts` (CEFR, spaced repetition)
- Crear la función factory/getter en `src/lib/domain/domain-knowledge/bank.ts` para buscarlas por dominio.

Recordá inventar datos útiles y rigurosos para las cards (fuentes A/B, severity warnings "BLOCKER" vs "WARNING").
```

### ✅ Checklist — Qué verificar después del CHAT 2

| # | Qué chequear | Cómo |
|---|-------------|------|
| 1 | Existen los 4 archivos nuevos | `src/lib/domain/domain-knowledge/bank.ts`, `cards/running.ts`, `cards/guitarra.ts`, `cards/idiomas.ts` |
| 2 | Compila sin errores | `npm run typecheck` ✅ |
| 3 | Interfaz `DomainKnowledgeCard` existe | Abrir `bank.ts` → debe tener la interfaz con: `domainLabel`, `goalTypeCompatibility`, `tasks`, `metrics`, `progression`, `constraints`, `sources` |
| 4 | Cada card tiene `sources` con `EvidenceGrade` | Abrir cada card → buscar `evidence:` → debe ser tipo `'A_SYSTEMATIC_REVIEW'`, `'B_PEER_REVIEWED'`, etc. |
| 5 | Cada card tiene `constraints` con `severity` | Buscar `severity:` → debe ser `'INFO'`, `'WARNING'`, o `'BLOCKER'` |
| 6 | Running tiene la regla del 10% | Abrir `running.ts` → buscar algún constraint que mencione "no aumentar más del 10% semanal" |
| 7 | Guitarra tiene práctica distribuida | Abrir `guitarra.ts` → buscar que recomiende sesiones cortas frecuentes, no pocas sesiones largas |
| 8 | Idiomas tiene niveles CEFR | Abrir `idiomas.ts` → buscar A1, A2, B1, B2, C1, C2 en la progresión |
| 9 | `findCard("running")` retorna card | En `bank.ts` → debe existir `export function findCard(domainLabel: string): DomainKnowledgeCard | null` |
| 10 | `findCard("blablabla")` retorna null | La función no debe explotar con dominios desconocidos |
| 11 | Los tipos importados de `goal-taxonomy.ts` matchean | No hay errores de tipo entre cards y la interfaz `DomainKnowledgeCard` |

---

## 🛠 CHAT 3: Quality Gates (Testing)
**Cuándo**: Luego de que el CHAT 2 pase toda la checklist.
**Modelo recomendado**: Claude Sonnet 4.6 (Thinking) — *Es ideal para pensar edge cases (falsos positivos de regex, etc).*
**Acción**: Abrí un **CHAT NUEVO** y pegá esto:

```text
Implementamos todo el código fuente del Sprint 1 del pipeline v5 (`src/lib/domain/` y `src/lib/pipeline/v5/classify.ts`). 
Ahora nos toca la TAREA 7: Tests exhaustivos.

Tu objetivo:
1. Crear `tests/pipeline-v5/classify.test.ts`
2. Escribir pruebas unitarias (Vitest) para verificar:
   - Que los regex patterns del clasificador extraigan las `GoalSignals` correctas.
   - Testear al menos 20 frases de ejemplo diferentes (ej: "correr 5km", "aprender a programar", "mejorar mi relación con mi mamá", "ahorrar 200usd").
   - Verificar que los Zod schemas rechazan inputs mal formados para los `PlanItem`.
   - Verificar que `DomainKnowledgeBank` retorna las cards o null (fuzzing).

Las pruebas deben probar exhaustivamente la capacidad del clasificador estático que creamos. Mostrame qué pasa con las ambigüedades.
```

### ✅ Checklist — Qué verificar después del CHAT 3

| # | Qué chequear | Cómo |
|---|-------------|------|
| 1 | Existe el archivo de tests | `tests/pipeline-v5/classify.test.ts` |
| 2 | Tests pasan | Correr `npm run test` → todos ✅ |
| 3 | Hay ≥20 frases de ejemplo | Abrir el test → contar los `it()` o los casos en la tabla de test → deben ser ≥20 |
| 4 | Cubre los 7 GoalTypes | Buscar que haya al menos 1 frase de ejemplo que mapee a cada uno de los 7 tipos |
| 5 | Prueba ambigüedades | Debe haber tests para frases ambiguas como "quiero correr una maratón" (¿SKILL o HABIT?) o "quiero ser más saludable" (¿HABIT o TRANSFORM?) |
| 6 | Prueba Zod rechaza inputs malos | Buscar tests que pasen objetos con campos faltantes o tipos incorrectos y verifiquen que Zod lanza error |
| 7 | Prueba DomainKnowledgeBank | Buscar tests para `findCard("running")` → card, `findCard("xyz")` → null |
| 8 | Tests v1 siguen pasando | Correr `npm run test` → los tests existentes que NO son de v5 también pasan |

---

## 🏁 Checklist Final del Sprint 1

Cuando los 3 chats estén completos, verificar:

| # | Gate | Comando |
|---|------|---------|
| 1 | Typecheck | `npm run typecheck` ✅ |
| 2 | Tests | `npm run test` ✅ |
| 3 | Build | `npm run build` ✅ |
| 4 | Pipeline v1 funciona | La app en `localhost:3000` sigue creando planes normalmente |
| 5 | 0 archivos v1 modificados | `git diff --name-only` muestra SOLO archivos nuevos en `src/lib/domain/`, `src/lib/pipeline/v5/` y `tests/pipeline-v5/` |
