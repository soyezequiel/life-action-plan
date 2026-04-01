# Continuacion Web Next.js de LAP

## Contexto

- Estado actual: web app Next.js 15 con App Router
- Entorno local vigente: PostgreSQL local + Ollama local
- Target de deploy: Vercel + PostgreSQL cloud + LLM cloud
- Flujo core a preservar: `intake -> build -> dashboard -> inspector`
- Regla operativa: ejecutar un div por vez y cerrarlo con evidencia automatica y visible

## Divs

### DIV-001 - Source of truth limpio
- Objetivo: alinear `README.md`, `AGENTS.md`, `docs/architecture/REGISTRY.json` y documentos operativos con el estado real del repo
- Incluye: stack actual, scripts reales, rutas reales, entorno local real
- Excluye: cambios de producto
- Cierre: no quedan instrucciones activas que pidan Electron, SQLite o `dev:electron`
- Estado: cerrado el 2026-03-20

### DIV-002 - Limpieza legacy del repo
- Objetivo: remover o aislar residuos que confunden a futuros agentes
- Incluye: directorios vacios legacy, referencias historicas, archivos de apoyo obsoletos, notas de compatibilidad
- Excluye: refactors funcionales
- Cierre: un agente nuevo puede recorrer el repo sin inferir una arquitectura incorrecta
- Estado: cerrado el 2026-03-20

### DIV-003 - Smoke local reproducible
- Objetivo: dejar un flujo local confiable para esta maquina
- Incluye: chequeo de `DATABASE_URL`, PostgreSQL local, Ollama local, `db:push`, `npm run dev`
- Excluye: deploy cloud
- Cierre: el flujo `intake -> build con Ollama -> dashboard -> inspector` se puede repetir sin pasos ocultos
- Estado: cerrado el 2026-03-20

### DIV-004 - Inspector como gate de calidad
- Objetivo: usar el inspector LLM como criterio de aceptacion para operaciones largas
- Incluye: trazas visibles, snapshot consistente, errores visibles, apertura tardia, estado estable bajo HMR
- Excluye: features nuevas del builder
- Cierre: cualquier build o simulate deja una traza visible o un error visible
- Estado: cerrado el 2026-03-20

### DIV-005 - Ruta real vs fallback
- Objetivo: evitar validaciones ambiguas
- Incluye: copy y estados visibles que diferencien backend real, fallback y demo
- Excluye: rediseno general
- Cierre: ninguna corrida puede confundirse con un mock silencioso
- Estado: cerrado el 2026-03-20

### DIV-006 - Vercel readiness
- Objetivo: separar claramente lo que vale para local y lo que vale para deploy
- Incluye: env vars requeridas, proveedor cloud para Vercel, timeouts, `vercel.json`, smoke de build
- Excluye: auth full y multi-tenant
- Cierre: el repo tiene instrucciones y criterio claros para subirlo sin depender de Ollama
- Estado: cerrado el 2026-03-20

### DIV-007 - Polish UX
- Objetivo: consolidar jerarquia visual, accesibilidad y estados de carga
- Incluye: dashboard, intake, settings, feedback de progreso, reduced motion
- Excluye: cambios de arquitectura
- Cierre: el flujo principal queda consistente en desktop y mobile
- Estado: cerrado el 2026-03-20

### DIV-008 - Wallet y costos
- Objetivo: llevar NWC y costos a estado de producto
- Incluye: conexion, desconexion, presupuesto, errores y costo visible por operacion
- Excluye: facturacion avanzada
- Cierre: el usuario entiende si una accion gasto sats, estimo costo o no tuvo costo
- Estado: cerrado el 2026-03-20

### DIV-009 - Modelo persistido de cobro
- ID: DIV-009
- Titulo corto: Modelo persistido de cobro
- Objetivo: definir y persistir el contrato canonico que une operacion, estimacion, intento de cobro y resultado final.
- Que se implementa: tabla o extension coherente para registrar por operacion el estado del cobro, monto estimado, monto cobrado o rechazado, motivo de skip o rechazo, referencias Lightning y helpers de DB con tipos compartidos y tests de contrato.
- Que no se implementa: decision de negocio sobre cuando cobrar, ejecucion NWC ni cambios de UI.
- Dependencias: DIV-008
- Precondiciones: wallet, costos y tracking actuales relevados sobre el repo vigente.
- Criterio de finalizacion: existe un modelo persistido consultable desde backend que diferencia `pending`, `paid`, `rejected`, `skipped` y `failed`, con tests automatizados del contrato y este documento actualizado con el estado real.
- Notas para la siguiente unidad: deja lista la base de datos y los contratos compartidos para montar el dominio de cobro.
- Estado: cerrado el 2026-03-20

