# Prompt: Beta Tester del Flujo LAP

> Copiar y pegar este prompt completo en Antigravity.
> Incluye el flujo completo inline para que no dependa de archivos externos.

---

## Tu rol

Sos un beta tester experto en UX y diseño de producto. Tu trabajo es simular ser **5 usuarios reales distintos** que usan la app LAP (un planificador de vida asistido por IA) por primera vez, recorriendo el flujo completo paso a paso.

Para cada usuario simulado:
1. **Inventá un perfil realista** (nombre, edad, contexto de vida, nivel técnico, objetivos)
2. **Recorré el flujo completo** paso a paso, simulando exactamente qué haría esa persona en cada pantalla
3. **Buscá activamente problemas**: errores lógicos, caminos sin salida, UX confusa, casos borde, inconsistencias, flujos que se sienten largos o frustrantes
4. **Calificá cada paso** del 1 al 5 en claridad, fricción y robustez
5. **Proponé correcciones concretas** para cada problema que encuentres

## Reglas de simulación

- Simulá usuarios REALES, no ideales. Incluí al menos:
  - Un usuario no técnico (abuela-proof: no sabe qué es una API key ni un LLM)
  - Un usuario impaciente (quiere resultados rápido, no tolera muchas preguntas)
  - Un usuario con objetivos vagos ("quiero mejorar mi vida")
  - Un usuario con objetivos contradictorios o irealistas
  - Un usuario que abandona y vuelve (para testear reanudación)
- No seas amable con el flujo. Tu trabajo es ROMPERLO.
- Si encontrás un camino sin salida, documentalo.
- Si algo es ambiguo, elegí la interpretación que más problemas cause.
- Pensá en edge cases: ¿qué pasa si el usuario hace algo inesperado?

## El flujo a testear

### Paso 0: Gate de acceso

```
INICIO:
  Leer estado del usuario (DB o localStorage).

  ¿Tiene sesión previa con checkpoint?
    Sí → ir a REANUDACIÓN
    No → continuar

  ¿Tiene LLM configurado (key propia o servicio con saldo)?
    No → mostrar pantalla de configuración LLM
         Opciones: "Usar tu propia clave" | "Usar servicio (requiere billetera)"
         Si elige servicio:
           ANTES de configurar billetera, mostrar estimación de costo:
             "Crear un plan típico cuesta entre $0.05 y $0.50 USD aprox."
             "El uso diario posterior es mínimo (~$0.01/día)"
           → ir a GATE_WALLET
         Si elige clave propia → configurar, validar conexión, continuar
    Sí → continuar

  ¿Tiene billetera configurada (si usa servicio)?
    No → GATE_WALLET: configurar billetera, verificar saldo mínimo
    Sí → continuar

  → ir a PASO 1
```

### Paso 1: Objetivos

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

### Paso 2: Intake dinámico (dirigido por LLM)

```
PASO 2: INTAKE DINÁMICO
  El LLM genera preguntas agrupadas en BLOQUES temáticos.
  Cada bloque tiene un tema claro (ej: "Sobre tu tiempo disponible").

  Reglas:
    - Máximo 15 preguntas por bloque
    - Máximo 4 bloques (= 60 preguntas teóricas, pero el LLM debe
      apuntar a ~20-30 en total fusionando preguntas entre objetivos)
    - Cada BLOQUE completado = checkpoint guardado
      checkpoint = "intake-bloque-{N}-completado"

  Para cada pregunta:
    - Formato conversacional (no formulario)
    - Si el usuario no sabe: el LLM infiere un default razonable
      → "¿Te parece bien si asumo X?"
    - Si el usuario responde vago: el LLM pide aclaración (1 intento)
      luego acepta con default

  Auto-guardado: cada respuesta individual se persiste en DB.
  Si el usuario cierra el browser, al volver retoma desde la última
  pregunta respondida dentro del bloque actual.

  Bloques posibles (el LLM elige cuáles aplican):
    - Datos personales básicos
    - Situación actual por objetivo
    - Tiempo disponible, rutina y energía
    - Recursos (dinero, conocimientos, herramientas)
    - Restricciones inamovibles
    - Calendario existente (si aplica, se pide acá)

  checkpoint final = "intake-completado"
```

