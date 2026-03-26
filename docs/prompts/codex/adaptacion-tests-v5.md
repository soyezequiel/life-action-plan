# Tarea para Codex: Adaptación de Tests y Runner E2E Real para V5

> **Contexto Principal**: Hemos eliminado por completo el pipeline viejo (V1). Ya no existen `src/lib/skills/` ni `src/lib/pipeline/runner.ts`. Todos los esfuerzos operativos ahora apuntan únicamente y exclusivamente al motor V5 que vive en `src/lib/pipeline/v5/runner.ts`.

## Objetivos a completar

### 1. Limpieza de Tests Obsoletos en Vitest (`npm run test:watch`)
El comando de tests globales hoy arroja errores porque Vitest intenta correr archivos de tests antiguos que apuntan a componentes eliminados del pipeline viejo. 
**Tus tareas en esta sección:**
* Revisar el directorio `tests/` y eliminar (o marcar con `.skip` si dudás) cualquier test file que intente importar código de `src/lib/skills/` o el viejo `src/lib/pipeline/runner.ts`.
* Asegurarte de que *solo* corran exitosamente y en verde los tests nuevos, especialmente la suite de `tests/pipeline-v5/` y cualquier otro test genérico de dominio (`tests/domain`, `tests/shared`).
* El comando `npm run test` (Vitest) debe terminar de ejecutarse con 100% de pases limpios (en verde) sin explotar por módulos inexistentes.

### 2. Creación del script `lap:run:v5-real` (Runner End-to-End con IA Real)
Actualmente tenemos `scripts/lap-runner-v5-example.ts` que corre el V5 usando un `AgentRuntime` mockeado (de mentira). Necesitamos un script gemelo que use los verdaderos LLMs para poder diagnosticar la calidad de la IA.
**Tus tareas en esta sección:**
* Duplicar o crear un nuevo archivo `scripts/lap-runner-v5-real.ts`.
* En lugar de construir un runtime mockeado a nivel local, debés importar `getProvider(modelId, config)` expuesto en `src/lib/providers/provider-factory.ts`.
* Configurar este provider real pasándole el `OPENAI_API_KEY` o usar Ollama local (`qwen3:8b` o similar si prefieres entorno local), de manera que el `FlowRunnerV5` empiece a hacer requests reales (facturables) a la red y el sistema reciba outputs genuinos de la IA.
* Mantené los datos de entrada del ejemplo para que el objetivo siga guiándote en la prueba concreta ("Quiero aprender a tocar la guitarra...").
* Agregar en `package.json` un nuevo script: `"lap:run:v5-real": "tsx scripts/lap-runner-v5-real.ts"`.

### Notas de Aceptación
* El script real debe generar un archivo de simulación real en `tmp/pipeline-v5-real.json` con el `PlanPackage` íntegro.
* Vitest no debe saltar con errores de compilación por importaciones viejas.
