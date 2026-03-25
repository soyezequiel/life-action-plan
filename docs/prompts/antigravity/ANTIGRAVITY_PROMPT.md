# Prompt para Antigravity — Correcciones UI/UX LAP

## Contexto del proyecto

Aplicacion **Next.js 15** (App Router) con estetica dark premium (glassmorphism, backdrop-filter, gradientes sutiles). Las fuentes son `Inter` para UI, `Plus Jakarta Sans` para display/headings, y `Geist Mono` solo para datos numericos/costos. Todos los strings de UI usan `t()` de i18n (archivo `src/i18n/locales/es-AR.json`). Regla critica: **Abuela-proof** — la UI no debe exponer jerga tecnica como `LLM`, `API`, `JSON`, `Tokens`, `NWC`, ni nombres de proveedores crudos como `OpenRouter` u `OpenAI`.

Los archivos principales de la UI son:
- `components/Dashboard.tsx` + `components/Dashboard.module.css`
- `components/IntakeExpress.tsx` + `components/IntakeExpress.module.css`
- `components/SettingsPageContent.tsx` + `components/SettingsPageContent.module.css`
- `components/PlanCalendar.tsx` + `components/PlanCalendar.module.css`
- `app/globals.css` (design tokens y clases globales)
- `src/i18n/locales/es-AR.json` (traducciones)

---

## Errores a corregir

### 1. Rail lateral izquierdo — Boton "SISTEMA" desbordado

**Donde:** `Dashboard.tsx`, bloque `shellRailMeta` (linea ~1338-1350)
**Que pasa:** El boton "SISTEMA" del rail lateral tiene un fondo azul activo que no le corresponde. No es un item de navegacion activo sino un boton de accion que lleva a `/settings`. Visualmente rompe la jerarquia porque parece seleccionado cuando no lo esta.
**Fix esperado:**
- El boton SISTEMA en el rail debe usar el estilo `shellRailItem` sin la clase `shellRailItemActive`.
- Verificar que el `<button>` en `shellRailMeta` no herede estilos de `<a>` del nav.
- Asegurar que el boton tenga `border: 0; background: transparent; cursor: pointer;` como base, y solo tome el hover de `.shellRailItem:hover`.

### 2. Panel "SISTEMA DEL PLAN" — Expone "OpenRouter" como jerga tecnica

**Donde:** `Dashboard.tsx`, funcion `renderPlanSystemCard()` (~linea 994-1037) y el panel que muestra RUTA y PROVEEDOR.
**Que pasa:** Las celdas "RUTA" y "PROVEEDOR" muestran:
- RUTA: `"Este plan se armo con OpenRouter."`
- PROVEEDOR: `"OpenRouter"`

Esto viola la regla Abuela-proof. "OpenRouter" no significa nada para el usuario final.
**Fix esperado:**
- La celda RUTA debe mostrar textos como `"Asistente en linea"`, `"Asistente local"` o `"Respaldo local"` segun corresponda (ya existen las keys `builder.provider_online`, `builder.provider_local` en es-AR.json).
- La celda PROVEEDOR debe mostrar `"Asistente en linea"` en lugar de `"OpenRouter"` u `"OpenAI"`. Revisar la funcion `getBuildProviderLabel()` y `getProviderLabelKey()` en `src/lib/providers/provider-metadata.ts` para que devuelva una key traducida amigable en lugar del nombre crudo del proveedor.
- Si el valor viene de `latestPlanMeta.ultimoModeloUsado`, mapear los IDs de modelo a labels humanos via i18n.

### 3. Topbar sticky se superpone al hero

**Donde:** `Dashboard.module.css`, clase `.shellTopbar` (~linea 219-230)
**Que pasa:** El topbar sticky (con "Hoy", "Calendario", "Plan") se superpone visualmente al contenido del hero que esta justo debajo. No hay suficiente separacion.
**Fix esperado:**
- Agregar `margin-bottom: 1.25rem;` al `.shellTopbar` (actualmente tiene `margin-bottom: 1rem`).
- Alternativamente, agregar `padding-top: 0.5rem` al contenedor `.shellContent` para que el hero empiece con mas aire debajo del topbar.

