[2026-03-18 23:32:18 -03:00] - Paso 2.2/2.3: Pay-Per-Token UI + Ollama Fallback
Completado
- Paso 2.2 completo: tracking de costos por build en `cost_tracking`, handler `cost:summary`, binding en preload y card de gasto en dashboard.
- Paso 2.3 completo: fallback automatico a `ollama:qwen3:8b` cuando falla OpenAI durante `plan:build`, con `fallbackUsed` en el resultado y aviso visual en dashboard.
- Mock browser actualizado para simular resumen de gasto y fallback.
- Smoke browser verificado para card de gasto, build "en linea" con fallback y aviso posterior.

Archivos tocados
- `src/main/db/db-helpers.ts`
- `src/main/ipc-handlers.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/shared/types/ipc.ts`
- `src/renderer/src/components/Dashboard.tsx`
- `src/renderer/src/mock-api.ts`
- `src/renderer/src/assets/global.css`
- `src/i18n/locales/es-AR.json`
- `src/utils/plan-build-fallback.ts`
- `tests/cost-summary.test.ts`
- `tests/plan-build-fallback.test.ts`
- `tests/wallet-i18n.test.ts`

Tests
- 3 tests nuevos en `tests/cost-summary.test.ts`
- 4 tests nuevos en `tests/plan-build-fallback.test.ts`
- 1 test actualizado en `tests/wallet-i18n.test.ts`
- Total verificado en la suite: `56` tests pasando

Decisiones
- No agregue columna `cost_sats` en SQLite. El resumen calcula sats on-the-fly desde `cost_usd`, evitando migracion de schema y compatibilidad rota con DBs ya creadas.
- La conversion USD -> sats quedo fija en `1000 sats = 1 USD` para esta iteracion. Es simple, determinista y suficiente para UI/demo; una cotizacion viva queda para una iteracion posterior.
- El costo monetario se cobra solo sobre el modelo final exitoso. Si OpenAI falla y se usa Ollama, el resultado puede mostrar tokens consumidos locales pero costo `0`.
- El aviso de fallback en dashboard se deriva del `manifest` del plan (`fallbackUsed`) para no depender de estado efimero del renderer.
- El helper de fallback quedo aislado en `src/utils/plan-build-fallback.ts` para poder testearlo sin Electron ni red.

Pendiente
- No se integro cobro real contra la wallet todavia; esta iteracion deja lista la trazabilidad de costo y la UI. El paso natural siguiente es usar el provider NWC para ejecutar el cobro efectivo.
- No se implemento cotizacion dinamica USD/BTC ni presupuesto configurable por usuario/plan.

Bug o edge case
- Si OpenAI falla despues de haber consumido tokens parciales pero antes de devolver una respuesta utilizable, hoy no se registra ese costo parcial porque el runtime actual no expone usage parcial en error.
- En builds con fallback a Ollama, el card de gasto puede mostrar tokens consumidos con `0 sats`, porque el computo local no genera costo monetario.

[2026-03-18 23:38:47 -03:00] - Fix tecnico: carga ESM de `@getalby/sdk` en Electron main
Completado
- Corregido el crash de arranque del main process causado por `require()` sobre `@getalby/sdk` desde CommonJS.
- La wallet NWC mantiene el mismo comportamiento funcional, pero ahora el SDK se carga con `import()` diferido al primer uso.

Archivos tocados
- `src/payments/nwc-provider.ts`

Tests
- Suite completa revalidada: `56` tests pasando

Decisiones
- Reemplace la importacion runtime estatica del SDK por carga dinamica para evitar el choque `CJS -> ESM` con `emittery`.
- Deje los tipos del SDK como `import type`, asi no se pierde tipado pero tampoco se fuerza carga temprana del modulo en el main process.

Pendiente
- Falta revalidar manualmente el arranque real de Electron en una ventana local despues de este fix si queres una confirmacion visual extra.

