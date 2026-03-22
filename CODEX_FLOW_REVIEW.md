# Prompt de revision rigurosa del flujo de creacion de plan (para Codex)

## Contexto del proyecto

LAP es un planificador de vida personal. Tiene un flujo de 11 pasos donde el usuario ingresa objetivos y el sistema genera un plan estrategico personalizado. El flujo es: gate → objectives → intake → strategy → reality-check → simulation → presentation → calendar → topdown → activation → done.

El sistema usa LLM en 2 puntos opcionales (intake agent y simulation review) con fallback deterministico si el LLM falla o no esta configurado.

## Tu tarea

Vas a hacer una revision exhaustiva y critica de todo el sistema de creacion de plan. Tu objetivo es encontrar debilidades, gaps logicos, prompts mejorables, heuristicas fragiles y oportunidades de mejora. Se constructivo pero implacable.

## Archivos a leer

Lee estos archivos completos antes de empezar el analisis:

**Motor principal:**
- `src/lib/flow/engine.ts` — Motor deterministico: analisis de objetivos, plan estrategico, reality check, simulacion, top-down, activacion
- `src/lib/flow/intake-agent.ts` — Agente LLM de intake + fallback heuristico + catalogo de campos
- `src/lib/flow/simulation-agent.ts` — Agente LLM de revision de simulacion

**Schemas y tipos:**
- `src/shared/schemas/flow.ts` — Todos los schemas Zod del flujo
- `src/shared/types/flow.ts` — Tipos del flujo
- `src/shared/types/flow-api.ts` — Tipos de API del flujo

**API routes:**
- `app/api/flow/session/route.ts` — Crear sesion
- `app/api/flow/session/[workflowId]/gate/route.ts`
- `app/api/flow/session/[workflowId]/objectives/route.ts`
- `app/api/flow/session/[workflowId]/intake/route.ts`
- `app/api/flow/session/[workflowId]/strategy/route.ts`
- `app/api/flow/session/[workflowId]/reality-check/route.ts`
- `app/api/flow/session/[workflowId]/simulation/route.ts`
- `app/api/flow/session/[workflowId]/presentation/route.ts`
- `app/api/flow/session/[workflowId]/presentation/feedback/route.ts`
- `app/api/flow/session/[workflowId]/calendar/route.ts`
- `app/api/flow/session/[workflowId]/topdown/route.ts`
- `app/api/flow/session/[workflowId]/activate/route.ts`
- `app/api/flow/session/[workflowId]/resume/route.ts`

**Tests existentes:**
- `tests/flow-engine.test.ts`
- `tests/flow-intake-agent.test.ts`
- `tests/progress-seeding.test.ts`

**Cliente y UI:**
- `src/lib/client/flow-client.ts`
- `components/FlowPageContent.tsx`

## Areas de revision

### 1. Calidad de los prompts LLM

Hay 2 prompts LLM en el sistema. Evaluá cada uno con estos criterios:

**Prompt del intake agent** (`intake-agent.ts`, funcion `buildPlannerMessages`):
- ¿El system prompt es suficientemente claro y restrictivo?
- ¿Las reglas son completas o hay gaps que permitan respuestas problematicas?
- ¿El formato de respuesta esperado esta bien especificado?
- ¿Hay riesgo de que el LLM ignore restricciones (ej: devolver keys fuera del catalogo)?
- ¿El user message tiene la estructura optima? ¿Sobra o falta contexto?
- ¿El prompt maneja bien edge cases como: 1 solo objetivo vs 5 objetivos, objetivos vagos vs especificos, objetivos contradictorios?
- ¿La instruccion de "español rioplatense" es suficiente o necesita ejemplos?
- ¿Que pasa si el LLM devuelve JSON malformado, parcial, o envuelto en markdown?

**Prompt del simulation review** (`simulation-agent.ts`, funcion `generateSimulationReviewWithAgent`):
- ¿El system prompt define bien que se espera como output?
- ¿Hay riesgo de que el LLM genere texto generico/vacuo sin valor real?
- ¿La instruccion "no inventes capacidades magicas" es suficiente para evitar hallucinations?
- ¿El user message le da suficiente contexto para generar insights utiles?
- ¿Los campos `checkedAreas` y `extraFindings` van a tener valor real o van a ser relleno?
- ¿Tiene sentido pedir 3-6 checkedAreas si la simulacion deterministica ya es simple?

### 2. Heuristicas del motor deterministico

Evaluá la robustez y precision de cada heuristica:

**`analyzeObjectives`** — inferencia de categoria, esfuerzo, horizonte y horas:
- ¿Los regex de inferencia de categoria son suficientes? ¿Que objetivos clasificaria mal?
- ¿La inferencia de esfuerzo es razonable? ¿Hay goals comunes que clasificaria como "medio" cuando deberian ser "alto" o viceversa?
- ¿La inferencia de horizonte temporal tiene sentido? ¿Que pasa con "aprender a tocar guitarra" (sin timeframe)?
- ¿La logica de hoursPerWeek (10/5/3 por esfuerzo) es realista para personas normales?
- ¿Que pasa con objetivos en ingles u otro idioma?

