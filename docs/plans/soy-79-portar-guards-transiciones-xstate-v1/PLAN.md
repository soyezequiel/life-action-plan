# Portar guards y transiciones reales al modelo XState

> **Linear:** SOY-79
> **Status:** `pending`
> **Plan:** `docs/plans/soy-79-portar-guards-transiciones-xstate-v1/PLAN.md`
> **Padre:** SOY-46 — stage 3 de `pipeline-v6-xstate-migration-v1`

## Contexto
El orchestrator actual contiene lógica de avance de fases con múltiples caminos condicionales. Este stage porta esa lógica como guards y transiciones formales de XState, incluyendo los estados de pausa por input y fin forzado.

## Alcance
Modelar en XState todos los caminos reales del pipeline: `clarify` advancement, `check → plan|schedule|package`, `critique → clarify|revise|package`, estados explícitos `done`/`failed`/`blocked`, pausa por input y force finish.

## Pasos de implementación
1. Leer el orchestrator actual y listar todos los guards de avance de fase existentes
2. Modelar transición `clarify` con su lógica de avance en la máquina
3. Modelar bifurcaciones de `check`: `→ plan`, `→ schedule`, `→ package`
4. Modelar bifurcaciones de `critique`: `→ clarify`, `→ revise`, `→ package`
5. Agregar estados explícitos: `done`, `failed`, `blocked`
6. Modelar `INPUT_PAUSE`: transición a `needs_input` con serialización de estado
7. Modelar `FORCE_FINISH`: transición directa a `done` desde cualquier estado activo
8. Verificar matrix de regresión de SOY-77 contra la nueva máquina

## Criterio de cierre
- Todos los caminos de la matriz de regresión (SOY-77) pasan contra la nueva máquina
- `npm run typecheck` sin errores
- Ningún test existente roto

## No tocar
- Rutas públicas de API
- El orchestrator actual (en paralelo hasta SOY-81)
- Archivos fuera de `src/lib/pipeline/v6/xstate/`