### 4. Task card — metadatos en monospace se ven como codigo

**Donde:** `app/globals.css`, clase `.task-card__meta` (~linea 752-758)
**Que pasa:** El texto `"10:00 · 180 min · Otro"` usa `font-family: var(--font-mono)` (Geist Mono). Esto le da un aspecto de terminal/codigo que rompe la estetica premium. Los metadatos de tareas son informacion contextual, no datos tecnicos/financieros.
**Fix esperado:**
- Cambiar `.task-card__meta` de `font-family: var(--font-mono)` a `font-family: var(--font-ui)`.
- El mono solo debe usarse para datos financieros/costos (`.dashboard-cost__value`, `.dashboard-cost__meta`, `.dashboard-cost__operation-value`) y indices tecnicos (`.storyIndex`).

### 5. Texto "Alias: NWC" expone jerga tecnica

**Donde:** `Dashboard.tsx`, funcion `renderWalletCard()` (~linea 795-798)
**Que pasa:** Cuando la billetera esta conectada, muestra `"Alias: NWC"`. "NWC" es una sigla tecnica (Nostr Wallet Connect) que no le dice nada al usuario.
**Fix esperado:**
- Si `walletStatus.alias` es un valor tecnico como "NWC", no mostrarlo. Solo mostrar el alias si es un nombre descriptivo real (largo > 5 caracteres, no es una sigla pura en mayusculas).
- Alternativa: eliminar completamente la linea del alias y reemplazarla por un icono de check + "Conectada" que ya transmite el mismo mensaje.

### 6. Gramatica: "1 actividades para hoy" (singular/plural)

**Donde:** `src/i18n/locales/es-AR.json`, key `dashboard.today_summary`
**Que pasa:** El texto dice "1 actividades para hoy" cuando deberia decir "1 actividad para hoy" (singular).
**Fix esperado:**
- Implementar logica de pluralizacion. Opciones:
  - Agregar keys `dashboard.today_summary_one` y `dashboard.today_summary_other` y elegir en el componente segun `count === 1`.
  - O cambiar la key unica a `"{{count}} actividad(es) para hoy"` como solucion rapida (pero fea).
  - La mejor opcion: dos keys + seleccion en `Dashboard.tsx` donde se usa `t('dashboard.today_summary', { count: pendingTaskCount })`.

### 7. Boton "¡Listo!" sin contraste suficiente sobre fondo oscuro

**Donde:** `app/globals.css`, clase `.app-button--primary`
**Que pasa:** El boton "¡Listo!" dentro de la task card tiene texto oscuro (`#002b69`) sobre gradiente azul. Funciona en general, pero dentro de la card oscura el boton necesita mas presencia visual para que el usuario lo encuentre rapido.
**Fix esperado:**
- Verificar que el contraste del texto `#002b69` sobre `var(--brand)` (#88adff) cumpla WCAG AA (4.5:1). Actualmente el ratio es ~3.8:1 que NO cumple.
- Opcion A: Oscurecer el texto a `#001a40` para ganar contraste.
- Opcion B: Cambiar el texto a `#0a1628` (navy profundo) que asegura 4.5+:1.

---

## Reglas generales para los fixes

1. **i18n obligatorio**: Todo string visible usa `t('key')`. No hardcodear texto.
2. **Abuela-proof**: Si el usuario no va a entender un termino, no mostrarlo.
3. **Tipografia**: `Inter` para UI, `Plus Jakarta Sans` para headings, `Geist Mono` SOLO para costos/datos financieros.
4. **Glassmorphism**: Todos los paneles/cards deben tener `backdrop-filter: blur(16-22px)` y bordes semitransparentes.
5. **Animaciones**: Usar `framer-motion` con spring physics (`stiffness: 400, damping: 30`). Respetar `<MotionConfig reducedMotion="user">`.
6. **Accesibilidad**: `aria-labels` en botones interactivos, contraste WCAG AA minimo 4.5:1.
7. **Validar**: Despues de cada cambio ejecutar `npm run build` para verificar que compila sin errores.
