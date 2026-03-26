# Tarea para Codex: Implementar Domain Knowledge Card Generator

> **Spec de referencia**: `docs/architecture/PIPELINE_V5_SPEC.md` (sección 2.3)
> **Pieza faltante**: `src/lib/domain/domain-knowledge/generator.ts` — único gap pendiente del pipeline V5.

---

## Contexto

El pipeline V5 tiene un sistema de **Domain Knowledge Cards** que provee información estructurada sobre dominios (running, guitarra, idiomas, etc.). Hoy solo existen 3 cards estáticas en `src/lib/domain/domain-knowledge/cards/`. Cuando un usuario crea un objetivo en un dominio sin card (ej: "aprender a invertir", "perder 10kg", "mudarme a otro país"), el pipeline no tiene domain knowledge y las fases de Strategy y Template Builder operan a ciegas.

Falta implementar el **generador dinámico** que crea una `DomainKnowledgeCard` vía LLM cuando no existe una card estática para el dominio solicitado.

---

## Archivos que DEBES leer antes de escribir código

1. `src/lib/domain/domain-knowledge/bank.ts` — Schema `DomainKnowledgeCardSchema`, función `registerCard()`, tipo `DomainKnowledgeCard`
2. `src/lib/domain/domain-knowledge/cards/running.ts` — Ejemplo real de card estática (úsalo como gold standard de estructura y nivel de detalle)
3. `src/lib/domain/goal-taxonomy.ts` — `GoalType`, `GoalSignals`, `GoalClassification`
4. `src/lib/runtime/types.ts` — `AgentRuntime` interface (método `chat()` para llamar al LLM)
5. `src/lib/pipeline/v5/strategy.ts` — Ejemplo de cómo las fases del pipeline usan `AgentRuntime` para llamar al LLM

---

## Qué implementar

### Archivo: `src/lib/domain/domain-knowledge/generator.ts`

Crear una función `generateDomainCard` con esta firma:

```typescript
import type { AgentRuntime } from '../../runtime/types';
import type { GoalClassification } from '../goal-taxonomy';
import type { DomainKnowledgeCard } from './bank';

export interface GenerateCardInput {
  /** El texto original del objetivo del usuario, ej: "Quiero aprender a invertir en bolsa" */
  goalText: string;
  /** La clasificación ya computada por la fase 1 (CLASSIFY) */
  classification: GoalClassification;
  /** Etiqueta de dominio inferida, ej: "inversion", "nutricion", "mudanza" */
  domainLabel: string;
}

export async function generateDomainCard(
  runtime: AgentRuntime,
  input: GenerateCardInput,
): Promise<DomainKnowledgeCard>;
```

### Comportamiento esperado

1. **Construir un prompt** que le pida al LLM generar una DomainKnowledgeCard en JSON para el dominio dado. El prompt debe:
   - Incluir el schema esperado (campos, tipos, restricciones)
   - Incluir `goalText` y `classification.goalType` como contexto
   - Pedir explícitamente que genere: tasks (mínimo 3), metrics (mínimo 1), progression (si aplica), constraints (con severidad), y sources con `evidence: 'D_HEURISTIC'` o `'E_UNKNOWN'` (porque el LLM no puede garantizar evidence A/B/C)
   - Pedir labels en español argentino (es-AR) y sin jerga técnica (abuela-proof)
   - Incluir un `equivalenceGroupId` coherente en cada task

2. **Llamar al LLM** usando `runtime.chat(messages)` (ver cómo lo hace `strategy.ts`).

3. **Parsear la respuesta JSON** del LLM. Extraer el bloque JSON del content (puede venir envuelto en markdown ```json ... ```).

4. **Validar con Zod** usando `DomainKnowledgeCardSchema.parse(parsed)`. Si falla la validación, NO reintentar — lanzar un error descriptivo.

5. **Forzar `generationMeta`** a `{ method: 'LLM_ONLY', confidence: 0.6 }` independientemente de lo que devuelva el LLM (el LLM no puede auto-evaluar su confianza).

