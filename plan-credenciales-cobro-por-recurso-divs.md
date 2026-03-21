# Refactor De Credenciales Y Cobro Por Recurso

## Contexto
- Objetivo del plan: separar credenciales, resolucion de ejecucion y politica de cobro para que el sistema cobre solo cuando el recurso pertenece al backend.
- Fuente: pedido del usuario para persistir claves de servidor, soportar API del backend vs API del usuario y aplicar la misma regla a LLM cloud y local.
- Ruta del documento: `plan-credenciales-cobro-por-recurso-divs.md`
- Supuestos:
  - El flujo prioritario a refactorizar es `plan/build`, dejando `plan/simulate` alineado despues.
  - El producto seguira soportando proveedores cloud y Ollama, pero la regla de cobro ya no dependera del nombre del proveedor.
  - "Backend-local" significa recurso ejecutado en infraestructura del servidor aunque el modelo sea local.
  - "User-local" significa recurso ejecutado en la maquina o entorno del usuario, fuera de la infraestructura del backend.
- Regla operativa: ejecutar y revisar un solo div a la vez.
- Consumo esperado: este documento esta pensado para que cada div sea ejecutado en una sola corrida por `$implementar-div-atomico` o, si se necesita aislamiento, por `$coordinar-div-orquestado`.

## Divs

### DIV-001 - Contrato de origen del recurso
- ID: DIV-001
- Estado: cerrado el 2026-03-21
- Evidencia: `npm run test`, `npm run build`, `npm run typecheck`
- Titulo corto: Contrato de origen del recurso
- Objetivo: definir un contrato unico para describir de donde sale el recurso usado en cada ejecucion.
- Que se implementa: tipos compartidos y contrato de dominio para `resourceOwner`, `executionTarget`, `credentialSource`, `provider`, `model`, `chargePolicy` y `executionMode`; tablas de decision validas y estados permitidos.
- Que no se implementa: persistencia, UI, cobro real ni cambios en handlers existentes.
- Dependencias: ninguna
- Precondiciones: relevamiento confirmado del flujo actual de build, credenciales y cobro.
- Criterio de finalizacion: existe un contrato compartido y estricto que permite distinguir sin ambiguedad entre `backend`, `user`, `cloud`, `backend-local` y `user-local`, y el resto de los divs lo puede tomar como source of truth.
- Notas para la siguiente unidad: deja lista la base semantica para persistir credenciales y resolver ejecuciones sin condicionales dispersos.

### DIV-002 - Registro persistente de credenciales
- ID: DIV-002
- Estado: cerrado el 2026-03-21
- Evidencia: `npm run test`, `npm run build`, `npm run typecheck`
- Titulo corto: Registro persistente de credenciales
- Objetivo: crear una estructura persistente y extensible para guardar credenciales del backend y del usuario.
- Que se implementa: schema y helpers de DB para un registro de credenciales con campos como `owner`, `provider`, `secretType`, `encryptedValue`, `label`, `status`, `lastValidatedAt`, `lastValidationError`, `createdAt`, `updatedAt`; operaciones de crear, leer, actualizar, desactivar y validar.
- Que no se implementa: seleccion automatica de credenciales, UI de gestion ni integracion con build.
- Dependencias: DIV-001
- Precondiciones: politica de cifrado server-side definida o reuso del mecanismo actual de secretos.
- Criterio de finalizacion: backend puede persistir varias credenciales por provider y owner sin usar claves hardcodeadas por proveedor en distintos archivos.
- Notas para la siguiente unidad: deja preparado un registro unificado para backend credentials y user-provided credentials.

### DIV-003 - API de configuracion de credenciales
- ID: DIV-003
- Estado: cerrado el 2026-03-21
- Evidencia: `npm run test`, `npm run typecheck`, `npm run build`
- Titulo corto: API de configuracion de credenciales
- Objetivo: exponer una capa clara para guardar, leer y validar credenciales sin mezclar esa logica con ejecucion o billing.
- Que se implementa: contratos Zod estrictos y endpoints o servicios server-side para listar credenciales disponibles, guardar una nueva, actualizar una existente, validarla y marcarla como activa/inactiva segun owner y provider.
- Que no se implementa: ejecucion del build, politica de cobro ni seleccion automatica desde UI final.
- Dependencias: DIV-002
- Precondiciones: registro persistente de credenciales disponible.
- Criterio de finalizacion: existe una API o servicio de configuracion que permite operar credenciales de backend y de usuario como recursos de primer nivel, con errores claros y sin asumir solo OpenAI/OpenRouter.
- Notas para la siguiente unidad: deja lista la entrada formal de credenciales para el resolvedor de ejecucion.

