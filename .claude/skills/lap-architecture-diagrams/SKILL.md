---
name: lap-architecture-diagrams
description: Genera o regenera los 4 diagramas de arquitectura del proyecto LAP (contexto, contenedores, flujo de build, entornos) en Mermaid, completamente en español. Usar siempre que el usuario pida actualizar, regenerar, crear o revisar los diagramas de arquitectura, documentación gráfica, diagramas C4, o visualización de la arquitectura del sistema. También usar cuando la arquitectura cambie significativamente (nuevo componente, nueva fase del pipeline, nuevo proveedor, cambio de entorno).
---

# LAP Architecture Diagrams — Generación completa en una pasada

Este skill genera los 4 diagramas de arquitectura del proyecto LAP y un README explicativo, todo en español y basado en el estado real del repositorio.

## Archivos que genera

| Archivo | Tipo Mermaid | Propósito |
|---------|-------------|-----------|
| `docs/architecture/diagrams/context.mmd` | C4Context | Vista pájaro: usuario, LAP, sistemas externos |
| `docs/architecture/diagrams/containers.mmd` | C4Container | Componentes internos de la app |
| `docs/architecture/diagrams/build-flow.mmd` | flowchart TD | Las fases del pipeline de generación de planes |
| `docs/architecture/diagrams/runtime-environments.mmd` | C4Deployment | Entornos local vs producción |
| `docs/architecture/diagrams/README.md` | Markdown | Índice y guía de visualización |

## Proceso paso a paso

### Paso 1: Leer fuentes de verdad

Leer estos archivos para extraer la arquitectura vigente. No inventar componentes — solo documentar lo que existe.

1. **`AGENTS.md`** — Estado operativo actual, archivos críticos, reglas inquebrantables, entornos de ejecución
2. **`docs/architecture/PIPELINE_V6_SPEC.md`** — Fases del pipeline, agentes, eventos SSE, modelo de sesión, degradación
3. **`docs/architecture/FLUJO_HIBRIDO_DRAFT.md`** — Flujo de producto de 9 pasos, journey del usuario, puntos de integración con IA

Si algún archivo no existe, avisar al usuario y generar los diagramas con la información disponible.

Opcionalmente, para mayor precisión, escanear:
- `src/lib/pipeline/v6/` — orchestrator, state-machine, types
- `src/lib/providers/` — provider-factory, qué proveedores existen
- `app/api/` — rutas activas del servidor
- `src/lib/db/schema.ts` — tablas de la base de datos

### Paso 2: Crear directorio

```bash
mkdir -p docs/architecture/diagrams/export
```

### Paso 3: Generar `context.mmd` — C4 Contexto

Diagrama C4Context que muestra:
- **Persona**: Usuario (descripción en lenguaje humano, sin jerga)
- **Sistema**: LAP — Planificador de Vida
- **Sistemas externos**: Proveedor de IA en la nube, IA local (solo desarrollo), Base de datos, Red de pagos
- **Relaciones**: todas en español, con descripciones de protocolo legibles

Reglas:
- Nombres propios de productos (PostgreSQL, OpenAI, Ollama, Vercel) se mantienen como nombre propio
- Todo lo descriptivo va en español: "Conexión segura" en vez de "HTTPS/API", "Navegador web" en vez de "Browser"
- La IA local debe tener línea punteada (`$lineStyle="dotted"`) porque solo existe en desarrollo

Tema visual:
```
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#1a73e8', 'primaryTextColor': '#fff', 'lineColor': '#5f6368', 'secondaryColor': '#e8f0fe', 'tertiaryColor': '#f1f3f4'}}}%%
```

### Paso 4: Generar `containers.mmd` — C4 Contenedores

Diagrama C4Container que muestra los componentes internos de LAP:

| Componente | Qué representa | Fuente de datos |
|---|---|---|
| Interfaz de usuario | Frontend React (páginas y componentes) | `app/` y `components/` |
| Servicios del servidor | API Routes de Next.js | `app/api/` |
| Motor de generación de planes | Pipeline v6 (orquestador + agentes) | `src/lib/pipeline/v6/` |
| Conector de IA | Fábrica de proveedores | `src/lib/providers/` |
| Lógica de negocio | Dominio (generación, simulación, activación) | `src/lib/domain/` |
| Capa de datos | Drizzle ORM + schemas | `src/lib/db/` |

