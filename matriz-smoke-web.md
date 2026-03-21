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
4. `npm run smoke:local`
5. `npm run dev`
6. Si se quiere validar sin provider local: `npm run doctor:local -- --skip-ollama`

## Precondiciones extra para cobro Lightning real en local

1. `LAP_LIGHTNING_RECEIVER_NWC_URL` configurada en `.env.local`
2. billetera NWC real conectada desde `/settings`
3. saldo suficiente para un build online y, si se quiere validar rechazo por presupuesto, una conexion con tope bajo o gasto casi agotado
4. `npm run smoke:local:charge`
5. despues de cada caso, `npm run charge:report -- --limit=10`

## Precondiciones para Vercel

1. `DATABASE_URL` cloud configurada
2. proveedor cloud configurado para LLM
3. deploy accesible
4. `vercel.json` aplicado
5. `npm run doctor:deploy`
6. `npm run smoke:deploy`

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
| Cobro Lightning listo | conectar billetera y abrir build online | no aplica por ahora | settings y dashboard muestran billetera lista para cobrar y monto por accion | `npm run smoke:local:charge`, `tests/settings-page-content.test.tsx`, `tests/dashboard.interaction.test.tsx` |
| Cobro Lightning pagado | ejecutar `plan/build` online con receiver NWC real | no aplica por ahora | UI confirma cobro, dashboard refleja sats cobrados y `charge:report` muestra `paid` enlazado con `cost_tracking` | `npm run build`, `tests/operation-charging.test.ts`, `tests/plan-build-charge-route.test.ts` |
| Build gratis/local | ejecutar `plan/build` con Ollama local | no aplica | UI deja claro que no cobro y `charge:report` muestra `skipped` con razon local | `tests/plan-build-fallback.test.ts`, `tests/cost-summary.test.ts` |
| Cobro rechazado por saldo o presupuesto | repetir build online con wallet sin saldo o sin presupuesto | no aplica por ahora | la accion se bloquea o rechaza con mensaje claro y `charge:report` muestra `rejected` sin plan persistido nuevo | `tests/operation-charging.test.ts`, `tests/plan-build-charge-route.test.ts` |
| Inspector LLM | abrir panel, lanzar build o simulate y revisar snapshot | repetir smoke cuando haya deploy con proveedor cloud | traza, spans y resultado visibles | `tests/debug-panel-render.test.ts`, `tests/instrumented-runtime.test.ts`, `tests/trace-collector.test.ts` |

## Flujo recomendado para cobro Lightning local

1. Correr `npm run smoke:local:charge`. Si falla por `LAP_LIGHTNING_RECEIVER_NWC_URL`, no hay entorno listo para cobro real y no vale seguir con el caso pago.
2. Abrir `npm run dev`, entrar a `/settings?intent=build&provider=openai` y conectar la billetera NWC.
3. Confirmar en UI que aparece el monto del build online y que la billetera queda lista para cobrar.
4. Ejecutar un build online y validar en dashboard alguno de estos resultados: `Se cobraron {{sats}} sats`, `El cobro fue rechazado`, o `No se pudo cobrar`.
5. Correr `npm run charge:report -- --expect=paid` para confirmar trazabilidad en `operation_charges` y enlace con `cost_tracking`.
6. Ejecutar un build local con Ollama y validar en UI que el armado fue gratis/local.
7. Correr `npm run charge:report -- --expect=paid,skipped` para confirmar que existe un `skipped` por ruta local.
8. Repetir un build online con saldo o presupuesto insuficiente y validar bloqueo o rechazo visible.
9. Correr `npm run charge:report -- --expect=paid,skipped,rejected` para confirmar el caso rechazado.

## Notas operativas

- En local, Ollama es valido solo para desarrollo
- El smoke de cobro real no vale si falta `LAP_LIGHTNING_RECEIVER_NWC_URL` o si no hay una billetera NWC conectada desde la UI
- En Vercel, el smoke de LLM debe hacerse con proveedor cloud
- En Vercel, el frontend no debe exponer el build local y el backend no debe caer a Ollama como fallback
- Ninguna corrida vale si un fallback o mock oculta un error HTTP sin senal visible

## Registro sugerido

| Fecha | Rama | Local web | Vercel web | Observaciones |
| --- | --- | --- | --- | --- |
| YYYY-MM-DD | `codex/...` | pendiente | pendiente | completar luego de cada smoke real |
