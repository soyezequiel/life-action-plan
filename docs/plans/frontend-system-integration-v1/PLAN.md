# Plan: Integracion del sistema al frontend

> **Objetivo**: integrar el sistema vigente de LAP al frontend real sin reescribir la UI, dejando una entrada clara por pantalla y una frontera explicita entre flujo hibrido, build guiado y visor persistido.
> **Base arquitectonica**: `docs/architecture/FLUJO_HIBRIDO_DRAFT.md`, `docs/architecture/PIPELINE_V6_SPEC.md`, `components/FlowPageContent.tsx`, `components/flow/PlanFlow.tsx`, `components/Dashboard.tsx`.
> **Criterio rector**: minimo cambio visual, maximo reuso de rutas y contratos existentes.
> **Criterio UX adicional**: la parte visible del flow debe ser lo mas minimalista posible y solo debe mostrarse cuando el usuario tenga que intervenir, especialmente para responder preguntas o destrabar el proceso.

## Diagnostico actual

Hoy el frontend tiene tres superficies validas pero mal alineadas entre si:

1. `app/flow` + `components/FlowPageContent.tsx`
   Journey hibrido completo: gate, objetivos, intake, estrategia, realidad, simulacion, presentacion, calendario, top-down y activacion.

2. `app/plan` + `components/flow/PlanFlow.tsx`
   Build guiado de `v6` con SSE, pausa por aclaraciones y salida a `/plan/v5`.

3. `app/page.tsx` + `components/Dashboard.tsx`
   Entrada principal del producto, pero hoy mezcla accesos a `/flow`, `/settings?intent=build` y al visor persistido.

El problema no es falta de frontend sino falta de una frontera operativa simple:

- el camino simple del dashboard no entra directo a la UI guiada de build
- `settings` todavia ejecuta build desde otra experiencia cliente
- `flow` y `plan` conviven, pero no queda claro cual es el recorrido canonico para cada necesidad
- el resultado final si esta bien definido: el plan materializado se abre en `/plan/v5`

## Decision de integracion

Se mantiene la arquitectura actual y se ordena por responsabilidades:

### 1. `app/flow` queda como journey del producto

Usar `app/flow` para:

- captura de objetivos
- intake dinamico
- estrategia
- chequeo de realidad
- simulacion
- presentacion
- calendario
- top-down
- activacion

No usar `app/flow` como duplicado del build v6 puro.

### 2. `app/plan` queda como frontend canonico del build guiado `v6`

Usar `app/plan` para:

- disparar `POST /api/plan/build`
- mostrar fases SSE
- pedir aclaraciones
- reanudar con `POST /api/plan/build/resume`
- cerrar en `/plan/v5`

No mover este flujo a `settings`.

Regla visual para esta superficie:

- durante procesamiento normal, evitar chrome de flow persistente
- mostrar solo un estado minimo de espera
- expandir la UI del flow unicamente cuando exista `v6:needs_input` o una accion equivalente del usuario

### 3. `app/plan/v5` queda como visor persistido canonico

Usar `/plan/v5` para:

- lectura del plan guardado
- seguimiento
- adaptacion posterior
- apertura desde `v6:complete`

### 4. `settings` queda como preparacion de recursos, no como home del flujo

Usar `settings` para:

- elegir modo de uso
- administrar claves
- administrar wallet
- mostrar preview de uso/costo

Evitar que `settings` siga siendo la experiencia principal del armado para el camino normal.

## Ajuste minimo aplicado

Ya se aplico un cambio minimo en `components/Dashboard.tsx`:

- `handleBuildPlan('service')` ahora abre `/plan?profileId=...`
- `handleBuildPlan('own')` sigue entrando por `settings?intent=build&mode=own`

Esto alinea el camino simple con la UI guiada existente sin romper la ruta avanzada.

## Plan de implementacion

### Etapa 1. Entrada unica y legible

**Objetivo**: que el usuario normal entre al frontend correcto sin pasar por una pantalla tecnica.

**Archivos**:
- `components/Dashboard.tsx`
- `components/settings/BuildSection.tsx`
- `components/SettingsPageContent.tsx`

**Tareas**:
- consolidar el camino simple del dashboard en `/plan`
- dejar `settings` como paso tecnico/avanzado
- revisar copys para que "Pulso se ocupa" no termine en una UI de configuracion
- asegurar que la llegada a `/plan` no presente una experiencia pesada de flow desde el primer render

**Resultado esperado**:
- usuario normal: `dashboard -> /plan -> /plan/v5`
- usuario avanzado: `dashboard -> /settings?intent=build&mode=own -> /plan o build tecnico`

### Etapa 2. Contrato de navegacion entre superficies

