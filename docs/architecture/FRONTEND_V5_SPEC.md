# Frontend Pipeline v5 — Especificación

> **Status**: Especificación propuesta para la interfaz visual requerida por Pipeline V5.
> **Basado en**: `PIPELINE_V5_SPEC.md`, `PLAN_LAP_FINAL.md`, y `FLUJO_HIBRIDO_DRAFT.md`.
> **Fecha**: 2026-03-25

---

## 1. Visión General

El Frontend para Pipeline V5 debe reflejar el cambio de paradigma de "generador de calendarios monolíticos" (V1) a un **"sistema de planificación adaptativa"** (V5). 

Se mantienen las restricciones arquitectónicas vigentes:
- **Next.js 15 App Router** con React 19.
- **Web-only**: Cero dependencias de Electron o APIs nativas.
- **Abuela-proof**: Cero jerga técnica (nada de "MILP", "LLM", o "CoVe" visible al usuario final).
- **Mobile-first**: La interfaz principal debe ser usable y elegante en dispositivos móviles.

---

## 2. Gate de Acceso, Autenticación y Facturación (Billing)

El "Gate" es la barrera de entrada donde se resuelve quién es el usuario y cómo va a costear el uso inferencial, antes de permitirle simular un plan. Esta solución se basa en la implementación real de componentes como `AccountSection`, `LlmModeSelector`, `WalletSection` y `OwnKeyManager`.

### 2.1. Autenticación y Persistencia
- **Inicio de Sesión y Registro**: Manejado con usuario y contraseña tradicionales. Se priorizan los mensajes claros para éxito y error.
- **Traspaso de Sesión Anónima (Claim)**: Si un visitante comienza el flujo sin cuenta (guardando un `profileId` en `localStorage`), al iniciar sesión el sistema automáticamente llama a `/api/auth/claim-local-data` para anexar todo ese progreso anónimo a su nueva cuenta definitiva.

### 2.2. Selección de Modalidad de Servicio (Modelos)
La UI debe mantener la premisa "Abuela-proof" al elegir cómo se paga la IA:
- **Línea Normal ("Pulso")**: Promovida por defecto. Se presenta como un servicio gestionado donde se recarga saldo ("como comprar un café"). Evita mencionar qué LLM específico corre de fondo para no confundir.
- **Línea Avanzada**: Oculta tras un botón desplegable (`advancedVisible`). Aquí el usuario técnico puede elegir usar el servicio administrado, "Own Key" (claves propias), o modos de debug internos como "Codex".

### 2.3. Pago por Uso (Wallet Connect)
Si el usuario opta por la Línea Normal ("Pulso"):
- **Conexión Lightning**: La interfaz provee un campo para pegar un connection string de Nostr Wallet Connect (NWC). 
- **Feedback de Saldo**: Tras conectar, la UI revela dinámicamente el `WalletStatus`, mostrando el balance disponible en satoshis (Sats).
- **Estimación Clara**: **Vital:** Antes de obligar al usuario a conectar la billetera, el paso 0 de la UI debe mostrar exactamente un rango de cuánto costará la generación.

### 2.4. Gestión de Claves Propias (Bring Your Own Key)
Para los usuarios avanzados que seleccionan "Own Key":
- **Bóveda Cifrada Local**: Las claves de OpenAI u OpenRouter no se envían libres. El usuario provee una contraseña de protección *solo para el cliente*, cifrando la clave en el Local Storage.
- **Backup Seguro**: Si el usuario está logueado, se habilita la opción de subir un backup cifrado de sus claves a su bóveda en el servidor (`vault/backup`).

---

## 3. Flujo de Intake y Construcción (Actualizado para V5)

### 2.1. Captura y Priorización de Objetivos
- **Múltiples Objetivos**: El input inicial debe permitir registrar varios objetivos a la vez.
- **Priorización Visual (Drag & Drop)**: Si el usuario ingresa más de un objetivo, el frontend debe solicitarle que los ordene por prioridad. Esta prioridad es el input crítico para el Fase 6 (Scheduler) y los trade-offs.

### 2.2. Intake Dinámico y Anti-Fatiga
- **Bloques Cortos**: Máximo 5 preguntas por pantalla.
- **Auto-guardado**: Almacenar progreso en background mediante llamados a API (checkpointing) sin bloquear la UI.
- **Barra de Progreso**: Indicador visual explícito ("Calculamos que vamos por el 50% de las preguntas").

### 2.3. Loading & Streaming UX
- Las Fases 4 a 12 de V5 toman tiempo (LLMs paralelos, Solver MILP, CoVe, etc.).
- **Skeleton Loaders Semánticos**: En lugar de un "loader spinner" genérico, mostrar el estado del pipeline: *"Clasificando objetivos..."* → *"Buscando estrategias..."* → *"Encajando tareas en tu agenda..."* → *"Simulando primera semana..."*.
- Las conexiones deben recuperar el stream (SSE) si se interrumpen para retomar desde el último pipeline chunk.

---

## 4. Resolutor de Conflictos (Trade-offs UX)

Una de las grandes innovaciones de V5 es que cuando la agenda no da abasto, el **Scheduler MILP** devuelve alternativas. El Frontend debe presentar estas decisiones de forma humana.

