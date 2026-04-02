# docs/ - Documentacion del proyecto LAP

> Indice para encontrar rapido lo vigente y lo historico sin confundirlos.

## Fuente de verdad

- Arquitectura vigente: `docs/architecture/REGISTRY.json`
- Planes vigentes: `docs/plans/REGISTRY.json`

## Estructura

```text
docs/
  architecture/          Specs y registros de arquitectura
  assets/                Capturas y material visual de apoyo
  deployment/            Guia de deploy y readiness de Vercel
  maqueta/               Exploraciones visuales y mockups historicos
  plans/                 Sistema canonico de planes
  progress/              Estado del trabajo y continuidad
  prompts/               Prompts operativos para agentes
  qa/                    Artefactos de canary y verificacion
```

`docs/.obsidian/` contiene estado del editor y no forma parte de la fuente de verdad documental.

## architecture/

| Archivo | Descripcion |
|---------|-------------|
| `REGISTRY.json` | Registro canonico para resolver documentos vigentes por serie y lifecycle |
| `FLUJO_HIBRIDO_DRAFT.md` | Flujo E2E del producto |
| `PLAN_SETTINGS_AUTH.md` | Plan de settings y autenticacion |
| `PIPELINE_V5_SPEC.md` | Contrato historico del pipeline v5 |
| `FRONTEND_V5_SPEC.md` | Especificacion historica del visor v5 |
| `PIPELINE_V6_SPEC.md` | Especificacion operativa del runtime de build v6 |

## assets/

Material visual que apoya docs o revisiones. No es source of truth.

## deployment/

Guia de despliegue y contratos de entorno para Vercel.

## maqueta/

Exploraciones visuales, capturas y material de diseno. Si dejan de aportar contexto, se archivan o se eliminan.

## plans/

| Archivo | Descripcion |
|---------|-------------|
| `README.md` | Convenciones del sistema de planes y regla para resolver el ultimo plan |
| `REGISTRY.json` | Registro canonico de planes de implementacion |
| `{series-id}-v{N}/PLAN.md` | Documento principal del plan |
| `{series-id}-v{N}/status.json` | Estado y lifecycle maquina-legibles del plan |

## progress/

| Archivo | Descripcion |
|---------|-------------|
| `PROGRESS.md` | Estado de avance por fase |
| `continuacion-web-nextjs-divs.md` | Plan de continuidad tecnica |
| `plan-credenciales-cobro-por-recurso-divs.md` | Plan de credenciales y cobro por recurso |

## prompts/

Prompts especificos para agentes. Cada subcarpeta corresponde a un agente o uso.

| Subcarpeta | Uso |
|------------|-----|
| `antigravity/` | Tareas para Antigravity |
| `codex/` | Tareas para Codex |

## qa/

Artefactos de verificacion y canary.

## Archivos raiz que se mantienen

| Archivo | Razon |
|---------|-------|
| `CLAUDE.md` | Convencion para Claude Code |
| `AGENTS.md` | Contexto operativo general |
| `.cursorrules` | Convencion para Cursor |
| `.windsurfrules` | Convencion para Windsurf |
| `README.md` | Entrada principal del repo |
| `.obsidian/` | Estado del editor versionado; no usar como referencia documental |