[2026-03-18 23:51:43 -03:00] - Fix tecnico: parser robusto para respuesta de plan
Completado
- Corregido el fallo que terminaba mostrando "El asistente no pudo generar un plan valido. Intenta de nuevo." cuando el modelo devolvia bloques `<think>...</think>`, fences Markdown o texto extra antes/despues del JSON.
- `plan-builder` ahora extrae el primer objeto JSON balanceado y valida su forma antes de aceptar el plan.

Archivos tocados
- `src/skills/plan-builder.ts`
- `tests/plan-builder.test.ts`

Tests
- 3 tests nuevos en `tests/plan-builder.test.ts` para parseo con code fences, think blocks y estructura invalida.
- Suite completa revalidada: `59` tests pasando.
- `npm run typecheck`: OK
- `npm run build`: OK

Decisiones
- No cambie el IPC ni el renderer para este fix; el problema estaba en el parseo fragil de la respuesta del modelo.
- Agregue validacion con Zod `.strict()` en la respuesta parseada para rechazar estructuras parciales o mal formadas en lugar de persistir planes corruptos.
- El parser remueve markup comun del modelo (`<think>` y code fences) y luego recorta el primer JSON balanceado, que es el caso realista de Ollama/Qwen con texto accesorio.

Pendiente
- Falta una validacion manual en `npm run dev` con un Ollama local real para confirmar el flujo visual end-to-end en una sesion interactiva.

Bug o edge case
- Si el modelo devuelve un objeto JSON sintacticamente correcto pero semanticamente pobre, el build todavia puede fallar por validacion estructural, que es preferible a guardar un plan roto.

[2026-03-19 00:11:20 -03:00] - Fix tecnico: normalizacion tolerante para respuestas de Ollama/Qwen
Completado
- Endureci el builder para aceptar respuestas "casi correctas" del modelo local, incluso cuando traen campos extra o numeros como texto.
- Reproduje el flujo con el perfil real guardado en SQLite y `ollama:qwen3:8b`; el builder actual genero planes validos 4 veces seguidas fuera de Electron.

Archivos tocados
- `src/skills/plan-builder.ts`
- `tests/plan-builder.test.ts`

Tests
- 1 test nuevo en `tests/plan-builder.test.ts` para normalizacion de campos extra y tipos flexibles.
- Suite completa revalidada: `60` tests pasando.
- `npm run typecheck`: OK
- `npm run build`: OK

Decisiones
- Mantengo validacion final estricta con Zod, pero antes normalizo la salida cruda del modelo para no romper por ruido comun de LLM.
- La normalizacion ahora recorta strings, convierte `semana` y `duracion` desde texto a entero, normaliza `hora` a `HH:MM`, baja `dia`/`categoria` a minusculas y descarta propiedades sobrantes.
- No cambie el flujo IPC ni la base; el problema seguia concentrado en la tolerancia del parser del plan.

Pendiente
- Falta confirmacion visual del flujo completo dentro de Electron despues de reiniciar el proceso dev, porque las pruebas exactas se hicieron contra el builder real pero fuera de la ventana.

Bug o edge case
- Si el modelo devuelve una categoria fuera del set permitido o una hora imposible, el build seguira fallando por validacion. Eso es intencional para no sembrar progreso corrupto.

[2026-03-19 00:34:13 -03:00] - Paso 2.4: Simulador basico de viabilidad (MVP)
Completado parcial
- Agregado `plan:simulate` en IPC para revisar un plan ya armado y persistir el resultado en el manifest.
- Creado `src/skills/plan-simulator.ts` con chequeos locales de viabilidad: horario despierto, cruces con jornada, carga diaria, exceso de actividades y faltantes de metadata.
- Integrada una tarjeta de "Revision del plan" en dashboard con resumen, hallazgos y boton para volver a revisar.
- Mock browser actualizado y smoke visual verificada en `dev:browser`.

Archivos tocados
- `src/skills/plan-simulator.ts`
- `src/main/ipc-handlers.ts`
- `src/shared/types/ipc.ts`
- `src/shared/schemas/manifiesto.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/components/Dashboard.tsx`
- `src/renderer/src/assets/global.css`
- `src/renderer/src/mock-api.ts`
- `src/i18n/locales/es-AR.json`
- `tests/plan-simulator.test.ts`

