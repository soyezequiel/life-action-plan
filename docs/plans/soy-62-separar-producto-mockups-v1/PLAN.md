# Separar producto vivo de mockups y demos

> **Linear:** SOY-62
> **Status:** `pending`
> **Plan:** `docs/plans/soy-62-separar-producto-mockups-v1/PLAN.md`
> **Padre:** SOY-43 — stage 2 de `repo-cleanup-doc-order-v1`

## Contexto
Rutas y componentes activos tienen naming tipo `Mockup*` heredado del período de prototipado. Esto confunde qué es producto real y qué es demo. El inventario del stage anterior (SOY-61) ya identificó qué es borrable.

## Alcance
Eliminar naming `Mockup*` de rutas activas del producto. Mover mockups reales a un namespace no operacional. Revisar `app/auth`, `app/plan`, `app/settings`, `components/Dashboard.tsx`, `components/IntakeExpress.tsx`.

## Pasos de implementación
1. Leer `decision-table.md` de SOY-61 para la lista de renames aprobados
2. Renombrar componentes `Mockup*` que son producto activo: quitar el prefijo `Mockup`
3. Mover componentes que son mockups reales (no producto) a `components/_archive/` o eliminar
4. Actualizar todos los imports que referencian los componentes renombrados
5. Verificar que ninguna ruta activa monta componentes con nombre `Mockup*`
6. `npm run build` en verde

## Criterio de cierre
- Cero componentes `Mockup*` montados en rutas activas del producto
- `npm run build` en verde
- `npm run typecheck` sin errores

## No tocar
- Lógica de negocio de los componentes (solo renames y moves)
- `app/api/`
- Tests (actualizar imports si cambia el nombre del componente, no la lógica)