### Paso 3: Plan de alto nivel

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

### Paso 4: Chequeo de realidad

```
PASO 4: CHEQUEO DE REALIDAD
  Calcular presupuesto temporal:
    horas_necesarias = estimación del LLM por objetivo
    horas_disponibles = del intake (rutina + tiempo libre)

  Si horas_necesarias > horas_disponibles * 0.85:
    Mostrar: "Tus objetivos necesitan ~X horas/semana pero tenés ~Y."
    Ofrecer trade-offs usando la PRIORIZACIÓN del Paso 1:
      "Opción A: Reducir [objetivo menos prioritario] de Xh a Yh/semana"
      "Opción B: Extender el plazo de [objetivo] de X a Y meses"
      "Opción C: Posponer [objetivo de menor prioridad] 3 meses"
    Esperar decisión. Actualizar plan.

  Detectar conflictos:
    - Fases que compiten por el mismo horario
    - Dependencias circulares
    - Objetivos mutuamente excluyentes

  checkpoint = "chequeo-completado"
```

### Paso 5: Simulación iterativa

```
PASO 5: SIMULACIÓN
  PRE-FLIGHT:
    Escanear plan buscando ambigüedades.
    Si hay → preguntar al usuario ANTES de simular.

  BUCLE (máx 5 iteraciones):
    El LLM simula la ejecución del plan semana a semana:
      - ¿Las horas cuadran?
      - ¿Hay semanas sobrecargadas?
      - ¿Los hitos son alcanzables?
      - ¿Hay dependencias rotas?
      - ¿Hay conflictos entre objetivos en la misma franja?

    Resultado:
      PASS → salir del bucle
      WARN → mostrar advertencias, preguntar si ajustar
      FAIL → el LLM propone corrección, re-simula

    Mostrar: "Revisión N/5: [resumen de 3 líneas]"

    checkpoint por sub-iteración = "simulacion-iteracion-{N}"

  Si 5 iteraciones sin PASS:
    Generar reporte con opciones concretas.
    Esperar decisión. Re-simular (máx 2 rondas extra).

  checkpoint = "simulacion-completada"
```

### Paso 6: Presentación visual del plan

```
PASO 6: PRESENTACIÓN
  Mostrar plan al usuario de forma gráfica:
    - Diagrama timeline/Gantt para fases (librería: ej. Mermaid, vis-timeline)
    - Cards resumen por fase con hitos y métricas
    - Texto complementario donde los gráficos no alcancen
    - Si hay múltiples objetivos: vista de cómo se entrelazan

  El usuario puede:
    a) Dar feedback escribiendo (tipo chat):
       "Quiero que la fase 2 empiece antes"
       "No me gusta que X y Y sean paralelas"
    b) Editar directamente textos/títulos en los gráficos
    c) Aceptar el plan

  Auto-guardado de ediciones inline cada 5 segundos.

  Si feedback → el LLM ajusta → re-presenta
  Máximo 10 rondas de feedback. Después:
    "Ya llevamos varias revisiones. ¿Querés aceptar el plan actual
     y ajustar detalles después en el calendario?"

  checkpoint = "plan-aceptado"
```

### Paso 7: Integración de calendario existente

```
PASO 7: CALENDARIO EXISTENTE
  Preguntar: "¿Querés importar tu calendario actual para adaptar el plan?"

  Si sí — mecanismos soportados:
    1. Subir archivo .ics (export de cualquier app de calendario)
    2. Ingreso manual guiado: "¿Qué actividades fijas tenés cada semana?"
       (tabla editable: actividad, día, hora inicio, hora fin)

  Parsear eventos → mapa de disponibilidad real por franja horaria.
  El LLM compara con la rutina del intake y resuelve discrepancias:
    "En tu intake dijiste que tenés libres las tardes, pero tu calendario
     muestra reuniones los martes y jueves de 15 a 17. ¿Cuál es correcto?"

  Si no importa calendario:
    Usar rutina del intake como base de disponibilidad.

  checkpoint = "calendario-integrado"
```

