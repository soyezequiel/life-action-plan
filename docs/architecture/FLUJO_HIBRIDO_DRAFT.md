# Flujo Híbrido LAP v1 — Corregido post-simulación

> Combina lo mejor de v3 (checkpoints, chequeo de realidad, simulación acotada)
> con la visión actual (gate, intake dinámico por LLM, diagramas, top-down).
> Corregido con 11 deficiencias encontradas en simulación.

---

## Paso 0: Gate de acceso

```
INICIO:
  Leer estado del usuario.
  ¿Tiene sesión previa con checkpoint?
    Sí → ir a REANUDACIÓN (Lógica no destructiva)
    No → continuar

  ¿Tiene créditos o LLM configurado?
    No → mostrar menú simplificado (Abuela-proof):
         Opciones: 
         1. "Usar Pulso (Recarga mínima requerida, como comprar un café)" 
         2. "Modo Desarrollador (Ingresa tu propia clave de API)" (Oculto bajo "Avanzado")
         Si elige opción 1:
           Explicar los costos en "cafés". Ocultar jerga técnica "Nostr/Bitcoin/Lightning" detrás de pasos UI amigables.
           → ir a GATE_WALLET
    Sí → continuar
  
  → ir a PASO 1
```

**FIX #1**: Se muestra estimación de costo ANTES de pedir configurar billetera.
**FIX #12 UX**: Eliminación de jerga cripto hostil para usuarios no técnicos. Ocultamiento de la opción de API Key bajo "Avanzado".

---

## Paso 1: Objetivos

```
PASO 1: OBJETIVOS
  Preguntar al usuario: "¿Qué querés lograr?"
  Campo de texto libre, conversacional.
  Permitir múltiples objetivos en una sola respuesta o de a uno.

  El LLM recibe los objetivos y para CADA UNO determina:
    - Categoría (carrera, salud, finanzas, educación, hobby, mixto)
    - Horizonte temporal estimado
    - Esfuerzo relativo (bajo/medio/alto)

  Si hay múltiples objetivos:
    Mostrar lista y pedir PRIORIZACIÓN:
    "Ordená tus objetivos de más a menos importante.
     Esto nos ayuda a decidir qué priorizar si el tiempo no alcanza."
    El usuario arrastra/ordena o numera.

  El LLM genera la lista unificada de datos que necesita
  (evitando preguntar lo mismo para objetivos distintos).

  checkpoint = "objetivos-capturados"
```

**FIX #7**: Soporta múltiples objetivos de entrada.
**FIX #9**: Pide priorización explícita para resolver conflictos de tiempo.

---

## Paso 2: Intake dinámico (dirigido por LLM)

```
PASO 2: INTAKE DINÁMICO
  El LLM genera un MINI cuestionario a partir de los objetivos dados.
  
  Reglas anti-fatiga:
    - Máximo 5 preguntas por pantalla (para evitar scroll infinito).
    - Máximo 3 pantallas temáticas en total.
    - MOSTRAR BARRA DE PROGRESO explícita ("Vamos por el 30%").
    - Si el objetivo original es muy vago (ej: "mejorar mi vida"), el LLM destina el primer bloque 
      a convertirlo en un objetivo SMART interactuando con el usuario, antes de preguntar rutinas.

  Para cada pregunta:
    - Formato conversacional, no formulario denso.
    - Si el usuario responde vago o saltando detalle: el LLM infiere un default, avisa sutilmente y SIGUE sin bloquear la UI con validaciones tediosas.

  Auto-guardado: cada input se guarda disparando un checkpoint parcial.
  
  checkpoint final = "intake-completado"
```

**FIX #2**: Checkpoints por BLOQUE temático en vez de "secciones" vagas.
**FIX #8**: Limite acotado para evitar fatiga (fusionando info).
**FIX #13 UX**: Reducción extrema antisurvey-fatigue (Max 5x3 preguntas), inferencias pasivas y barra de progreso.

---

## Paso 3: Plan de alto nivel

```
PASO 3: PLAN DE ALTO NIVEL
  Con el perfil completo, el LLM genera un plan estratégico UNIFICADO
  que integra todos los objetivos:
    - Fases principales (pueden ser paralelas entre objetivos)
    - Duración estimada de cada fase
    - Dependencias entre fases (intra e inter objetivo)
    - Hitos clave (milestones) con fechas tentativas
    - Métricas de éxito por fase
    - Mapa de relaciones entre objetivos:
      "Objetivo A y B compiten por las tardes"
      "Objetivo C depende de completar fase 1 de A"

  NO genera tareas diarias todavía.
  Es un mapa de ruta, no un calendario.

  checkpoint = "plan-alto-nivel-generado"
```

