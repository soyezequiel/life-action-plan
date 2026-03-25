# Plan: Completitud de Datos en el Visualizador de Flujo

> **Objetivo**: Que cada nodo del visualizador muestre la información relevante que la fase produce.
> **Agente implementador**: Gemini 3 Flash (o cualquier agente disponible)

## Contexto

El visualizador de flujo (`/debug/flow`) muestra nodos para cada fase del pipeline LAP. Actualmente algunos nodos producen datos ricos pero solo muestran un dato mínimo (ej: intake solo muestra un Profile ID truncado). El usuario debe poder ver qué capturó cada fase sin salir del visualizador.

## Arquitectura relevante

El flujo de datos es:

```
FlowRunner (runner.ts)
  → ejecuta cada fase y guarda resultados en PipelineContext
  → lap-runner.ts llama a persistContext() que invoca mapContextToRuntimeData()
    → pipeline-runtime-data.ts: PipelineRuntimeData (snapshot serializable)
      → se escribe a tmp/pipeline-context.json
        → FlowViewer.tsx lo pollea cada 2s via /api/debug/pipeline-context
          → generateGraphData() inyecta runtimeData/runtimeStatus en cada nodo
            → FlowStepNode.tsx: RuntimeSummary muestra resumen in-line
            → FlowDetailModal.tsx: modal con detalle expandido al clickear
```

**Archivos clave a modificar**:
1. `src/lib/flow/pipeline-runtime-data.ts` — Tipo + mapper
2. `src/lib/pipeline/runner.ts` — Enriquecer datos guardados en context
3. `components/debug/FlowStepNode.tsx` — RuntimeSummary por fase
4. `components/debug/FlowDetailModal.tsx` — Modal de detalle por fase
5. `src/i18n/index.ts` — Strings nuevos

## Pasos de implementación

### Paso 1: Enriquecer datos de intake en el mapper

**Archivo**: `src/lib/flow/pipeline-runtime-data.ts`

Cambiar la interfaz `PipelineRuntimeData.intake`:

```diff
   intake?: {
     profileId: string
+    nombre?: string
+    edad?: number
+    ciudad?: string
+    objetivo?: string
   }
```

Cambiar el mapper `mapContextToRuntimeData`, bloque de intake (línea ~81):

```diff
   if (context.profileId) {
-    data.intake = { profileId: context.profileId }
+    data.intake = {
+      profileId: context.profileId,
+      nombre: context.intakeSummary?.nombre,
+      edad: context.intakeSummary?.edad,
+      ciudad: context.intakeSummary?.ciudad,
+      objetivo: context.intakeSummary?.objetivo,
+    }
   }
```

### Paso 2: Agregar `intakeSummary` al contexto del pipeline

**Archivo**: `src/lib/pipeline/contracts.ts`

Agregar al tipo `PipelineContext`:

```diff
 export interface PipelineContext {
   profileId?: string
   planId?: string
   config: RunnerConfig
+  intakeSummary?: {
+    nombre: string
+    edad: number
+    ciudad: string
+    objetivo: string
+  }
   results: {
```

### Paso 3: Poblar `intakeSummary` desde el runner

**Archivo**: `src/lib/pipeline/runner.ts`

En el método `_runIntakePhase()` (línea ~209), después de guardar el profileId, cargar el perfil y extraer los datos visibles:

```diff
   private async _runIntakePhase(): Promise<any> {
     const cfg = this.context.config.intake
     const result = await processIntake(cfg)
     this.context.profileId = result.profileId
     this.context.results.intake = result
+
+    // Extraer datos visibles para el visualizador de flujo
+    try {
+      const profileRow = await getProfile(result.profileId)
+      if (profileRow) {
+        const profile = parseStoredProfile(profileRow.data)
+        if (profile) {
+          const p = profile.participantes[0]
+          this.context.intakeSummary = {
+            nombre: p?.datosPersonales?.nombre ?? '',
+            edad: p?.datosPersonales?.edad ?? 0,
+            ciudad: p?.datosPersonales?.ubicacion?.ciudad ?? '',
+            objetivo: profile.objetivos[0]?.descripcion ?? ''
+          }
+        }
+      }
+    } catch {
+      // Non-fatal: intake summary is optional for the visualizer
+    }
+
     return result
   }
```

