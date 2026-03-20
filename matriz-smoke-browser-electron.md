# Matriz de smoke y paridad browser-Electron

## Objetivo

Dejar una referencia unica y reproducible para validar los flujos criticos de LAP en las dos superficies activas:

- browser-first con backend local compartido via `npm run dev`
- shell Electron via `npm run dev:electron`

Esta matriz cubre `perfil`, `build`, `progreso`, `streaks`, `simulacion`, `exportacion`, `wallet`, `costos` e `inspector`.

## Regla de uso

- Esta matriz valida ruta real. Si el renderer cae a `mockLapApi`, la corrida no cuenta como paridad salvo que la fila lo diga de forma explicita.
- Si el cambio toca `src/server/`, `src/main/`, `src/preload/`, contratos compartidos o transporte, reiniciar browser y Electron en limpio antes de correr smoke.
- La evidencia minima de cada corrida es doble: una automatica y una visible.
- Hasta que existan `tests/e2e/` o `tests/qa-chaos/` reales, esta matriz es la referencia operativa de QA cross-surface.

## Precondiciones

1. Correr `npm run typecheck`.
2. Correr `npx vitest run`.
3. Levantar browser con `npm run dev`.
4. Levantar Electron con `npm run dev:electron`.
5. Preparar un perfil valido.
6. Preparar al menos un plan con tareas para hoy.
7. Para `streaks`, asegurar que exista al menos un item `tipo = "habito"` en el dia a validar.

## Evidencia automatica base

- Baseline total: `npm run typecheck`
- Baseline total: `npx vitest run`
- Cobertura enfocada por flujo:
  - perfil: `tests/plan-intake.test.ts`, `tests/app-services.test.ts`, `tests/app-services-render.test.ts`
  - build: `tests/plan-builder.test.ts`, `tests/provider-factory.test.ts`, `tests/plan-build-fallback.test.ts`, `tests/browser-dev-server-fake-openai.test.ts`
  - progreso y streaks: `tests/dashboard.interaction.test.tsx`, `tests/streaks.test.ts`
  - simulacion: `tests/plan-simulator.test.ts`
  - exportacion: `tests/ics-generator.test.ts`, `tests/browser-http-client.test.ts`
  - wallet y costos: `tests/payment-provider.test.ts`, `tests/wallet-i18n.test.ts`, `tests/cost-summary.test.ts`
  - inspector: `tests/debug-panel-render.test.ts`, `tests/browser-http-client.test.ts`, `tests/instrumented-runtime.test.ts`, `tests/trace-collector.test.ts`

## Matriz operativa

