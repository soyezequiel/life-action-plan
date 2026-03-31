# Despliegue en Vercel - Guía LAP

Esta guía detalla los pasos para desplegar LAP en Vercel, asegurando que la conexión con el LLM (Codex/OpenAI) y la base de datos funcionen correctamente en un entorno serverless.

## 1. Requisitos Previos

- Tener una cuenta en [Vercel](https://vercel.com).
- Tener una base de datos PostgreSQL en la nube (ej: Vercel Postgres, Neon o Supabase).
- Haber iniciado sesión localmente en Codex (`npm run codex:login`).

## 2. Variables de Entorno

Debes configurar las siguientes variables en el dashboard de Vercel (**Project Settings > Environment Variables**):

| Variable | Importancia | Descripción |
| --- | --- | --- |
| `DATABASE_URL` | **CRÍTICO** | URL de tu Postgres Cloud (Neon, Supabase, etc). |
| `AUTH_SECRET` | **CRÍTICO** | Secreto para Auth.js. Genera uno con `openssl rand -base64 32`. |
| `LAP_CODEX_AUTH_SESSION_JSON` | **CRÍTICO** | Sesión de Codex exportada (ver paso 3). |
| `OPENROUTER_API_KEY` | Opcional | Si prefieres usar OpenRouter en lugar de Codex. |
| `OPENAI_API_KEY` | Opcional | Si prefieres usar OpenAI directo. |

## 3. Exportar Sesión de Codex

Como Vercel no tiene disco persistente para guardar tu login de ChatGPT/Codex, usamos una variable de entorno con el contenido de tu sesión local.

Ejecuta en tu terminal local:
```bash
npm run codex:export-env
```
Copia el JSON resultante y pégalo íntegro en la variable `LAP_CODEX_AUTH_SESSION_JSON` en Vercel.

## 4. Despliegue

### Opción A: Vercel CLI (Recomendado)
Si tienes el CLI de Vercel instalado y autenticado:
```bash
vercel link
vercel deploy
```

### Opción B: Git Push
Simplemente sube tus cambios a GitHub/GitLab:
```bash
git add .
git commit -m "preparar para vercel"
git push
```

## 5. Verificación

Una vez desplegado, puedes verificar que todo esté correcto ejecutando el "doctor" de deploy:
```bash
npm run doctor:deploy
```
*Nota: Este comando verifica internamente que los timeouts de 120s y las variables de entorno cloud estén presentes.*

---

> [!TIP]
> **Timeouts de IA**: Vercel Hobby tiene un límite de ejecución de 10-60s. LAP está configurado para pedir **120s** (`maxDuration`), lo cual requiere un plan **Vercel Pro** para que el pipeline de IA no se corte a mitad de camino.

> [!WARNING]
> **Ollama**: LAP no soporta Ollama en Vercel ya que requiere un servidor local que no está disponible en la nube. Asegúrate de configurar Codex o una API Cloud.