> **NOTA**: `getProfile` y `parseStoredProfile` ya están importados en este archivo (líneas 5 y 4).

### Paso 4: Enriquecer datos de build en el mapper

**Archivo**: `src/lib/flow/pipeline-runtime-data.ts`

Expandir `PipelineRuntimeData.build`:

```diff
   build?: {
     planId: string
     nombre: string
     eventCount: number
+    resumen?: string
+    fallbackUsed?: boolean
+    tokensUsed?: { input: number; output: number }
     eventos: Array<{
```

Actualizar el mapper (bloque line ~104):

```diff
   if (context.results.build) {
     const build = context.results.build
     data.build = {
       planId: build.planId,
       nombre: build.nombre,
       eventCount: build.eventos?.length ?? 0,
+      resumen: build.resumen,
+      fallbackUsed: build.fallbackUsed,
+      tokensUsed: build.tokensUsed,
       eventos: (build.eventos ?? []).map(ev => ({
```

### Paso 5: Actualizar RuntimeSummary de intake en FlowStepNode.tsx

**Archivo**: `components/debug/FlowStepNode.tsx`

Reemplazar el caso `intake` en la función `RuntimeSummary` (línea ~18):

```typescript
  if (resolvedPhase === 'intake') {
    const d = runtimeData as { profileId?: string; nombre?: string; objetivo?: string }
    return (
      <div className="node-runtime-summary">
        {d.nombre && (
          <span className="node-runtime-row node-runtime-name">{d.nombre}</span>
        )}
        {d.objetivo && (
          <span className="node-runtime-row">{d.objetivo}</span>
        )}
        <span className="node-runtime-row">{t('debug.flow.intake_profile_id')}: <code>{String(d.profileId ?? '').slice(0, 8)}...</code></span>
      </div>
    )
  }
```

### Paso 6: Actualizar RuntimeSummary de build en FlowStepNode.tsx

Agregar resumen al caso `build` (línea ~53):

```typescript
  if (resolvedPhase === 'build') {
    const d = runtimeData as { nombre?: string; eventCount?: number; resumen?: string; fallbackUsed?: boolean }
    return (
      <div className="node-runtime-summary">
        <span className="node-runtime-row node-runtime-name">{d.nombre ?? '—'}</span>
        {d.resumen && (
          <span className="node-runtime-row" style={{ fontSize: '0.75rem', color: '#9d9a97' }}>
            {d.resumen.length > 80 ? d.resumen.slice(0, 80) + '…' : d.resumen}
          </span>
        )}
        <span className="node-runtime-row">{t('debug.flow.summary_events', { count: d.eventCount ?? 0 })}</span>
        {d.fallbackUsed && (
          <span className="node-runtime-row node-runtime-warn">⚠ {t('debug.flow.build_fallback_used')}</span>
        )}
      </div>
    )
  }
```

### Paso 7: Actualizar IntakeDetail en FlowDetailModal.tsx

**Archivo**: `components/debug/FlowDetailModal.tsx`

Reemplazar la función `IntakeDetail`:

```typescript
function IntakeDetail({ data }: { data: Record<string, unknown> }) {
  const d = data as { profileId?: string; nombre?: string; edad?: number; ciudad?: string; objetivo?: string }
  return (
    <>
      {d.nombre && (
        <>
          <p className="detail-section-title">{t('debug.flow.intake_user')}</p>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#e4e0db', marginBottom: '0.5rem' }}>
            {d.nombre}{d.edad ? ` (${d.edad} años)` : ''}{d.ciudad ? ` — ${d.ciudad}` : ''}
          </div>
        </>
      )}
      {d.objetivo && (
        <>
          <p className="detail-section-title">{t('debug.flow.intake_objective')}</p>
          <div style={{ fontSize: '0.9rem', color: '#b9b5b2', marginBottom: '1rem', lineHeight: 1.5 }}>
            {d.objetivo}
          </div>
        </>
      )}
      <p className="detail-section-title">{t('debug.flow.intake_profile_id')}</p>
      <div className="detail-profile-id">{d.profileId ?? '—'}</div>
    </>
  )
}
```