**`buildStrategicPlanRefined`** — generacion de fases:
- ¿La logica de 1-5 fases basada en horizonMonths produce planes coherentes?
- ¿Los nombres de fases ("Base sostenible", "Constancia", etc.) tienen sentido para todos los tipos de objetivo?
- ¿La logica de paralelismo vs secuencia para multiples objetivos es correcta?
- ¿Los milestones generados son utiles o genericos?
- ¿Las metrics (2-3 por fase) son accionables?

**`resolveRealityCheck`** — validacion de factibilidad:
- ¿El umbral del 85% de horas disponibles es razonable?
- ¿Los ajustes (reduce_load: -2hs, extend_timeline: +2 meses) son cantidades razonables o arbitrarias?
- ¿Que pasa si el usuario tiene 2 horas disponibles y el plan pide 20? ¿El sistema lo maneja bien?
- ¿Puede el usuario quedar atrapado en un loop de reality-check sin poder avanzar?

**`runStrategicSimulation`** — simulacion:
- ¿La simulacion basada puramente en diferencia de horas es demasiado simplista?
- ¿Las 3 iteraciones FAIL→FAIL→WARN son realistas o son teatro?
- ¿Que valor agrega la simulacion si el reality-check ya valido la factibilidad?
- ¿Las checkedAreas hardcodeadas ("Carga semanal total", etc.) aportan algo?

**`buildTopDownState`** — desglose jerarquico:
- ¿Los samples generados son utiles para que el usuario entienda el plan?
- ¿Tiene sentido obligar a confirmar cada nivel?
- ¿Que pasa con planes muy cortos (1 mes) o muy largos (5 años)?

**`buildPlanEventsFromFlow`** — activacion:
- ¿Los eventos generados son viables para un calendario real?
- ¿Se respeta la grilla de disponibilidad correctamente?
- ¿Que pasa si la grilla tiene 0 slots disponibles?

### 3. Calidad del fallback de intake

- ¿La funcion `createFallbackIntakeBlocks` cubre bien los casos mas comunes?
- ¿Las funciones `needsGoalClarity`, `needsWorkContext`, etc. son precisas?
- ¿Hay escenarios donde el fallback hace preguntas irrelevantes?
- ¿Hay escenarios donde el fallback omite preguntas criticas?

### 4. Robustez del flujo completo

- ¿Que pasa si el usuario abandona a mitad del flujo y vuelve?
- ¿El sistema de checkpoints es confiable?
- ¿Hay estados invalidos posibles entre pasos?
- ¿Los SSE streams manejan errores correctamente?
- ¿Que pasa si una API route falla a mitad de un paso?

### 5. Realismo del plan generado

Simulá mentalmente estos escenarios y evaluá que tan util seria el plan resultante:

1. **Usuario simple**: "Quiero bajar de peso" (1 objetivo vago, sin timeframe)
2. **Usuario ambicioso**: "Cambiar de carrera a programacion, aprender ingles, correr una maraton, ahorrar para una casa" (4 objetivos, alta carga)
3. **Usuario con restricciones**: "Estudiar para el examen de abogacia" (1 objetivo, persona con hijos y trabajo full-time)
4. **Usuario con objetivos contradictorios**: "Trabajar 60 horas semanales y entrenar para un ironman"
5. **Usuario minimalista**: "Leer un libro por mes" (1 objetivo trivial)

Para cada escenario:
- ¿Que categoria, esfuerzo y horizonte inferiria `analyzeObjectives`?
- ¿Que preguntas de intake se harian?
- ¿Que plan estrategico se generaria?
- ¿El reality check detectaria problemas?
- ¿El plan final seria util o seria un calendario generico sin valor?

### 6. Cobertura de tests

- ¿Los tests existentes cubren los happy paths criticos?
- ¿Que edge cases no estan testeados?
- ¿Hay funciones importantes sin tests?
- ¿Los tests usan mocks realistas o excesivamente simples?

## Formato de entrega

Organizá tu feedback en estas secciones:

### CRITICO — Problemas que rompen o degradan severamente la experiencia
Para cada issue: descripcion del problema, ejemplo concreto, impacto, y sugerencia de fix.

### IMPORTANTE — Mejoras significativas que harian el plan mucho mejor
Para cada issue: que esta mal/debil, por que importa, y como mejorarlo.

### PROMPT ENGINEERING — Feedback especifico sobre los 2 prompts LLM
Para cada prompt: que funciona bien, que es debil, rewrite sugerido de las partes debiles.

### HEURISTICAS — Feedback sobre las reglas deterministicas
Para cada heuristica: precision estimada, edge cases que falla, sugerencia de mejora.

### TESTS — Gaps de cobertura
Lista de tests faltantes priorizados por impacto.

### ELIMINABLE — Cosas que se podrian sacar sin perder valor
Complejidad innecesaria, pasos redundantes, abstracciones que no se justifican.

## Reglas para tu revision

- Se especifico: "el regex de categoria no detecta 'natacion'" es mejor que "los regex podrian mejorar"
- Da ejemplos concretos de inputs que rompen o producen resultados malos
- No sugieras features nuevas; enfocate en mejorar lo que existe
- Si algo esta bien, decilo rapido y segui; no infles el feedback positivo
- Priorizá los issues por impacto real en el usuario final
- Considerá que el usuario target es una persona no-tecnica que quiere organizar su vida
- El sistema esta en español rioplatense (Argentina)
- Los prompts van a correr en modelos tipo GPT-4o, Claude, o modelos locales via Ollama