Tests
- 4 tests nuevos en `tests/plan-simulator.test.ts`
- Suite completa revalidada: `64` tests pasando.
- `npm run typecheck`: OK
- `npm run build`: OK
- Smoke visual en `dev:browser`: OK

Decisiones
- El simulador de esta iteracion es determinista y local; no usa LLM ni streaming. La idea fue tener una primera revision util sin abrir todavia el runtime conversacional completo.
- Mantengo el resultado visible en UI via `ultimaSimulacion` dentro del manifest, asi persiste al recargar.
- Los hallazgos del backend vuelven como `code + params` y el renderer traduce con `t()`. Asi no hay strings hardcodeadas en la UI ni acoplamiento de copy en main process.
- El manifest ahora refleja mejor el estado real con `PENDIENTE` cuando faltan horarios o duraciones para simular bien.

Pendiente
- Falta modo interactivo vs automatico.
- Falta barra de progreso real o streaming del avance de la revision.
- Falta integrar simulacion con LLM/contexto aislado como describe `PLAN_LAP_FINAL.md`.
- Falta boton/flujo para proponer ajustes automaticos despues de un `FAIL`.

Bug o edge case
- Si el usuario declara muy pocas horas libres, el simulador puede marcar `FAIL` legitimo aun cuando el plan sea "corto"; el chequeo hoy usa solo lo declarado en el perfil.
- El mock guarda una revision demo fija de tipo `WARN`; sirve para UI, no para validar la logica real del main process.

[2026-03-19 01:28 ART] — Paso 2.4: Modo interactivo y progreso visible
Completado parcial
- Agregue selector de modo `Paso a paso` / `Completa` para la revision del plan y persisto el modo usado dentro de `ultimaSimulacion`.
- La tarjeta de revision ahora muestra progreso visible por etapas mientras corre la simulacion.
- El backend del simulador distingue entre modo interactivo y automatico: el interactivo prioriza un hallazgo clave por bloque y evita mezclar mensajes `PASS` si ya hay problemas reales.
- Revalide la UI en `dev:browser` con mocks para ambos modos y corregi una regresion de orden de hooks en `Dashboard.tsx`.

Archivos tocados
- `src/skills/plan-simulator.ts`
- `src/main/ipc-handlers.ts`
- `src/shared/types/ipc.ts`
- `src/shared/schemas/manifiesto.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/components/Dashboard.tsx`
- `src/renderer/src/assets/global.css`
- `src/renderer/src/mock-api.ts`
- `src/i18n/locales/es-AR.json`
- `tests/plan-simulator.test.ts`

Tests
- 2 tests nuevos en `tests/plan-simulator.test.ts`:
  - `en modo paso a paso devuelve un hallazgo clave por bloque`
  - `en modo completo conserva mas hallazgos del panorama general`
- Suite completa revalidada: `68` tests pasando.
- `npm run typecheck`: OK
- `npm run build`: OK
- Smoke visual en `dev:browser`: OK para selector de modo, progreso visible y resultados distintos por modo.

Decisiones
- Mantengo `interactive` como default de producto en UI/IPC, pero el modo `automatic` conserva el panorama amplio de hallazgos.
- El progreso visible es una secuencia de etapas de UI, no streaming real del backend; sirve para la demo sin introducir todavia eventos incrementales en IPC.
- En modo interactivo filtro hallazgos `PASS` cuando ya hay `FAIL/WARN/MISSING`, para no diluir la primera accion sugerida al usuario.

Pendiente
- Falta progreso real por streaming desde main process si se quiere alinear al 100% con `PLAN_LAP_FINAL.md`.
- Falta modo verdaderamente interactivo con confirmaciones por iteracion.
- Falta integrar simulacion con LLM/contexto aislado y proponer ajustes automaticos despues de `FAIL`.