| Flujo | Browser smoke | Electron smoke | Evidencia visible | Evidencia automatica | Paridad esperada | Diferencia aceptada |
| --- | --- | --- | --- | --- | --- | --- |
| Perfil y session restore | Completar intake; confirmar saludo y estado inicial; recargar la app | Completar intake; cerrar y reabrir la ventana; confirmar restauracion | Saludo con nombre y carga del ultimo perfil sin pasar otra vez por intake | `tests/plan-intake.test.ts`, `tests/app-services.test.ts`, `tests/app-services-render.test.ts` | Mismo contrato `intake.save`, `profile.latest`, `profile.get` y `plan.list` | Ninguna |
| Build de plan | Desde dashboard usar `Armar con asistente local`; observar progreso completo hasta aterrizar en plan o dashboard con plan activo | Mismo flujo con `Armar con asistente local` | Pantalla de build por etapas, luego nombre del plan y tareas sembradas | `tests/plan-builder.test.ts`, `tests/provider-factory.test.ts`, `tests/plan-build-fallback.test.ts`, `tests/browser-dev-server-fake-openai.test.ts` | Mismo `PlanBuildResult` y mismas etapas de progreso visibles | Browser usa SSE en `/__lap/api/plan/build/events`; Electron usa `plan:build:progress`. La ruta OpenAI/fallback no es smoke base porque depende de proveedor externo o falla inducida |
| Progreso diario | Marcar una tarea `Listo`; verificar contador; deshacer; recargar y confirmar persistencia | Mismo flujo | Cambio inmediato del estado visual y del contador `X de Y listas` | `tests/dashboard.interaction.test.tsx` | Mismo contrato `progress.list` y `progress.toggle` | Ninguna |
| Streaks | Marcar o desmarcar un `habito`; verificar actualizacion de racha actual y mejor racha | Mismo flujo | Card de racha actualizada sin recargar toda la app | `tests/streaks.test.ts`, `tests/dashboard.interaction.test.tsx` | Mismo contrato `streak.get` y misma lectura de `plan_progress` | Si el plan del dia no trae habitos, la fila queda bloqueada hasta sembrar o elegir un plan que si los tenga |
| Simulacion | Ejecutar `Revisar plan`; observar etapas en vivo y resultado final; recargar para confirmar persistencia de `ultimaSimulacion` | Mismo flujo | Progreso por etapas, hallazgos y resumen final persistidos | `tests/plan-simulator.test.ts` | Mismo `PlanSimulationResult` y misma secuencia semantica de progreso | Browser usa SSE en `/__lap/api/plan/simulate/events`; Electron usa `plan:simulate:progress` |
| Exportacion `.ics` | Ejecutar exportacion; confirmar descarga local del archivo y estado de exito en UI | Ejecutar exportacion; confirmar dialogo nativo, escritura del archivo y estado de exito en UI | Mensaje de exito y archivo utilizable | `tests/ics-generator.test.ts`, `tests/browser-http-client.test.ts` | Mismo contenido calendario y misma respuesta de exito a nivel renderer | Browser descarga via blob y devuelve `filePath` sintetico; Electron usa `dialog.showSaveDialog()` y ruta real de archivo |
| Wallet | Verificar card de wallet en browser y aviso de no disponibilidad segura | Abrir editor, conectar una NWC valida, verificar alias/saldo, desconectar y confirmar limpieza | Browser muestra aviso de indisponibilidad; Electron muestra estados de conexion, error o desconexion | `tests/payment-provider.test.ts`, `tests/wallet-i18n.test.ts` | Mismo shape de `WalletStatus` y misma UI para estados renderizables | Browser valida solo el estado no soportado (`canUseSecureStorage: false`). `safeStorage` y handshake NWC real son smoke de Electron |
| Costos | Despues de build, revisar card de costo y volver a cargar datos | Mismo flujo | Card de costo con sats/tokens o empty state consistente | `tests/cost-summary.test.ts`, `tests/plan-build-fallback.test.ts` | Mismo `CostSummary` para el mismo plan | El valor puede ser `0 sats` si el provider final no cobra. Eso es una diferencia de provider, no de superficie |
| Inspector LLM | Abrir panel con `Ctrl/Cmd+Shift+D`; lanzar build o simulacion; observar trazas y stream; cerrar y reabrir | Mismo flujo | Panel visible, contador de trazas, spans, stream y snapshot accesibles aun con apertura tardia | `tests/debug-panel-render.test.ts`, `tests/browser-http-client.test.ts`, `tests/instrumented-runtime.test.ts`, `tests/trace-collector.test.ts` | Mismo contrato `debug.enable`, `debug.disable`, `debug.status`, `debug.snapshot` y mismo contenido semantico de trazas | Browser usa SSE en `/__lap/api/debug/events`; Electron usa `debug:event` via IPC |

## Diferencias aceptadas hoy

- Browser y Electron deben compartir contrato de renderer. No tienen por que compartir el mismo transporte interno.
- Wallet no tiene paridad funcional completa entre superficies: browser valida la ausencia de `safeStorage`; Electron valida el flujo real de conexion NWC.
- Exportacion no tiene paridad de mecanismo: browser descarga via blob; Electron pide ruta via dialogo nativo. La paridad exigida es el contenido `.ics` y la senal de exito.
- El smoke base de build usa `Armar con asistente local` para no depender de secretos externos. La ruta OpenAI con fallback sigue siendo obligatoria a nivel de tests y de smoke puntual cuando se toca provider o fallback.

## Gaps que siguen abiertos

- `tests/e2e/` y `tests/qa-chaos/` siguen sin escenario real; la matriz manual sigue siendo necesaria.
- Falta una corrida persistida con resultado por fecha, rama y superficie para que QA no quede en memoria oral.
- Falta automatizar el recorte entre ruta real y fallback/demo como gate duro de la corrida.

## Registro sugerido por corrida

| Fecha | Rama | Browser | Electron | Observaciones |
| --- | --- | --- | --- | --- |
| YYYY-MM-DD | `codex/...` | pendiente | pendiente | completar despues de cada smoke real |