**FIX #7/#9**: Plan unificado con mapa explícito de relaciones y conflictos
entre objetivos.

---

## Paso 4: Chequeo de realidad (Empatía UX)

```
PASO 4: CHEQUEO DE EMPATÍA Y REALIDAD
  Calcular presupuesto temporal:
    horas_necesarias = estimación del LLM por objetivo
    horas_disponibles = del intake (rutina + tiempo libre)

  Si horas_necesarias > horas_disponibles * 0.85:
    Mostrar pantalla de "Ajuste de Expectativas" (Tono: Coach amigable, NUNCA error robótico).
    Mensaje tipo: "¡Che, tenés objetivos re ambiciosos! Pero mirando tu rutina, nos va a faltar tiempo. ¿Qué te parece si hacemos uno de estos ajustes?"
      - [A] Bajarle la intensidad a [Objetivo menos prioritario]
      - [B] Patear la fecha de [Objetivo X] unos meses más adelante
      - [C] Pedirle a Pulso que priorice automáticamente por ti basado en el Paso 1
    Esperar decisión. Actualizar plan silenciosamente.

  Detectar y resolver conflictos sistémicos antes de simular.
  
  checkpoint = "chequeo-completado"
```

**FIX #9**: Los trade-offs respetan la priorización del usuario.
**FIX #14 UX**: Tone of voice empático, evitando regañar al usuario.

---

## Paso 5: Simulación iterativa

```
PASO 5: SIMULACIÓN
  PRE-FLIGHT:
    Escanear plan buscando ambigüedades.
    Si hay → preguntar al usuario ANTES de simular.

  BUCLE (máx 5 iteraciones):
    El LLM simula la ejecución del plan semana a semana:
      - ¿Las horas cuadran?
      - ¿Dependencias rotas o franjas sobrecargadas?

    Resultado:
      PASS → salir del bucle
      WARN → advertencias
      FAIL → propone corrección

    Si falla 3 veces por conflictos imposibles, flexibiliza automáticamente las fechas (no looptea hasta 5) y emite un WARN al usuario notificando el ajuste.

    Mostrar: skeleton loader animado amigable para retener a usuarios impacientes ("Armando tu plan..."). 

    checkpoint por sub-iteración = "simulacion-iteracion-{N}"

  checkpoint = "simulacion-completada"
```

**FIX #10**: Checkpoint por sub-iteración para poder retomar si se corta.
**FIX #15 UX**: Salvavidas anti-loop infinito tras 3 intentos, skeleton loader para mitigar impaciencia.

---

## Paso 6: Presentación visual del plan

```
PASO 6: PRESENTACIÓN
  Mostrar plan al usuario de forma gráfica Mobile-First:
    - Si la pantalla es pequeña (<768px): Evitar Gantt incomprensible. Usar Cards verticales colapsables cronológicamente.
    - Opciones de texto suplementario integrado.

  El usuario puede dar feedback por chat o editando labels de tareas:
    - Lock UI: Durante la regeneración del LLM por feedback, la interfaz de texto QUEDA BLOQUEADA para evitar race-conditions y pérdida de estados al chatear y tipear simultáneamente.
    
  Auto-guardado de ediciones inline cada 5 segundos si el estado está libre.

  Máximo 10 rondas de feedback.

  checkpoint = "plan-aceptado"
```

**FIX #3**: Límite de 10 rondas.
**FIX #11**: Auto-guardado.
**FIX #16 UX**: Mobile-first descartando Gantt en móvil y aplicación de mutex lock UI en re-renders concurrentes.

---

## Paso 7: Integración de calendario existente

```
PASO 7: CALENDARIO EXISTENTE
  Preguntar amigablemente: "¿Tenés horarios fijos en la semana? (Ej: Trabajo de 9 a 18)".

  Mecanismos Soportados (Orientado a baja fricción):
    1. Grilla visual "Tap-to-select": El usuario toca cuadritos en una matriz simple (Mañana/Tarde/Noche por días).
    2. Conectar OAuth Google/Apple Calendar (Mejora Fase 4).
    3. Avanzado: Subir archivo .ics (escondido bajo botón "Avanzado" por mala UX móvil).

  Parsear eventos → mapa de disponibilidad real por franja horaria.
  Si cruza con la rutina de intake original y hay un problema, el LLM ajusta.

  checkpoint = "calendario-integrado"
```