**Objetivo**: que `flow`, `plan` y `plan/v5` se encadenen sin ambiguedad.

**Archivos**:
- `components/FlowPageContent.tsx`
- `components/flow/PlanFlow.tsx`
- `app/plan/page.tsx`

**Tareas**:
- definir explicitamente desde que paso de `flow` se deriva a `plan` y cuando no hace falta
- asegurar que `PlanFlow` pueda recibir los datos minimos necesarios sin duplicar estado
- homogeneizar la salida final hacia `/plan/v5?planId=...`
- fijar una regla de visibilidad: el flow guiado solo se expone cuando hay preguntas, confirmaciones o bloqueos que requieren respuesta humana

**Resultado esperado**:
- `flow` prepara y activa
- `plan` construye
- `plan/v5` muestra y ejecuta

### Etapa 2.1. Minimalismo explicito del flow guiado

**Objetivo**: que el build no se sienta como un wizard permanente.

**Archivos**:
- `components/flow/PlanFlow.tsx`
- `components/flow/PlanFlow.module.css`

**Tareas**:
- ocultar sidebar, rail o resumen persistente mientras el sistema procesa sin necesitar input
- dejar visible solo el formulario inicial, los estados minimos de espera y la pantalla final
- mostrar el chrome completo del flow solamente en `clarifying` o estados equivalentes donde el usuario tiene que responder algo
- evitar barras de progreso, labels de fase o paneles laterales permanentes si no agregan una decision para el usuario

**Resultado esperado**:
- mientras el sistema piensa: UI minima
- cuando el sistema pregunta: UI expandida
- cuando termina: UI minima otra vez

### Etapa 3. Reducir duplicacion cliente de build

**Objetivo**: evitar dos UIs cliente distintas para el mismo endpoint `/api/plan/build`.

**Archivos**:
- `src/lib/client/browser-http-client.ts`
- `src/lib/client/plan-client.ts`
- `components/SettingsPageContent.tsx`

**Tareas**:
- decidir un solo cliente frontend para el build guiado de `v6`
- extraer contrato comun de eventos si ambos caminos deben convivir un tiempo
- retirar la dependencia de `settings` sobre el build directo una vez que `/plan` cubra el caso completo

**Resultado esperado**:
- una sola semantica de SSE en frontend
- menos riesgo de divergencia entre dashboard/settings y `/plan`

### Etapa 4. Estado compartido minimo entre flujo y build

**Objetivo**: pasar del frontend hibrido al build sin re-pedir datos ni perder contexto.

**Archivos**:
- `src/lib/client/storage-keys.ts`
- `components/FlowPageContent.tsx`
- `app/plan/page.tsx`
- `components/flow/PlanFlow.tsx`

**Tareas**:
- definir que IDs o flags se pasan por query params y cuales por storage local
- reutilizar `profileId` vigente como contrato minimo
- evitar acoplar `PlanFlow` a todo el estado de `flow`

**Resultado esperado**:
- integracion por borde fino: `profileId`, `provider`, `entry intent`

### Etapa 5. Verificacion visible

**Objetivo**: comprobar que el sistema ya se siente uno solo desde la UI.

**Pruebas minimas**:
- flujo simple: `dashboard -> /plan -> aclaraciones -> /plan/v5`
- flujo avanzado: `dashboard -> settings -> build -> dashboard o visor`
- flujo hibrido: `dashboard -> /flow -> activacion -> dashboard`
- error controlado: proveedor no disponible y mensaje abuela-proof

## Criterios de aceptacion

- el dashboard tiene una entrada clara al armado normal
- no se agrega una cuarta experiencia de build
- `flow`, `plan` y `plan/v5` tienen responsabilidades no superpuestas
- el usuario no tecnico no cae primero en configuraciones avanzadas
- los cambios de frontend son de borde, no de rediseño
- el flow visible no queda persistente durante todo el build
- la UI expandida del flow aparece solo cuando el usuario realmente tiene que responder algo

## Riesgos y mitigaciones

### Riesgo 1. Duplicacion funcional entre `settings` y `/plan`

**Mitigacion**:
- mantener `settings` solo como preparacion
- mover el build guiado a una unica experiencia visible

### Riesgo 2. Navegacion inconsistente entre `flow` y `plan`

**Mitigacion**:
- fijar `profileId` como contrato minimo de enlace
- documentar puntos exactos de handoff

### Riesgo 3. Romper el camino avanzado existente

**Mitigacion**:
- conservar `mode=own` en `settings`
- cambiar solo el camino simple mientras se verifica el resto

## Evidencia requerida al ejecutar este plan

- automatica: `npm run typecheck`
- visible: recorrido manual `dashboard -> /plan -> /plan/v5`
