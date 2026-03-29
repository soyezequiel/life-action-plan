# Fix Typecheck: Tests y Tmp Stale

> **Status**: `pending`
> **Errores**: 49 en 12 archivos (`npm run typecheck`)
> **Causa**: Schemas de producción evolucionaron (nuevos campos requeridos) pero los fixtures de tests y scripts tmp no se actualizaron. **Ningún error es del Sprint 1.**
> **NO incluye**: cambios en `app/api/`, `components/`, `src/lib/` de producción

---

## Diagnóstico por grupo

### Grupo A — SimNode fixtures incompletos (falta `actionLog`)
**Archivos**: `tests/user-agent.test.ts`, `tests/world-agent.test.ts`, `tests/simulation-propagation.test.ts`

`simNodeSchema` declaró `actionLog` como campo requerido con default `[]`.
Los helpers de factory `n()` en cada test no incluyen ese campo.

**Fix**: agregar `actionLog: []` al objeto retornado por cada helper factory de `SimNode`.

---

### Grupo B — RealityCheckResult fixtures incompletos (falta `selectedAdjustment`)
**Archivos**: `tests/simulation-orchestrator.test.ts`, `tests/simulation-tree-builder.test.ts`

`realityCheckResultSchema` agregó `selectedAdjustment` (default `'keep'`).
Los objetos literales `rc` / `reality` en los tests no lo incluyen.

**Fix**: agregar `selectedAdjustment: 'keep' as const` a cada objeto fixture `rc` / `reality`.

---

### Grupo C — Profile fixtures incompletos en simulation-tree-builder
**Archivo**: `tests/simulation-tree-builder.test.ts`

El tipo `Perfil` ahora requiere `version`, `planificacionConjunta`, `objetivos`, `estadoDinamico`.
El objeto `profile` en el test sólo define `participantes`.

**Fix**: Tipar el fixture como `any` explícitamente (el test valida comportamiento del árbol, no del perfil) usando `as any`. El perfil ya usa `as any` en `simulation-orchestrator.test.ts` — hacer lo mismo aquí.

---

### Grupo D — SimTree fixture incompleto (falta `persona`)
**Archivo**: `tests/simulation-propagation.test.ts`

`simTreeSchema` agregó campo `persona` (nullable, default null).
El helper factory `tree()` no lo incluye.

**Fix**: agregar `persona: null` al objeto retornado por el factory `tree()`.

---

### Grupo E — SimNode fixture incompleto (falta `actionLog`, propagation)
**Archivo**: `tests/simulation-propagation.test.ts`

El helper `node()` en este test también omite `actionLog`.
(Ya cubierto en Grupo A pero en archivo diferente.)

**Fix**: agregar `actionLog: []` al helper `node()`.

---

### Grupo F — Dashboard test: falta `exportSimulation` en LapAPI mock
**Archivo**: `tests/dashboard.interaction.test.tsx`

`LapAPI` en `src/shared/types/lap-api.ts` agregó método `exportSimulation`.
El stub `createLapClientStub()` no lo incluye en el objeto `plan`.

**Fix**: agregar `exportSimulation: vi.fn(async () => ({ success: true, data: '' }))` al objeto `plan` del stub.

---

### Grupo G — flow-engine.test.ts: null guard en `buildCalendarState`
**Archivo**: `tests/flow-engine.test.ts` (líneas 143–148)

`buildCalendarState` puede retornar `null` según su tipo. El test no hace null check.

**Fix**: agregar `expect(calendar).not.toBeNull()` antes de las assertions, o usar `calendar!` con non-null assertion. La opción más idiomática es un assertion de tipo: `if (!calendar) throw new Error('calendar is null')`.

---

### Grupo H — flow-page-content.test.tsx: falta `simulationTreeId` en state fixture
**Archivo**: `tests/flow-page-content.test.tsx` (línea 65)

`FlowState` ahora incluye `simulationTreeId`. El objeto fixture `state` usado en el test no lo declara.

**Fix**: agregar `simulationTreeId: null` al fixture de estado.

---

### Grupo I — Scripts tmp con imports rotos
**Archivos**: `tmp/debug-api.ts`, `tmp/debug-last-plan.ts`, `tmp/run-sim-local.ts`, `tmp/test-simulation-flow.ts`

Estos scripts son residuos de debugging manual. Tienen imports a módulos que no existen o cambiaron de ruta (`dotenv`, `src/lib/db`, rutas relativas rotas).

**Fix**: excluir el directorio `tmp/` del `tsconfig.typecheck.json`. Los scripts tmp no son parte del producto y nunca deben participar en el typecheck de CI.

---

## Tareas

### Tarea 1 — Excluir `tmp/` del typecheck
**Archivo**: `tsconfig.typecheck.json`
Agregar `"tmp"` al array `exclude`.
Esto elimina de golpe 13 errores (Grupo I).

### Tarea 2 — Corregir SimNode factories (Grupo A + E)
**Archivos**: `tests/user-agent.test.ts`, `tests/world-agent.test.ts`, `tests/simulation-propagation.test.ts`
Agregar `actionLog: []` a cada helper `n()` / `node()`.

### Tarea 3 — Corregir RealityCheckResult fixtures (Grupo B)
**Archivos**: `tests/simulation-orchestrator.test.ts`, `tests/simulation-tree-builder.test.ts`
Agregar `selectedAdjustment: 'keep' as const` a `rc` y `reality`.

### Tarea 4 — Corregir Profile fixture en tree-builder (Grupo C)
**Archivo**: `tests/simulation-tree-builder.test.ts`
Tipar `profile` como `as any` para que TypeScript no exija los campos adicionales de `Perfil`.

### Tarea 5 — Corregir SimTree factory (Grupo D)
**Archivo**: `tests/simulation-propagation.test.ts`
Agregar `persona: null` al helper `tree()`.

### Tarea 6 — Agregar `exportSimulation` al LapAPI stub (Grupo F)
**Archivo**: `tests/dashboard.interaction.test.tsx`
Agregar `exportSimulation: vi.fn(async () => ({ success: true, data: '' }))` dentro del objeto `plan`.

### Tarea 7 — Null guard en flow-engine calendar (Grupo G)
**Archivo**: `tests/flow-engine.test.ts`
Antes de las assertions en línea 143, agregar `if (!calendar) throw new Error('calendar null')`.

### Tarea 8 — Agregar `simulationTreeId` al fixture de FlowState (Grupo H)
**Archivo**: `tests/flow-page-content.test.tsx`
Leer el fixture del state en línea 65 y agregar `simulationTreeId: null`.

---

## Gates de calidad

- [ ] `npm run typecheck` sale con **0 errores**
- [ ] `npm run test` sigue pasando (no hay tests rotos)
- [ ] Pipeline v1 intacto (`app/api/` sin cambios)
- [ ] Sprint 1 tests siguen pasando (`tests/pipeline-v5/`)

---

## Lo que NO se toca

- `src/lib/` (producción, sin cambios)
- `app/api/` (sin cambios)
- `components/` (sin cambios)
- `src/shared/schemas/` (sin cambios — los schemas son correctos)