**FIX #4**: Mecanismo manual/OAuth.
**FIX #17 UX**: Inviabilidad de ingesta de archivo ICS forsoza en terminales móviles, se revierte a matriz de toques visuales.

---

## Paso 8: Generación top-down del calendario

```
PASO 8: GENERACIÓN TOP-DOWN
  El sistema elige automáticamente los niveles según duración del plan:

  Plan > 2 años:  Anual → Trimestral → Mensual → Semanal → Diario
  Plan 1-2 años:  Trimestral → Mensual → Semanal → Diario
  Plan 3-12 meses: Mensual → Semanal → Diario
  Plan 1-3 meses:  Semanal → Diario
  Plan < 1 mes:    Diario directo

  Para cada nivel:
    1. El LLM genera el desglose de ese nivel
    2. Se presenta al usuario (gráfico + texto)
    3. Usuario puede:
       - Aprobar → baja al siguiente nivel
       - Pedir ajustes → regenera ese nivel (máx 3 ajustes por nivel)
       - Subir un nivel si ve problema estructural

  Optimización para planes largos:
    En niveles altos (anual/trimestral) → solo confirmar, sin edición granular
    En niveles bajos (semanal/diario) → mostrar MUESTRA de 1-2 semanas
    "Esta es la primera semana como ejemplo. ¿Así está bien?
     Si sí, genero las demás siguiendo el mismo patrón."

  checkpoint por nivel = "topdown-nivel-{N}-completado"
  checkpoint final = "calendario-generado"
```

**FIX #5**: Optimización para planes largos (solo confirmar niveles altos,
muestra en niveles bajos).
**FIX #6**: Niveles se adaptan automáticamente a la duración del plan.

---

## Paso 9: Plan activo (Ejecución)

```
PASO 9: EJECUCIÓN
  El plan está activo. Dashboard muestra:
    - Tareas del día (por objetivo, con colores)
    - Progreso del hito actual
    - Racha de días cumplidos
    - Vista de semana/mes
    - Barra de progreso por objetivo

  El usuario puede:
    - Marcar tareas completadas
    - Pedir re-planificación:
      "Esta semana no pude" → el LLM redistribuye
      "Quiero cambiar de enfoque" → vuelve a Paso 6
    - Ver costos acumulados (si usa servicio)
    - Exportar a .ics
    - Agregar un nuevo objetivo → vuelve a Paso 1 manteniendo los existentes
```

---

## Reanudación (Parcial no destructiva)

```
REANUDACIÓN:
  Leer último checkpoint.
  Mostrar: "¡Hola! Tenías un plan en construcción. ¿Todo sigue igual o cambió algo?"
  Si dice que algo cambió:
    Se abre un input para que el usuario relate "qué cambió".
    Mecanismo DIFF: el LLM procesa ese texto, infiere las variables que cambiaron y HACE UN PARCHE (diff) sobre el JSON del usuario.
    Regla estricta: NUNCA destruir ni borrar las fases o preguntas del intake previamente completadas. Mutación atómica.
  Continuar desde el checkpoint.
```

---

## Deficiencias corregidas — resumen

| # | Deficiencia | Corrección aplicada |
|---|------------|---------------------|
| 1 | Sin estimación de costo antes de billetera | Paso 0: muestra rango de costo antes de GATE_WALLET |
| 2 | Checkpoints de intake sin granularidad | Paso 2: checkpoint por bloque + auto-guardado por respuesta |
| 3 | Feedback sin límite en presentación | Paso 6: máx 10 rondas + mensaje de cierre suave |
| 4 | Mecanismo de importación de calendario vago | Paso 7: archivo .ics o ingreso manual; OAuth futuro |
| 5 | Top-down agotador para planes largos | Paso 8: niveles altos solo confirmar, muestra en bajos |
| 6 | Niveles no se adaptan a planes cortos | Paso 8: tabla de niveles por duración del plan |
| 7 | No soporta múltiples objetivos | Paso 1: acepta N objetivos, plan unificado |
| 8 | Límite de preguntas insuficiente | Paso 2: 4 bloques × 15, con fusión entre objetivos |
| 9 | Sin priorización entre objetivos | Paso 1: priorización explícita, Paso 4: trade-offs la respetan |
| 10 | Sin checkpoint por sub-iteración | Paso 5: checkpoint por iteración de simulación |
| 11 | Ediciones inline se pierden | Paso 6: auto-guardado cada 5 segundos |