### 3.1. Pantalla de Ajuste de Expectativas
- Si hay un desfase entre horas necesarias y disponibles (Hard Validation / Solver Output).
- **Plan A vs Plan B**: Mostrar tarjetas comparativas ("Plan A: Entrenar 3 días y avanzar rápido con guitarra" vs "Plan B: Entrenar 5 días y patear guitarra al mes que viene").
- Mostrar las **Actividades No Agendadas (Unscheduled)** con sugerencias en lenguaje natural devueltas por el "Explainer" (`suggestion_esAR`).

---

## 5. El Dashboard Multi-Vista (Rolling Wave)

V5 divide el plan en 3 capas (Esqueleto, Detalle, Operacional). El frontend ya no asume un calendario 100% rígidamente mapeado a 12 semanas.

### 4.1. Las 4 Vistas Fundamentales
1. **Calendario (Vista de Hoy / Semanal)**:
   - Visualización por bloques (Time-blocks).
   - En Mobile: **Cards verticales colapsables**, *no* vista tipo Gantt imposible de leer.
2. **Checklist (FlexTasks & Tareas del Día)**:
   - Para items tipo `flex_task` que no tienen horario fijo sino deadline (`deadlineAt`).
3. **Tracker de Métricas y Hábitos (`metric` & HabitState)**:
   - Gráficos minimalistas para las métricas (`MetricItem`).
   - El "HabitState" (Nivel del hábito) no se resetea por fallar un día. Mostrar progreso "monotónico" gamificado (ej. "Nivel 4 de Guitarra - Protegido").
4. **Semáforo de Riesgo (Risk Forecast)**:
   - Un panel lateral o widget que alerte amigablemente sobre adherencia. (Ej: "La meta de ahorro viene con fricción, ¿querés que recalculemos?").

### 4.2. Renderizado Polimórfico de `PlanItem`
El frontend debe tener un componente Registry o Factory para pintar distintos tipos de items, dado que V5 expulsa `PlanItemKind`:
- `<TimeEventCard />`: Muestra hora, duración, recurrencia. Botones rápidos: [Hecho] [Mover].
- `<FlexTaskCard />`: Muestra deadline, tamaño de bloque sugerido.
- `<MilestoneCard />`: Resalta entregables mayores, muestra dependencias bloqueantes (si las hay).
- `<MetricInputCard />`: Input rápido para reportar un número (peso, ahorros) y botón de + / -.
- `<TriggerRuleAlert />`: Para eventos condicionales ("Hoy llueve, se disparó la regla de entrenar indoors").

---

## 6. Adaptación y Ejecución (El Loop Activo)

El plan V5 muta durante la ejecución. La UI debe facilitar esta interacción.

### 5.1. Manejo del Fracaso sin Culpa
- Botón **"No llegué a hacerlo"** de fácil acceso en las tareas.
- En base al tipo de adaptación de V5 (ABSORB, PARTIAL_REPAIR, REBASE), la UI reacciona distinto:
  - **ABSORB**: La UI reajusta un par de tarjetas animándolas a nuevos horarios (Slack buffer). Feedback casi instantáneo.
  - **PARTIAL_REPAIR**: Se pide confirmación breve. "Redistribuí 4 tareas para que llegues bien al viernes. ¿Validamos?".
  - **REBASE**: Proceso más profundo, muestra un loader explícito (similar a crear el plan la primera vez).

### 5.2. Edición Directa y Auto-Guardado
- El usuario puede editar labels, arrastrar el día de una tarea.
- **Lock UI Mutex**: Si el LLM/Solver está re-calculando una reparación, bloquear interacciones destructivas en la UI de ese bloque para evitar race-conditions.
- **Auto-Save**: Los cambios manuales deben salvarse automáticamente cada pocos segundos en estado `draft` o aplicar diff en backend.

---

## 7. Integraciones Opcionales

### 6.1. Calendario Existente (Sync)
- Mecanismo manual "Tap-to-select" (matriz sencilla para marcar indisponibilidad, ideal para mobile).
- Ocultar subida de `.ics` en "Avanzado" debido a la mala UX en dispositivos móviles.

### 6.2. Inspector y Debug
- El `FlowViewer` y `DebugPanel` se mantienen como herramientas de diagnóstico pero **estrictamente separadas de la vista de cliente final**.
- Útil para observar los logs del Solver MILP, las trazas del CoVe y los parches de reparación del Agentic Engine.

---

## 8. Criterios de Aceptación Técnicos Frontend

1. **Jerarquías Claras**: Uso estricto de Server Components para vistas pesadas y Client Components solo para interactividad (`onClick`, Drag & Drop).
2. **Typesafety**: Toda la UI debe alimentar y consumir de los nuevos esquemas Zod polimórficos (`PlanItem`, `GoalClassification`).
3. **Manejo de Errores**: Error Boundaries por componente de vista (si falla el renderizado del calendario, el tracker de hábitos debe seguir visible).
4. **Performance**: Las animaciones de reubicación de tareas (ABSORB mode) deben operar a 60fps usando CSS Transforms o librerías optimizadas como Framer Motion (si se define como estándar del proyecto).