### DIV-004 - Resolucion del contexto de ejecucion
- ID: DIV-004
- Estado: cerrado el 2026-03-21
- Evidencia: `npm run test`, `npm run typecheck`, `npm run build`
- Titulo corto: Resolver contexto de ejecucion
- Objetivo: centralizar en una sola capa la decision de que recurso se va a usar para ejecutar cada operacion.
- Que se implementa: modulo de dominio `execution-context` que reciba la intencion de uso y resuelva `provider`, `model`, `resourceOwner`, `executionTarget`, `credentialId`, `credentialSource` y `canExecute`; reglas explicitas para `backend cloud`, `user cloud`, `backend-local` y `user-local`.
- Que no se implementa: cobro Lightning, UI final ni cambios amplios de tracking.
- Dependencias: DIV-001, DIV-003
- Precondiciones: credenciales configurables disponibles y contrato de origen cerrado.
- Criterio de finalizacion: cualquier operacion puede pedir un contexto de ejecucion y obtener una respuesta explicita, sin resolver API key o modo local directamente dentro del route handler.
- Notas para la siguiente unidad: deja listo el insumo exacto que necesita la politica de billing.

### DIV-005 - Politica central de billing por origen
- ID: DIV-005
- Estado: cerrado el 2026-03-21
- Evidencia: `npm run test`, `npm run typecheck`, `npm run build`
- Titulo corto: Politica central de billing
- Objetivo: mover la decision de cobro a una capa unica basada solo en el origen del recurso.
- Que se implementa: modulo `billing-policy` que reciba el contexto de ejecucion y devuelva `chargeable`, `skipReason`, `billableOperation`, `estimatedAmountStrategy` y mensajes de negocio; regla canonica: `backend => cobrar`, `user => no cobrar`.
- Que no se implementa: ejecucion real del pago, UI de wallet ni reglas de timeout/modelo.
- Dependencias: DIV-004
- Precondiciones: contexto de ejecucion ya resuelto antes del build.
- Criterio de finalizacion: la app puede decidir de forma centralizada si corresponde cobrar o no sin mirar directamente si el modelo es `ollama`, `openai` u `openrouter`.
- Notas para la siguiente unidad: deja resuelto el criterio de negocio para integrar build y simulate sin duplicacion.

### DIV-006 - Integracion del build con contexto y billing
- ID: DIV-006
- Estado: cerrado el 2026-03-21
- Evidencia: `npm run test`, `npm run typecheck`, `npm run build`, `npm run smoke:local`
- Titulo corto: Build con contexto resuelto
- Objetivo: refactorizar `plan/build` para que ejecute usando contexto resuelto y politica de billing, no condicionales sueltos.
- Que se implementa: integracion del route handler y servicios asociados para pedir `executionContext`, elegir credencial efectiva desde esa capa, consultar `billingPolicy`, registrar la decision y ejecutar con el runtime correcto; soporte de `backend cloud`, `user cloud`, `backend-local` y rechazo limpio de `user-local` si el producto no puede ejecutarlo desde backend.
- Que no se implementa: cambios visuales grandes en dashboard/settings ni soporte de simulate.
- Dependencias: DIV-004, DIV-005
- Precondiciones: contratos y servicios de resolucion/billing estables.
- Criterio de finalizacion: `plan/build` deja claro en backend si uso recurso del backend o del usuario, y el cobro sale solo de esa informacion.
- Notas para la siguiente unidad: deja un caso real ya migrado para extender la misma estructura a otras operaciones.

### DIV-007 - Integracion de operaciones secundarias
- ID: DIV-007
- Estado: cerrado el 2026-03-21
- Evidencia: `npm run test`, `npm run typecheck`, `npm run build`
- Titulo corto: Extender a simulate y futuras operaciones
- Objetivo: reutilizar el mismo esquema de resolucion y billing fuera de `plan/build`.
- Que se implementa: adaptacion de `plan/simulate` y cualquier otra operacion cobrable o gratuita para pedir contexto de ejecucion y politica de billing, reusando los mismos contratos y helpers.
- Que no se implementa: nuevas features de producto ni nuevos proveedores fuera del marco ya definido.
- Dependencias: DIV-006
- Precondiciones: build ya funcionando con el nuevo esquema.
- Criterio de finalizacion: al menos una operacion adicional usa exactamente el mismo mecanismo de resolucion y la politica de cobro queda reutilizada, no copiada.
- Notas para la siguiente unidad: deja listo el backend para exponer una UX coherente.

