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
