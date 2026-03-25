# UI Fixes Dashboard — Plan de Implementación

> **Para el agente implementador:** Leer primero `.agent/skills/multiagent-coordinator/SKILL.md`.
> Usar la skill `plan-executor` para implementar este plan tarea por tarea.

**Plan ID:** ui-fixes-dashboard-v1
**Goal:** Corregir 7 errores de UI/UX en el Dashboard identificados en la revisión de Antigravity.
**Arquitectura:** Cambios puros de presentación en componentes existentes. No toca API routes ni DB. Todos los strings van via i18n.
**Stack relevante:** Next.js 15, CSS Modules, TypeScript, i18n (es-AR.json)
**Prioridad:** medium
**Tags:** ui, dashboard, i18n, accessibility

---

## Archivos involucrados

| Acción | Ruta | Responsabilidad |
|--------|------|-----------------|
| Modificar | `components/Dashboard.tsx` | Botón SISTEMA, panel PROVEEDOR, wallet alias |
| Modificar | `components/Dashboard.module.css` | Topbar margin |
| Modificar | `app/globals.css` | task-card__meta font, button contrast |
| Modificar | `src/i18n/locales/es-AR.json` | Pluralización today_summary |
| Modificar | `src/lib/providers/provider-metadata.ts` | Labels amigables de proveedor |

---

## Tareas

### Tarea 1: Botón SISTEMA sin estado activo incorrecto

**Archivos:**
- Modificar: `components/Dashboard.tsx` (~línea 1338-1350, bloque `shellRailMeta`)

- [ ] **Paso 1.1:** Localizar el `<button>` dentro de `shellRailMeta` que lleva a `/settings`.
  Quitar la clase `shellRailItemActive` si está presente. Agregar estilos base:
  ```tsx
  <button
    className={styles.shellRailItem}
    style={{ border: 0, background: 'transparent', cursor: 'pointer' }}
    onClick={() => router.push('/settings')}
  >
  ```
  Verificación: `npm run typecheck` — esperado: sin errores

- [ ] **Paso 1.2:** Actualizar `status.json` con tarea 1 en progreso y registrar en log.

### Tarea 2: Labels amigables de proveedor (sin jerga técnica)

**Archivos:**
- Modificar: `src/lib/providers/provider-metadata.ts`
- Modificar: `src/i18n/locales/es-AR.json`

- [ ] **Paso 2.1:** En `provider-metadata.ts`, asegurarse que `getProviderLabelKey()` devuelva keys i18n amigables:
  ```typescript
  // Mapeo: proveedor técnico → key i18n amigable
  'openrouter' → 'builder.provider_online'
  'openai'     → 'builder.provider_online'
  'ollama'     → 'builder.provider_local'
  ```
  Verificación: `npm run typecheck`

- [ ] **Paso 2.2:** Verificar que en `es-AR.json` existan las keys:
  ```json
  "builder": {
    "provider_online": "Asistente en línea",
    "provider_local": "Asistente local"
  }
  ```
  Si no existen, agregarlas.

- [ ] **Paso 2.3:** En `Dashboard.tsx`, función `renderPlanSystemCard()`, usar `t(getProviderLabelKey(proveedor))` en lugar del nombre crudo.
  Verificación: `npm run typecheck`

### Tarea 3: Topbar sticky — margin-bottom

**Archivos:**
- Modificar: `components/Dashboard.module.css` (~línea 219-230, clase `.shellTopbar`)

- [ ] **Paso 3.1:** Cambiar `margin-bottom: 1rem` → `margin-bottom: 1.25rem` en `.shellTopbar`.
  Verificación: Visual — abrir `/` en el browser y verificar que el hero tenga más aire.

### Tarea 4: Task card meta — font-family

**Archivos:**
- Modificar: `app/globals.css` (~línea 752-758, clase `.task-card__meta`)

- [ ] **Paso 4.1:** Cambiar `font-family: var(--font-mono)` → `font-family: var(--font-ui)` en `.task-card__meta`.
  Verificación: `npm run typecheck` — sin errores de CSS.

### Tarea 5: Wallet alias — ocultar jerga técnica

**Archivos:**
- Modificar: `components/Dashboard.tsx` (~línea 795-798, función `renderWalletCard()`)

- [ ] **Paso 5.1:** Agregar guarda para no mostrar el alias si es un acrónimo técnico:
  ```typescript
  const isReadableAlias = walletStatus.alias &&
    walletStatus.alias.length > 5 &&
    walletStatus.alias !== walletStatus.alias.toUpperCase();

  {isReadableAlias && <span>{walletStatus.alias}</span>}
  ```
  Verificación: `npm run typecheck`

### Tarea 6: Pluralización "1 actividades"

**Archivos:**
- Modificar: `src/i18n/locales/es-AR.json`
- Modificar: `components/Dashboard.tsx`

- [ ] **Paso 6.1:** En `es-AR.json`, reemplazar `dashboard.today_summary` por dos keys:
  ```json
  "dashboard": {
    "today_summary_one": "1 actividad para hoy",
    "today_summary_other": "{{count}} actividades para hoy"
  }
  ```

- [ ] **Paso 6.2:** En `Dashboard.tsx`, donde se usa `t('dashboard.today_summary', { count })`:
  ```typescript
  t(pendingTaskCount === 1 ? 'dashboard.today_summary_one' : 'dashboard.today_summary_other', { count: pendingTaskCount })
  ```
  Verificación: `npm run typecheck`

### Tarea 7: Contraste botón "¡Listo!" WCAG AA

**Archivos:**
- Modificar: `app/globals.css` (~clase `.app-button--primary`)

- [ ] **Paso 7.1:** Cambiar el color de texto del botón primary de `#002b69` → `#0a1628`.
  Esto garantiza ratio ≥ 4.5:1 sobre el gradiente de brand color.
  Verificación: `npm run build` — sin errores.

### Tarea 8: Verificación final

- [ ] **Paso 8.1:** `npm run typecheck` → esperado: 0 errores
- [ ] **Paso 8.2:** `npm run test` → esperado: todos pasan
- [ ] **Paso 8.3:** `npm run lint` → esperado: 0 errores
- [ ] **Paso 8.4:** Actualizar `status.json` → `"status": "implemented"`
- [ ] **Paso 8.5:** Escribir `implementation/log.md` con resumen de cambios
- [ ] **Paso 8.6:** Registrar en `history/`