6. **Forzar `domainLabel`** al valor de `input.domainLabel` (normalizado: lowercase, trim, sin espacios → guiones).

7. **Registrar la card** en el banco llamando a `registerCard(card)` de `bank.ts` antes de retornarla.

### Constraints de implementación

- El prompt al LLM debe ser **corto** (~400 tokens de input). El pipeline V5 tiene budget de ~3,100 tokens totales; este generador se invoca opcionalmente y no debe exceder ~500 tokens de respuesta.
- **NO usar RAG** en esta primera versión. El `generationMeta.method` será `'LLM_ONLY'`. RAG se puede agregar después.
- **NO** hardcodear cards dentro del generador. Si el dominio ya tiene card estática, el caller (strategy.ts o runner.ts) NO debería invocar el generador.
- **Zod `.strict()`** ya está en `DomainKnowledgeCardSchema` — no necesitas agregarlo, pero el JSON del LLM debe cumplirlo exactamente (sin campos extra).
- Importar tipos con `import type` donde sea posible.

---

## Tests: `tests/pipeline-v5/domain-knowledge-generator.test.ts`

Crear tests con Vitest:

### Test 1: genera card válida para dominio desconocido
- Mockear `AgentRuntime` con un `chat()` que devuelva un JSON válido de DomainKnowledgeCard para dominio "nutricion"
- Verificar que `generateDomainCard()` retorna un objeto que pasa `DomainKnowledgeCardSchema.parse()`
- Verificar que `generationMeta.method === 'LLM_ONLY'` y `confidence === 0.6`
- Verificar que `domainLabel` sea el normalizado del input

### Test 2: fuerza domainLabel y generationMeta del input (ignora lo que diga el LLM)
- Mockear `chat()` con un JSON que tenga `domainLabel: 'WRONG'` y `generationMeta: { method: 'RAG', confidence: 0.99 }`
- Verificar que el output tenga el `domainLabel` del input y `{ method: 'LLM_ONLY', confidence: 0.6 }`

### Test 3: lanza error si el LLM devuelve JSON inválido
- Mockear `chat()` con JSON al que le falte el campo `tasks`
- Verificar que `generateDomainCard()` lanza `ZodError` o un error descriptivo

### Test 4: parsea JSON envuelto en markdown code block
- Mockear `chat()` con content: `` ```json\n{...card válida...}\n``` ``
- Verificar que se parsea correctamente

### Convenciones de test
- Usar `describe('generateDomainCard', () => { ... })`
- Los mocks de `AgentRuntime` deben devolver `{ content: '...', usage: { promptTokens: 0, completionTokens: 0 } }`
- NO hacer llamadas reales al LLM

---

## Integración con el pipeline (NO implementar, solo documentar)

> **Nota**: Esta sección es informativa. NO modifiques el runner ni strategy.ts en esta tarea. La integración se hará en una tarea posterior.

El flujo futuro será:
1. Fase 1 (classify) produce `GoalClassification` con un `domainLabel` inferido
2. Antes de fase 4 (strategy), el runner consulta `getKnowledgeCard(domainLabel)`
3. Si retorna `undefined`, llama a `generateDomainCard(runtime, { goalText, classification, domainLabel })`
4. La card generada queda registrada en el banco y se pasa a strategy + template-builder

---

## Criterios de aceptación

- [ ] `src/lib/domain/domain-knowledge/generator.ts` existe y exporta `generateDomainCard`
- [ ] `tests/pipeline-v5/domain-knowledge-generator.test.ts` existe con los 4 tests
- [ ] `npm run test` pasa en verde (incluyendo los tests nuevos)
- [ ] `npm run typecheck` pasa sin errores
- [ ] El archivo no importa nada de Electron, SQLite, ni módulos deprecados
- [ ] Todos los schemas usan Zod `.strict()` si definen schemas nuevos
- [ ] Strings de prompt en español argentino, abuela-proof