Reglas:
- Relaciones con verbos en español: "Envía pedidos y recibe actualizaciones en vivo", "Solicita respuestas de IA por cada fase"
- Llamadas internas etiquetadas como "Interno", no "Direct call"
- Incluir sistemas externos: Base de datos, Servicio de IA, Red de pagos

Mismo tema visual que context.mmd.

### Paso 5: Generar `build-flow.mmd` — Flujo de generación

Diagrama `flowchart TD` que muestra el flujo completo de generación de un plan.

Estructura en subgraphs con colores:

| Subgraph | Color fondo | Color borde | Contenido |
|---|---|---|---|
| 👤 Usuario | `#f3e8fd` | `#9334e6` | Acciones del usuario: definir meta, responder preguntas, revisar plan |
| 🔌 Servidor | `#fce8e6` | `#d93025` | Endpoints que reciben pedidos |
| ⚙️ Motor de generación | `#e8f0fe` | `#1a73e8` | Todas las fases del pipeline, numeradas, con progreso en % |
| 💾 Almacenamiento | `#e6f4ea` | `#1e8e3e` | Plan guardado, sesión pausada |
| 📡 Notificaciones | `#fef7e0` | `#f9ab00` | Eventos hacia el navegador |

Fases del motor — extraer de PIPELINE_V6_SPEC.md, típicamente:
1. Interpretar meta → 2. Clarificar → 3. Planificar estrategia → 4. Verificar viabilidad → 5. Armar agenda → 6. Criticar → 7. Revisar → 8. Empaquetar → 9. Listo → 10. Fallo

Conexiones importantes:
- Clarificar puede pausar y pedir respuestas al usuario (máximo 3 rondas)
- Criticar puede devolver a Revisar (máximo 2 ciclos)
- Planificar puede degradarse si la IA falla parcialmente
- Criticar puede bloquear si la calidad es insuficiente

Etiquetas de las flechas siempre en español: "¿necesita respuestas?", "máximo 3 rondas", "encontró problemas", "aprobado", etc.

### Paso 6: Generar `runtime-environments.mmd` — C4 Deployment

Diagrama C4Deployment que muestra dos entornos:

**Desarrollo Local:**
- Servidor de desarrollo (Next.js en modo dev) → Aplicación LAP
- Base de datos local (PostgreSQL) → datos de desarrollo
- IA local (Ollama) → modelo gratuito
- Conexión opcional (línea punteada) a IA en la nube

**Producción (Vercel):**
- Funciones serverless → Aplicación LAP
- Base de datos en la nube (PostgreSQL cloud) → datos de producción
- Servicio de IA en la nube (OpenAI) → modelos GPT

Relaciones en español: "Conexión a base de datos", "Conexión a IA local", "Conexión a IA en la nube (opcional)".

### Paso 7: Generar `README.md`

README con:
- Tabla de los 4 diagramas con descripción de cada uno
- Sección "Cómo visualizarlos": GitHub (auto-render), VS Code (extensiones), mermaid.live
- Mención de `export/` para PNG/SVG/drawio
- Lista de documentos fuente usados
- Convenciones: formato Mermaid, idioma español, mantener actualizado

### Paso 8: Confirmar al usuario

Listar los 5 archivos generados con una línea descriptiva de cada uno. Si hubo algún componente nuevo detectado que no estaba en los diagramas previos, mencionarlo explícitamente.

## Regla de idioma

Todo el texto visible en los diagramas debe estar en español. Esto incluye:
- Títulos de diagramas
- Nombres y descripciones de personas, sistemas, contenedores, nodos
- Etiquetas de relaciones y flechas
- Nombres de subgraphs
- Texto dentro de nodos de flowchart

Excepciones permitidas (son nombres propios):
- Nombres de productos: PostgreSQL, OpenAI, Ollama, Vercel, Next.js, React, Drizzle, Node.js, Lightning Network
- Nombres de archivos o rutas si se mencionan como referencia técnica

## Qué NO hacer

- No inventar componentes que no existen en el código
- No incluir sistemas deprecados (Electron, SQLite, IPC)
- No usar "LLM", "API", "SSE", "CRUD", "endpoint" en las descripciones visibles — traducir a español coloquial
- No hardcodear números de fases si el pipeline cambió — leerlos de PIPELINE_V6_SPEC.md
- No dejar textos en inglés donde hay equivalente natural en español