### DIV-010 - Dominio server-side de cobro Lightning
- ID: DIV-010
- Titulo corto: Dominio server-side de cobro Lightning
- Objetivo: encapsular la decision y la ejecucion del cobro fuera de los route handlers.
- Que se implementa: servicios y helpers que validan billetera conectada, leen saldo y presupuesto, deciden si una operacion puede cobrarse, ejecutan el flujo Lightning con NWC, normalizan errores y actualizan el tracking de cobro.
- Que no se implementa: acoplar el dominio directamente a `plan/build`, rediseñar UI ni agregar alternativas cliente como camino principal.
- Dependencias: DIV-009
- Precondiciones: contrato persistido de cobro disponible y NWC vigente como provider soportado.
- Criterio de finalizacion: existe una API interna reutilizable para evaluar y ejecutar cobros con tests de dominio sobre casos pagado, rechazado, salteado y fallido.
- Notas para la siguiente unidad: deja listas las primitivas para integrar cobro real en las operaciones del producto.
- Estado: cerrado el 2026-03-20

### DIV-011 - Integracion de cobro en operaciones reales
- ID: DIV-011
- Titulo corto: Integracion de cobro en operaciones reales
- Objetivo: conectar el dominio de cobro con las operaciones del producto sin dejar estados ambiguos.
- Que se implementa: integracion prioritaria en `plan/build` y extension a `plan/simulate` solo si corresponde, con trazabilidad completa entre solicitud, estimacion, cobro real o rechazo y resultado de la operacion.
- Que no se implementa: rediseño visual amplio, facturacion avanzada ni flows de deploy cloud.
- Dependencias: DIV-010
- Precondiciones: dominio de cobro estable y modelo persistido listo para consultas.
- Criterio de finalizacion: `plan/build` deja claro si cobro, estimo, rechazo, fallo o fue gratis/local, la operacion se bloquea cuando no puede cobrarse y el flujo local con Ollama gratis sigue funcionando.
- Notas para la siguiente unidad: deja el backend consistente para reflejar estados de cobro en la UI.
- Estado: cerrado el 2026-03-20

### DIV-012 - UI clara de wallet y cobro
- ID: DIV-012
- Titulo corto: UI clara de wallet y cobro
- Objetivo: hacer entendible para una persona no tecnica el estado de su billetera, presupuesto y cobros por accion.
- Que se implementa: ajustes en dashboard, settings, contratos cliente e i18n para mostrar si la billetera esta lista, si una accion iba a cobrar, si cobro, si fue gratis/local o si fallo por conexion, saldo o presupuesto.
- Que no se implementa: nuevas rutas de backend ni un rediseño completo del producto.
- Dependencias: DIV-011
- Precondiciones: operaciones reales ya emiten estados de cobro consistentes.
- Criterio de finalizacion: la UI refleja estados claros sin jerga tecnica y mantiene coherencia con backend y persistencia.
- Notas para la siguiente unidad: deja la experiencia lista para documentar y ejecutar el smoke final.
- Estado: cerrado el 2026-03-20

### DIV-013 - Smoke local de cobro real
- ID: DIV-013
- Titulo corto: Smoke local de cobro real
- Objetivo: dejar una validacion visible y repetible del flujo de cobro Lightning real en entorno local.
- Que se implementa: smoke o matriz operativa actualizada con evidencia para billetera conectada, operacion cobrable, operacion gratis/local, rechazo por presupuesto o saldo y tracking consistente en DB o UI.
- Que no se implementa: automatizacion de deploy ni escenarios fuera del entorno local soportado hoy.
- Dependencias: DIV-012
- Precondiciones: backend, UI y tracking de cobro ya estan integrados.
- Criterio de finalizacion: existe una guia o smoke repetible y ejecutado que deja evidencia automatica y visible de los casos criticos de cobro.
- Notas para la siguiente unidad: deja la etapa lista para seguir con productoizacion o nuevos cobros sobre otras operaciones.
- Estado: bloqueado por entorno el 2026-03-20

## Registro de avance