Bug o edge case
- Durante el desarrollo aparecio un bug de hooks por un `useEffect` debajo del `return` condicional de carga en `Dashboard.tsx`; ya quedo corregido.
- El mock de browser representa duraciones y resultados distintos por modo, pero no reproduce todavia una simulacion incremental real del backend.

[2026-03-19 01:39 ART] — Paso 2.4: Streaming real de revision desde backend
Completado parcial
- Reemplace el progreso inventado en frontend por un stream real de etapas emitidas durante `plan:simulate`.
- El simulador ahora corre en cuatro fases compartidas (`schedule`, `work`, `load`, `summary`) y puede emitir progreso sin duplicar logica.
- Agregue listener seguro en preload para que el renderer reciba eventos IPC de revision en tiempo real.
- El mock browser ahora emite esas mismas etapas con demoras controladas para poder verificar visualmente el flujo en `dev:browser`.

Archivos tocados
- `src/skills/plan-simulator.ts`
- `src/main/ipc-handlers.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/shared/types/ipc.ts`
- `src/renderer/src/components/Dashboard.tsx`
- `src/renderer/src/mock-api.ts`
- `tests/plan-simulator.test.ts`

Tests
- 1 test nuevo en `tests/plan-simulator.test.ts`:
  - `emite progreso real por etapas en orden`
- Suite completa revalidada: `69` tests pasando.
- `npm run typecheck`: OK
- `npm run build`: OK
- Smoke visual en `dev:browser`: OK, con secuencia observada `Mirando tus horarios -> Chequeando tu jornada -> Midiendo la carga del dia -> Armando el resumen`.

Decisiones
- Mantengo el contrato principal de `plan:simulate` via `invoke`, pero agrego un canal complementario `plan:simulate:progress` para no romper el flujo actual del dashboard.
- El backend cede el event loop entre etapas con una pausa minima para que Electron pinte el avance en pantalla; sin eso, la simulacion local era demasiado rapida y el stream existia pero no se llegaba a ver.
- Extraigo una variante async del simulador (`simulatePlanViabilityWithProgress`) que comparte las mismas reglas que la version sync, asi los tests existentes no divergen del runtime real.

Pendiente
- Falta streaming verdaderamente incremental si mas adelante la simulacion deja de ser local y pasa a usar runtime/LLM.
- Falta modo interactivo con confirmaciones humanas por iteracion.
- Falta propuesta automatica de ajustes despues de un `FAIL`.

Bug o edge case
- En Electron real, el stream depende de que el renderer siga suscrito al plan activo; por ahora el listener filtra por `planId`, que cubre el caso de una sola revision visible a la vez.
- El smoke en browser sigue mostrando un `404` de `favicon.ico`, pero no afecta el flujo funcional de la simulacion.

[2026-03-19 01:46 ART] — Fix tecnico: timeout mas amplio para Ollama local
Completado
- Aumente los timeouts del runtime local `ollama:qwen3:8b` de `20s` a `90s` para chat y stream.
- Mantengo OpenAI en `20s`; el cambio aplica solo al provider local, que era el cuello mas probable de los errores "ocupado" durante el armado del plan.

Archivos tocados
- `src/providers/provider-factory.ts`
- `tests/provider-factory.test.ts`

Tests
- 2 tests nuevos en `tests/provider-factory.test.ts`:
  - `usa timeouts mas amplios para Ollama local`
  - `mantiene timeouts cortos para OpenAI`
- Suite completa revalidada: `71` tests pasando.
- `npm run typecheck`: OK
- `npm run build`: OK

Decisiones
- No subi el timeout global de todos los providers; separo OpenAI y Ollama porque los tiempos de respuesta son muy distintos.
- El objetivo es evitar falsos "busy" en modelos locales sin volver perezoso el manejo de fallas remotas.

Pendiente
- Si el usuario sigue viendo el mismo mensaje despues de este cambio, el siguiente paso es instrumentar el error crudo en renderer para distinguir timeout real de rechazo IPC/preload.

Bug o edge case
- El mensaje visible sigue siendo el friendly `errors.connection_busy`; este cambio ataca la causa mas probable, no el copy.

