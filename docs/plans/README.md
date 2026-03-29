# docs/plans - Planes de Implementacion Multiagente

Esta carpeta es el sistema canonico de planes de implementacion del repo.
Los agentes deben resolver primero `REGISTRY.json` y despues abrir el `PLAN.md` y `status.json` del plan elegido.

## Estructura canonica

```text
{series-id}-v{N}/
  PLAN.md              <- plan principal
  status.json          <- estado y lifecycle maquina-legibles
  implementation/
    log.md             <- registro de implementacion
  review/
    report.md          <- reporte de revision
  tests/
    report.md          <- reporte de testing
  history/
    {ts}-{agente}.md   <- entradas inmutables de historial
```

## Regla de nombres

Todo plan nuevo debe usar:
- carpeta: `{series-id}-v{N}`
- archivo principal: `PLAN.md`
- `series-id`: kebab-case sin espacios
- `N`: entero positivo

Ejemplos validos:
- `auth-login-v1`
- `sim-tree-ui-v2`
- `pipeline-v5-sprint-6-v1`

Ejemplos invalidos:
- `AuthLogin`
- `auth login`
- `pipeline-v5-sprint6`
- `plan.md`

## Metadatos obligatorios

Todo `status.json` debe incluir como minimo:
- `plan_id`
- `series_id`
- `version`
- `status`
- `lifecycle`
- `latest_in_series`
- `canonical_plan_file`

## Estados operativos

| Estado | Significado |
|--------|-------------|
| `draft` | El plan todavia se esta escribiendo |
| `ready` | El plan esta listo para ejecutar |
| `in-progress` | Hay implementacion en curso |
| `implemented` | La implementacion termino, falta cierre externo |
| `needs-review` | Hace falta revision antes de seguir |
| `testing` | Se esta validando |
| `needs-fixes` | La validacion encontro problemas |
| `done` | El trabajo quedo cerrado |
| `blocked` | No puede avanzar sin intervencion externa |

## Lifecycle documental

| Lifecycle | Significado |
|-----------|-------------|
| `active` | Plan vigente y elegible como base de trabajo |
| `historical` | Plan cerrado o retenido como referencia util |
| `superseded` | Plan reemplazado por una version mas nueva de la misma serie |
| `obsolete` | Plan viejo o invalido para el estado actual del repo |

## Regla para resolver el ultimo plan

Para una `series_id` dada:
1. Leer `REGISTRY.json`
2. Filtrar por la `series_id`
3. Ignorar planes con `lifecycle` en `["superseded", "obsolete"]`
4. Elegir el `version` numericamente mas alto
5. Verificar que `latest_in_series` sea `true`

Si no queda ningun candidato despues del paso 3, la serie no tiene un plan vigente.

## Regla para elegir un plan accionable

- Si el usuario pide el plan actual o vigente, preferir `lifecycle = "active"`
- Si pide el ultimo plan aunque ya este terminado, aceptar `historical`
- Nunca arrancar trabajo desde `superseded` u `obsolete`

## Fuente de verdad para agentes

- `docs/plans/REGISTRY.json` resuelve el ultimo plan por serie
- `docs/plans/{plan_id}/status.json` resuelve estado y lifecycle
- `docs/plans/{plan_id}/PLAN.md` contiene el detalle humano del trabajo