### Paso 8: Generación top-down del calendario

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

### Paso 9: Plan activo (Ejecución)

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

### Reanudación

```
REANUDACIÓN:
  Leer último checkpoint (formato: "paso-N-sub-estado").
  Mostrar: "Tenías una sesión en progreso: [descripción amigable del paso]"
  Preguntar: "¿Cambió algo desde la última vez?"
  Si sí:
    Mostrar resumen de datos actuales
    Permitir editar lo que cambió
    Si el cambio invalida pasos posteriores, marcar para re-ejecución
  Continuar desde el checkpoint guardado.
```

---

## Formato de entrega

Para cada usuario simulado, entregá:

### 1. Ficha del usuario
```
Nombre: [nombre ficticio]
Edad: [edad]
Contexto: [1-2 líneas de situación de vida]
Nivel técnico: [nulo / bajo / medio / alto]
Objetivo(s): [lo que escribiría en el campo de texto]
Personalidad: [impaciente / detallista / inseguro / etc.]
```

### 2. Recorrido paso a paso
Para CADA paso del flujo, documentá:
```
PASO [N]: [nombre]
  Qué hace el usuario: [acción concreta que tomaría]
  Qué espera ver: [expectativa]
  Qué pasa según el flujo: [resultado real]
  Problema encontrado: [si hay] o "OK"
  Severidad: [crítica / alta / media / baja / ninguna]
  Calificación: [1-5] claridad | [1-5] fricción | [1-5] robustez
```

### 3. Problemas consolidados
Al final de los 5 usuarios, consolidá todos los problemas en una tabla:
```
| # | Problema | Usuarios afectados | Severidad | Paso | Corrección propuesta |
```

### 4. Flujo corregido
Reescribí SOLO los pasos que necesiten corrección, manteniendo el mismo formato.
Si un paso está bien, poné "SIN CAMBIOS" y seguí.

## Los 5 usuarios que DEBÉS simular

1. **Marta, 62 años** — Jubilada, quiere organizar su rutina de salud. No sabe qué es una API key. Usa el celular para todo. Nivel técnico: nulo.

2. **Tomás, 17 años** — Estudiante de secundaria, quiere prepararse para el ingreso a la universidad en 6 meses. Impaciente, quiere resultados ya. Nivel técnico: medio.

3. **Lucía, 38 años** — Madre de 2, trabaja full-time, quiere "mejorar su vida" (objetivo vago). Tiene Google Calendar con todo lleno. Se frustra fácil. Nivel técnico: bajo.

4. **Diego, 28 años** — Programador, quiere aprender japonés, correr una maratón, y lanzar un side-project. Todo al mismo tiempo. Objetivos contradictorios en tiempo. Tiene API key de OpenAI. Nivel técnico: alto.

5. **Valentina, 45 años** — Empezó el flujo hace 3 días pero abandonó en el paso 2 (intake). Vuelve ahora. Cambió de trabajo desde entonces. Testea REANUDACIÓN. Nivel técnico: medio.

## Restricciones importantes

- La app se llama "Pulso". El nombre de cara al usuario es "Pulso", no "LAP".
- La UI debe ser "abuela-proof": no mostrar jerga técnica (LLM, API, JSON, tokens, etc.)
- Los textos están en español (variante rioplatense: vos/querés/tenés)
- La app es web (browser), no desktop
- El pago es con Bitcoin Lightning via billetera Nostr (NWC). No hay tarjetas de crédito.
- Si algo no está definido en el flujo, marcalo como "INDEFINIDO" y proponé solución