- 2026-03-20 - Se redefine el plan operativo a web-only. Electron sale del plan vigente y queda solo como antecedente historico.
- 2026-03-20 - DIV-001 cerrado. `README.md`, `AGENTS.md`, `docs/architecture/REGISTRY.json` y documentos operativos quedan alineados con la app web actual.
- 2026-03-20 - DIV-002 cerrado. `CLAUDE.md` se ajusta a la realidad local y de deploy, `CODEX_LOG.md` queda marcado como historico, los iconos pasan a `public/`, se eliminan assets desktop de `build/` y `resources/`, y los errores base de API se centralizan con copy reutilizable.
- 2026-03-20 - Nota operativa: no correr `npm run typecheck` en paralelo con `npm run build` en Next.js 15 porque la regeneracion de `.next/types` puede producir falsos `TS6053`.
- 2026-03-20 - DIV-003 cerrado. `drizzle.config.ts` ya carga `.env.local`, se agregan `npm run doctor:local` y `npm run smoke:local`, el smoke local verifica PostgreSQL, tablas base y Ollama, y la documentacion operativa queda alineada con ese flujo reproducible.
- 2026-03-20 - DIV-004 cerrado. El inspector muestra estado explicito del snapshot, `Limpiar` borra trazas reales del servidor, y el smoke visible confirma apertura tardia, build con traza activa y limpieza efectiva desde UI.
- 2026-03-20 - DIV-005 cerrado. Dashboard y settings muestran si el plan salio por ruta online, local o respaldo local, y el progreso expone la ruta activa para que fallback y exito real no se mezclen en la UI.
- 2026-03-20 - DIV-006 cerrado. Vercel queda separado de local: el frontend oculta el build local en cloud, el backend bloquea Ollama y fallback local en deploy, las rutas largas exportan `maxDuration`, y se agregan `doctor:deploy` y `smoke:deploy` para readiness.
- 2026-03-20 - DIV-007 cerrado. Dashboard, intake y settings quedan con mejor jerarquia visual, hints de contexto, avance por teclado, reduced motion y estados mas claros; el smoke visible se revalida con restart limpio de `npm run dev` en `localhost:3000`.
- 2026-03-20 - DIV-008 cerrado. Dashboard muestra estado de billetera mas claro, alias/saldo/presupuesto cuando existen, y el costo del plan diferencia entre estimacion y resolucion local sin costo; `getCostSummary()` ahora entrega desglose por operacion y el smoke visible confirma el caso local sin gasto tras restart limpio de `npm run dev`.
- 2026-03-20 - Se agregan DIV-009 a DIV-013 para llevar wallet y costos a cobro Lightning real por operacion, con contrato persistido, dominio server-side, integracion en `plan/build`, UI clara y smoke local repetible.
- 2026-03-20 - DIV-009 cerrado. Se agrega `operation_charges` como contrato persistido del cobro por operacion, `cost_tracking` ahora puede enlazar cada intento con su charge record, existen helpers de DB y tipos compartidos para estados y razones, `npm run test` y `npm run build` pasan, y `npm run db:push` deja la tabla materializada en PostgreSQL local.
- 2026-03-20 - DIV-010 cerrado. Se mueve el acceso a secretos y settings de wallet a capas reutilizables en `src/lib/`, se incorpora `src/lib/payments/operation-charging.ts` con `canChargeOperation`, `chargeOperation` y `recordChargeResult`, se normalizan rechazo, skip y fallo Lightning, y `.env.example` ya declara el receptor NWC server-side requerido para cobro real; `npm run test` y `npm run build` pasan.
- 2026-03-20 - DIV-011 cerrado. `app/api/plan/build/route.ts` crea el charge record antes del build, bloquea el flujo si el precheck rechaza el cobro, resuelve skip o cobro real antes de persistir el plan, enlaza `cost_tracking` con `chargeId`, y devuelve el estado del cobro en la respuesta SSE; se agregan tests de route para bloqueo y cobro exitoso, y `npm run test` junto con `npm run build` pasan.
- 2026-03-20 - DIV-012 cerrado. Dashboard y settings ahora muestran si la billetera esta lista para cobrar, si el build online va a cobrar, si una operacion cobro, fallo, fue rechazada o quedo gratis/local; se corrigen las claves i18n nuevas de cobro, y `npm run test` junto con `npm run build` pasan.
- 2026-03-20 - DIV-013 queda bloqueado por entorno. Se agregan `doctor:local:charge`, `smoke:local:charge` y `charge:report`, `local-doctor` ahora exige `operation_charges` y puede validar readiness de receiver NWC, y `matriz-smoke-web.md` documenta el flujo repetible para casos `paid`, `skipped` y `rejected`; en esta maquina faltan `LAP_LIGHTNING_RECEIVER_NWC_URL` y cualquier wallet NWC guardada, por eso no se pudo ejecutar un cobro Lightning real exitoso ni un rechazo real por saldo o presupuesto.
