# Tarea para Codex: Integrar el Domain Knowledge Card Generator en el Runner V5

> **Prerequisito completado**: `src/lib/domain/domain-knowledge/generator.ts` ya existe, exporta `generateDomainCard`, y tiene 4 tests en verde.
> **Objetivo**: Cuando no exista una card estática para el dominio del usuario, el runner debe generar una dinámicamente via LLM antes de pasar a la fase de Strategy.

---

## Archivos que DEBES leer antes de escribir código

1. `src/lib/pipeline/v5/runner.ts` — El runner completo. Foco en:
   - `resolveDomainCard()` (función libre, ~línea 177-198)
   - `runClassifyPhase()` (~línea 377-386) donde se llama a `resolveDomainCard()`
   - `FlowRunnerV5Config` para ver que ya tiene `domainHint` y `runtime`
2. `src/lib/domain/domain-knowledge/generator.ts` — La función `generateDomainCard` y su interfaz `GenerateCardInput`
3. `src/lib/pipeline/v5/classify.ts` — Para ver qué devuelve `ClassifyOutput` (necesitás `goalType`, `risk`, `extractedSignals`)

---

## Cambio 1: Modificar `resolveDomainCard()` en `runner.ts`

La función actual (líneas 177-198) tiene esta lógica:
```
1. Si hay domainHint → buscar por key exacta
2. Regex hardcodeados (guitarra, idiomas, running)
3. Fallback: getCardsByGoalType → primera compatible
4. Si nada matchea → retorna undefined
```

**Nuevo comportamiento**: agregar un paso final que llame al generador si todo lo anterior retornó `undefined`.

### Cambios concretos:

1. **Agregar import** al inicio de `runner.ts`:
```typescript
import { generateDomainCard } from '../../domain/domain-knowledge/generator';
```

2. **Cambiar la firma** de `resolveDomainCard` para recibir también el `runtime`:
```typescript
async function resolveDomainCard(
  config: FlowRunnerV5Config,
  classification: ClassifyOutput,
): Promise<DomainKnowledgeCard | undefined>
```
La firma ya recibe `config` que contiene `config.runtime`, así que NO necesitás cambiar la firma. Solo modificar el cuerpo.

3. **Agregar al final de `resolveDomainCard()`**, después del fallback de `getCardsByGoalType` y antes del `return` implícito `undefined`:

```typescript
// Si no hay card estática ni compatible, generar una dinámicamente
const domainLabel = config.domainHint ?? inferDomainLabel(config.text);
if (domainLabel) {
  try {
    return await generateDomainCard(config.runtime, {
      goalText: config.text,
      classification,
      domainLabel,
    });
  } catch {
    // Si la generación falla, el pipeline sigue sin card (degradación elegante)
    return undefined;
  }
}
```

4. **Crear una función auxiliar `inferDomainLabel()`** en `runner.ts` (función libre, no método de clase):

```typescript
function inferDomainLabel(text: string): string {
  // Extraer las primeras 3-4 palabras significativas del objetivo como label candidato
  const words = text
    .toLowerCase()
    .replace(/[^a-záéíóúñü\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 3);
  return words.join('-') || '';
}

const STOP_WORDS = new Set([
  'quiero', 'quisiera', 'necesito', 'tengo', 'poder', 'como',
  'para', 'por', 'con', 'sin', 'una', 'uno', 'unos', 'unas',
  'los', 'las', 'del', 'que', 'mas', 'muy', 'pero', 'este',
  'esta', 'esto', 'eso', 'esa', 'ese', 'ser', 'estar', 'hacer',
  'aprender', 'lograr', 'mejorar', 'empezar', 'comenzar',
]);
```

### Lógica final de `resolveDomainCard()` (pseudocódigo):
```
1. domainHint → getKnowledgeCard(hint) → si existe, retornar
2. Regex hardcodeados → si matchea, retornar
3. getCardsByGoalType → si hay alguna, retornar la primera
4. [NUEVO] inferDomainLabel + generateDomainCard → try/catch → retornar o undefined
```

---

## Cambio 2: NO tocar `runClassifyPhase()`

La llamada a `resolveDomainCard()` ya está en `runClassifyPhase()` línea 382:
```typescript
this.context.domainCard = await resolveDomainCard(this.context.config, output);
```
Esta línea NO necesita cambios porque `resolveDomainCard` ya recibe `config` (que contiene `runtime`) y `classification`.

---

## Cambio 3: Logging via tracker (opcional pero recomendado)

Si el generador se invoca, emitir un `onProgress` para que la UI sepa que se está generando knowledge. Para esto, `resolveDomainCard` necesitaría recibir el tracker. **Sin embargo**, para mantener el cambio mínimo, NO cambies la firma de `resolveDomainCard`. El logging se puede agregar después.

---

## Tests: `tests/pipeline-v5/generator-integration.test.ts`

### Test 1: el runner genera card dinámica cuando no hay card estática
- Crear un `FlowRunnerV5` con `text: "Quiero aprender a invertir en bolsa"` (no matchea ninguna card estática)
- Mockear `AgentRuntime.chat()` para que:
  - En la primera llamada (requirements) devuelva JSON de requirements
  - En la llamada del generador devuelva un JSON válido de DomainKnowledgeCard para "inversion"
  - En las demás llamadas (strategy, etc.) devuelva JSON válido correspondiente
- Ejecutar solo `executePhase('classify')`
- Verificar que `context.domainCard` NO sea undefined
- Verificar que `context.domainCard.generationMeta.method === 'LLM_ONLY'`

### Test 2: el runner sigue funcionando si el generador falla
- Crear un `FlowRunnerV5` con `text: "Quiero algo muy raro e inusual"`
- Mockear `AgentRuntime.chat()` para que lance un `Error` cuando se llame para generar la card
- Ejecutar `executePhase('classify')`
- Verificar que `context.domainCard` sea `undefined` (degradación elegante, NO throw)
- Verificar que el pipeline puede seguir ejecutando `strategy` sin card (ya lo soporta)

### Test 3: si existe card estática, NO se invoca el generador
- Crear un `FlowRunnerV5` con `text: "Quiero empezar a correr"` (matchea regex de running)
- Verificar que `context.domainCard?.domainLabel === 'running'`
- Verificar que `context.domainCard?.generationMeta.method === 'MANUAL'` (no 'LLM_ONLY')

### Convenciones de test
- Usar describe/it de Vitest
- Mock de `AgentRuntime` similar al pattern en `tests/pipeline-v5/domain-knowledge-generator.test.ts`
- NO hacer llamadas reales al LLM

---

## Criterios de aceptación

- [ ] `resolveDomainCard()` en `runner.ts` tiene el paso 4 de generación dinámica
- [ ] Import de `generateDomainCard` agregado en `runner.ts`
- [ ] `inferDomainLabel()` existe como función libre en `runner.ts`
- [ ] El generador se llama dentro de un `try/catch` (nunca rompe el pipeline)
- [ ] `tests/pipeline-v5/generator-integration.test.ts` existe con 3 tests
- [ ] `npm run test` pasa en verde
- [ ] `npm run typecheck` pasa sin errores
- [ ] NO se modificaron archivos fuera de `runner.ts` y el nuevo test (salvo imports)
- [ ] NO se rompieron tests existentes del pipeline V5
