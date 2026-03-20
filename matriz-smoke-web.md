# Matriz de smoke web

## Objetivo

Validar los flujos criticos de LAP en el entorno web actual.

Superficies:
- local web: `npm run dev`
- deploy web: Vercel preview o produccion, cuando aplique

## Precondiciones locales

1. `npm run typecheck`
2. `npm run test`
3. PostgreSQL accesible por `DATABASE_URL`
4. `npm run db:push`
5. `npm run dev`
6. Si se valida provider local: Ollama corriendo en `http://localhost:11434`

## Precondiciones para Vercel

1. `DATABASE_URL` cloud configurada
2. proveedor cloud configurado para LLM
3. deploy accesible
4. `vercel.json` aplicado

## Evidencia minima

- Automatizada: `typecheck`, `test`, y `build` cuando se toca API, DB o contratos
- Visible: UI, stream, inspector, archivo `.ics`, o persistencia verificable

## Matriz

| Flujo | Local web | Vercel web | Evidencia visible | Evidencia automatica |
| --- | --- | --- | --- | --- |
| Perfil y restauracion | Completar intake y recargar | Completar intake y recargar | saludo con nombre y restauracion del ultimo perfil | `tests/plan-intake.test.ts`, `tests/app-services.test.tsx`, `tests/app-services-render.test.ts` |
| Build con proveedor local | Usar `Armar con asistente local` | no aplica | progreso por etapas y aterrizaje en dashboard con plan | `tests/plan-builder.test.ts`, `tests/provider-factory.test.ts`, `tests/plan-build-fallback.test.ts` |
| Build con proveedor cloud | opcional | usar proveedor cloud configurado | progreso por etapas y plan persistido | `npm run build`, tests de builder y provider |
| Progreso diario | marcar `Listo`, deshacer y recargar | repetir smoke | contador y estado persisten | `tests/dashboard.interaction.test.tsx` |
| Rachas | completar o deshacer un habito | repetir smoke | card de racha actualizada | `tests/streaks.test.ts` |
| Simulacion | ejecutar `Revisar plan` | repetir smoke cuando haya proveedor cloud | progreso visible y resultado persistido | `tests/plan-simulator.test.ts` |
| Exportacion `.ics` | descargar archivo y verificar contenido | repetir smoke | mensaje de exito y archivo utilizable | `tests/ics-generator.test.ts`, `tests/browser-http-client.test.ts` |
| API key settings | guardar o actualizar key | repetir smoke | feedback visible de guardado o error | `npm run build` |
| Wallet | revisar estados visibles actuales | repetir smoke si esta habilitado en deploy | estado, error o desconexion visibles | `tests/payment-provider.test.ts`, `tests/wallet-i18n.test.ts`, `tests/cost-summary.test.ts` |
| Inspector LLM | abrir panel, lanzar build o simulate y revisar snapshot | repetir smoke cuando haya deploy con proveedor cloud | traza, spans y resultado visibles | `tests/debug-panel-render.test.ts`, `tests/instrumented-runtime.test.ts`, `tests/trace-collector.test.ts` |

## Notas operativas

- En local, Ollama es valido solo para desarrollo
- En Vercel, el smoke de LLM debe hacerse con proveedor cloud
- Ninguna corrida vale si un fallback o mock oculta un error HTTP sin senal visible

## Registro sugerido

| Fecha | Rama | Local web | Vercel web | Observaciones |
| --- | --- | --- | --- | --- |
| YYYY-MM-DD | `codex/...` | pendiente | pendiente | completar luego de cada smoke real |
