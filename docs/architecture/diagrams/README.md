# Diagramas de Arquitectura — LAP

Documentación gráfica de la arquitectura del sistema, basada en el modelo C4 y flujos operativos.

## Diagramas disponibles

| Archivo | Tipo | Qué muestra |
|---------|------|-------------|
| `context.mmd` | C4 Context | Vista de alto nivel: usuario, LAP, sistemas externos (LLM, DB, pagos) |
| `containers.mmd` | C4 Container | Componentes internos de la app: frontend, API, pipeline, providers, dominio, DB |
| `build-flow.mmd` | Flowchart | Flujo completo de generación de plan: desde la meta del usuario hasta el plan empaquetado, con las 10 fases del pipeline v6 |
| `runtime-environments.mmd` | C4 Deployment | Cómo se despliega LAP en desarrollo local vs producción en Vercel |

## Cómo visualizarlos

### En GitHub / GitLab
Los archivos `.mmd` se renderizan automáticamente en la vista de archivos.

### En VS Code
Instalar la extensión [Markdown Preview Mermaid Support](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid) o [Mermaid Preview](https://marketplace.visualstudio.com/items?itemName=vstirbu.vscode-mermaid-preview).

### En línea
Copiar el contenido en [mermaid.live](https://mermaid.live) para edición interactiva.

### Exportación
La carpeta `export/` está reservada para versiones PNG, SVG o `.drawio` generadas a partir de estos diagramas.

## Documentos fuente

Estos diagramas reflejan la arquitectura descrita en:

- `PIPELINE_V6_SPEC.md` — Especificación del pipeline agéntico v6
- `FLUJO_HIBRIDO_DRAFT.md` — Flujo de producto de 9 pasos
- `AGENTS.md` — Estado operativo actual del proyecto

## Convenciones

- **Formato**: Mermaid (`.mmd`)
- **Idioma**: Español (consistente con el proyecto)
- **Mantenimiento**: Actualizar cuando cambie la arquitectura. Los diagramas deben reflejar el estado real, no el deseado.