[2026-03-19 02:25 ART] — Fix critico: Qwen3 thinking model + maxOutputTokens + error logging
### Completado
- Diagnosticado el bug real del plan:build con Ollama: `qwen3:8b` es un modelo "thinking" que gasta tokens en `reasoning` antes de generar `content`. Con `maxOutputTokens: 4096`, el razonamiento consumía todo y `content` volvía vacío → JSON parse fallaba.
- Subido `maxOutputTokens` a 16384 para Ollama (el content real usa ~600-2000 tokens, pero el reasoning puede usar 3000-5000).
- Subido timeout de Ollama de 90s a 180s para dar margen al reasoning + generación.
- Agregado `console.error` con message y stack en el catch de `plan:build` para diagnóstico futuro.
- Verificado end-to-end con curl → Vercel AI SDK → prompt real del builder. Plan se genera en ~9s con JSON válido.

### Archivos tocados
- `src/providers/provider-factory.ts` (maxOutputTokens configurable por provider, 16384 para Ollama)
- `src/main/ipc-handlers.ts` (error logging con stack trace)
- `tests/provider-factory.test.ts` (timeout test actualizado a 180s)

### Tests
- Suite completa revalidada: 73 tests pasando
- `npm run typecheck`: no verificado (pendiente Codex)
- Timeout test actualizado

### Decisiones
- No subí maxOutputTokens global; solo Ollama lo necesita por ser "thinking model"
- 16384 es suficiente: el reasoning de qwen3:8b usa ~3000-5000 tokens, el content ~600-2000
- El timeout de 180s cubre el peor caso de modelos locales lentos sin afectar OpenAI (sigue en 20s)
- El error logging NO expone info sensible; solo message + stack del error de Node

### Pendiente
- Confirmar el fix en Electron real con `npm run dev` + click "Armar con asistente local"
- Considerar agregar detección explícita de `content` vacío en plan-builder como fallback
- typecheck pendiente

### Bug o edge case
- Si Qwen3 cambia el formato de reasoning en futuras versiones de Ollama, el SDK podría dejar de extraer content correctamente
- El `runWithTimeout` tiene un timer leak menor: `rejectId` no se limpia cuando la operación termina exitosamente antes del timeout

[2026-03-19 01:58 ART] — Fix tecnico: builder tolerante por evento
Completado
- Reescribi `plan-builder.ts` para no tirar abajo todo el plan cuando un evento viene "casi bien".
- Ahora normalizo por evento, acepto aliases como `actividades`, `descripcion`, `tarea`, `horario`, `minutos` y completo `objetivoId` con el objetivo principal del perfil cuando falta.
- Agregue tolerancia de categorias (`salud` -> `ejercicio`, etc.) y filtro solo los eventos realmente inutiles.
- Si el modelo manda eventos pero ninguno sobrevive a la normalizacion, el builder sigue fallando con mensaje controlado para no guardar un plan vacio por accidente.

Archivos tocados
- `src/skills/plan-builder.ts`
- `tests/plan-builder.test.ts`

Tests
- 2 tests nuevos en `tests/plan-builder.test.ts`:
  - `recupera eventos si falta objetivoId y usa aliases de categoria`
  - `acepta la clave alternativa "actividades" y filtra eventos rotos`
- Suite completa revalidada: `73` tests pasando.
- `npm run typecheck`: OK
- `npm run build`: OK

Decisiones
- Mantengo estricta la validacion final del plan, pero la hago despues de normalizar y rescatar lo aprovechable por evento.
- No acepto un plan con eventos originales si despues de normalizar no queda ninguno valido; prefiero fallar ahi antes que sembrar un plan silenciosamente vacio.

Pendiente
- Falta una reproduccion automatizada contra la respuesta cruda real de Ollama con el perfil actual; el intento de diagnostico fuera de la app quedo trabado por tooling local y no por el codigo del repo.

Bug o edge case
- Durante el diagnostico dispare un popup de Electron con un script temporal mal resuelto desde `%TEMP%`; no fue un bug del repo, sino de la prueba ad-hoc.