### Paso 8: Actualizar BuildDetail en FlowDetailModal.tsx

Agregar resumen, planId, fallback y tokens al componente `BuildDetail`. Después de la línea que muestra el nombre del plan:

```diff
       <div style={{ fontSize: '1rem', fontWeight: 600, color: '#e4e0db', marginBottom: '1rem' }}>{d.nombre ?? '—'}</div>

+      {d.resumen && (
+        <>
+          <p className="detail-section-title">{t('debug.flow.build_summary')}</p>
+          <div style={{ fontSize: '0.88rem', color: '#b9b5b2', marginBottom: '1rem', lineHeight: 1.5 }}>{d.resumen}</div>
+        </>
+      )}
+
+      {d.planId && (
+        <>
+          <p className="detail-section-title">Plan ID</p>
+          <div className="detail-profile-id" style={{ marginBottom: '1rem' }}>{d.planId}</div>
+        </>
+      )}
+
+      {d.fallbackUsed && (
+        <div style={{ fontSize: '0.82rem', color: '#f2bf82', marginBottom: '1rem' }}>⚠ {t('debug.flow.build_fallback_used')}</div>
+      )}
+
+      {d.tokensUsed && (
+        <>
+          <p className="detail-section-title">{t('debug.flow.build_tokens')}</p>
+          <div style={{ fontSize: '0.85rem', color: '#9d9a97', marginBottom: '1rem' }}>
+            Entrada: {d.tokensUsed.input?.toLocaleString()} · Salida: {d.tokensUsed.output?.toLocaleString()}
+          </div>
+        </>
+      )}
+
       <p className="detail-section-title">{t('debug.flow.build_events')} ({d.eventCount ?? 0})</p>
```

Actualizar el type cast de `BuildDetail`:
```diff
-  const d = data as {
-    nombre?: string
-    eventCount?: number
-    eventos?: Array<...>
-  }
+  const d = data as {
+    nombre?: string
+    eventCount?: number
+    resumen?: string
+    planId?: string
+    fallbackUsed?: boolean
+    tokensUsed?: { input: number; output: number }
+    eventos?: Array<...>
+  }
```

### Paso 9: Agregar strings de i18n

**Archivo**: `src/i18n/index.ts`

Agregar estas líneas dentro del objeto `runtimeFallbacks`, después de la línea `'debug.flow.intake_profile_id'`:

```typescript
  'debug.flow.intake_user': 'Usuario',
  'debug.flow.intake_objective': 'Objetivo principal',
  'debug.flow.build_summary': 'Resumen del plan',
  'debug.flow.build_fallback_used': 'Se usó el respaldo local',
  'debug.flow.build_tokens': 'Tokens consumidos',
```

### Paso 10: Verificar

1. Ejecutar `npm run typecheck` — debe pasar sin errores nuevos
2. Ejecutar `npm run lap:run:example`
3. Abrir `http://localhost:3000/debug/flow`
4. Verificar:
   - Nodo de Ingesta: muestra nombre + objetivo + ID
   - Modal de Ingesta: muestra nombre, edad, ciudad, objetivo y Profile ID
   - Nodo de Construcción: muestra nombre + resumen (truncado) + eventos + badge de fallback
   - Modal de Construcción: muestra resumen completo, Plan ID, tokens, tabla de eventos

## Reglas

- No hardcodear strings de UI — usar i18n
- Zod `.strict()` en schemas nuevos si aplica
- No romper los datos que ya se muestran, solo agregar
- Si el cambio toca `app/api/` o `src/lib/db/`, correr `npm run build`
- Correr `npm run typecheck` al final