### DIV-008 - UI de seleccion de recurso
- ID: DIV-008
- Estado: cerrado el 2026-03-21
- Evidencia: `npm run test`, `npm run typecheck`, `npm run build`
- Titulo corto: UI de recurso y credencial
- Objetivo: hacer visible para una persona no tecnica si esta usando recurso del sistema o suyo y si eso va a cobrar.
- Que se implementa: ajustes de settings y dashboard para mostrar opciones como "usar recurso del sistema" y "usar mi recurso", estado de credencial activa, origen del recurso, si corresponde cobro y por que; textos via i18n sin jerga tecnica.
- Que no se implementa: rediseño visual amplio ni soporte UX para escenarios que el backend todavia no pueda ejecutar.
- Dependencias: DIV-006, DIV-007
- Precondiciones: backend ya distingue resource owner y charge policy.
- Criterio de finalizacion: un usuario puede entender antes de ejecutar si la accion usa recurso del backend o del usuario y si eso genera cobro o no.
- Notas para la siguiente unidad: deja la experiencia lista para trazabilidad y smoke final.

### DIV-009 - Trazabilidad de recurso y cobro
- ID: DIV-009
- Estado: pendiente
- Titulo corto: Trazabilidad por origen
- Objetivo: registrar de punta a punta que recurso se uso y como impactó en el cobro.
- Que se implementa: tracking persistente de `resourceOwner`, `executionTarget`, `credentialSource`, `chargeDecision`, `chargeReason`, `estimatedCost`, `actualCost`, `provider`, `model` y referencias de pago o skip en analytics, manifests o tablas de tracking.
- Que no se implementa: dashboards analiticos nuevos ni reportes externos.
- Dependencias: DIV-006
- Precondiciones: build ya ejecuta con contexto resuelto y billing policy.
- Criterio de finalizacion: cada ejecucion deja evidencia verificable de si uso recurso del backend o del usuario y por que se cobro o no se cobro.
- Notas para la siguiente unidad: deja lista la evidencia para migracion y smoke.

### DIV-010 - Migracion y compatibilidad
- ID: DIV-010
- Estado: pendiente
- Titulo corto: Migracion del sistema actual
- Objetivo: absorber el esquema actual de claves guardadas y cobros sin romper el flujo local ni dejar estados ambiguos.
- Que se implementa: estrategia de migracion desde claves actuales por provider a registro unificado, compatibilidad temporal con configuraciones existentes, defaults razonables y limpieza de puntos legacy donde el cobro depende del nombre del modelo.
- Que no se implementa: eliminacion inmediata de todos los paths legacy si todavia son necesarios para migracion segura.
- Dependencias: DIV-002, DIV-006, DIV-009
- Precondiciones: nuevo esquema funcional y trazable.
- Criterio de finalizacion: usuarios actuales no pierden sus credenciales guardadas y el sistema deja de depender de shortcuts como "ollama es gratis" para decidir cobros.
- Notas para la siguiente unidad: deja el terreno listo para smoke final y endurecimiento.

### DIV-011 - Smoke y validacion visible
- ID: DIV-011
- Estado: pendiente
- Titulo corto: Smoke por origen del recurso
- Objetivo: demostrar que la regla de negocio funciona igual para cloud y local segun quien aporta el recurso.
- Que se implementa: matriz de smoke y evidencia repetible para estos casos: backend cloud con cobro, user cloud sin cobro, backend-local con cobro, user-local sin cobro o bloqueo explicito si no se soporta desde backend, y trazabilidad consistente en DB/UI.
- Que no se implementa: monitoreo continuo ni automatizacion de infraestructura externa.
- Dependencias: DIV-008, DIV-009, DIV-010
- Precondiciones: todos los caminos principales del nuevo esquema ya integrados.
- Criterio de finalizacion: existe evidencia automatica y visible de que el cobro depende del owner del recurso y no del nombre del proveedor o del modelo.
- Notas para la siguiente unidad: deja cerrado el refactor con una politica de uso y cobro coherente para futuras extensiones.
- Avance 2026-03-21: existe `resource:report` y `smoke:local:resource` para verificar `executionMode`, `resourceOwner`, `credentialSource` y `billing` desde `operation_charges`.
- Avance 2026-03-21: existe `smoke:resource:policy` con evidencia automatica y visible de `backend-cloud` cobrado, `user-cloud` sin cobro, `backend-local` cobrado y `user-local` bloqueado de forma explicita, sin depender de wallet externa.
- Avance 2026-03-21: sigue faltando evidencia real en DB/UI para reemplazar filas legacy `sin-contexto`; eso depende de cerrar DIV-008, DIV-009 y DIV-010 o de ejecutar corridas reales nuevas con el esquema ya migrado.
