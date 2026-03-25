# Plan: LAP Flow Runner v1

## Objetivo
Refactorizar el backend de LAP extrayendo la orquestación principal (que actualmente vive acoplada a los Next.js Route Handlers) hacia una **Service Layer** pura (`src/lib/services/`). Construir además un script CLI (`scripts/lap-runner.ts`) que permita ejecutar todo el flujo `intake -> plan build -> simulate -> JSON output` de forma transparente y programática para IDEs agenticos, sin necesidad de arrancar el servidor web.

## Tareas

### Fase 1: Service Layer (`src/lib/services/`)

- [ ] **T1: Tipos (`src/lib/services/types.ts`)**
  - Definir las interfaces de entrada y salida para Intake, Build, y Simulate.
  - Asegurar que no hay dependencias de `Request` o `NextResponse`.

- [ ] **T2: Servicio Intake (`src/lib/services/intake.service.ts`)**
  - Extraer la lógica de `app/api/intake/route.ts`.
  - Debe recibir los datos expresos (IntakeExpress) y retornar el `profileId`.

- [ ] **T3: Servicio Build (`src/lib/services/build.service.ts`)**
  - Extraer la lógica de orquestación de `app/api/plan/build/route.ts`.
  - Recibir `profileId`, configuraciones, y callbacks de progreso puros (en lugar de inyectar SSE directamente).
  - Retornar el `planId` y resultados.

- [ ] **T4: Servicio Simulate (`src/lib/services/simulate.service.ts`)**
  - Extraer la lógica de `app/api/plan/simulate/route.ts`.
  - Recibir `planId`, `mode`, y callbacks puros de progreso.
  - Retornar el reporte `simulation`.

- [ ] **T5: Servicio Queries (`src/lib/services/queries.service.ts`)**
  - Funciones helper para obtener perfiles, planes y progresos (refactor de `plan/list/route.ts` etc. o al menos proveer acceso limpio).

- [ ] **T6: Barrel file (`src/lib/services/index.ts`)**
  - Exportar todo ordenado.

### Fase 2: CLI Runner (`scripts/`)

- [ ] **T7: Esquema de configuración (`scripts/runner-config.schema.ts`)**
  - Definir con Zod el JSON esperado por el runner (perfil base, modo de build, modelo, etc.).

- [ ] **T8: Ejecutable Principal (`scripts/lap-runner.ts`)**
  - Punto de entrada en TypeScript o tsx.
  - Parsear el JSON de configuración.
  - Llamar a Service Layer: `intakeService` -> `buildService` -> `simulateService`.
  - Imprimir el progreso a `stderr` (para que los IDes lo vean en vivo) y el resultado final como JSON a `stdout` (para parsearlo con `jq`).

- [ ] **T9: Configuración de ejemplo (`scripts/example-config.json`)**
  - Proveer un JSON prearmado para probar rápidamente.

### Fase 3: Integración General

- [ ] **T10: Scripts NPM (`package.json`)**
  - Añadir comando `lap:run` (ej: `tsx scripts/lap-runner.ts`).
  - Añadir `lap:run:example` apuntando al JSON de ejemplo.

- [ ] **T11: Refactor de Route Handlers**
  - Actualizar `app/api/intake/route.ts`, `app/api/plan/build/route.ts`, `app/api/plan/simulate/route.ts`, etc. para que en su lugar llamen a la nueva *Service Layer*, enviando a través de los callbacks los eventos como chunk de SSE.
  - Eliminar redundancias de lógica de negocio en esas rutas (que ahora serán wrappers).

## Validaciones
- Cada refactor no debe romper los schemas ni lógica de SSE existente.
- `npm run dev` y el frontend siguen funcionando perfectamente.
- `npm run lap:run:example` ejecuta todo el ciclo en consola entregando un JSON validable.
