# LAP

LAP es una web app Next.js 15 para crear, simular y ejecutar planes de accion personales con asistencia de LLM.

## Requisitos

- Node.js 20 o superior
- PostgreSQL

## Desarrollo local

```bash
npm install
cp .env.example .env.local
npm run db:push
npm run dev
```

Configura estos valores en `.env.local`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lap
SESSION_SECRET=escribe_un_texto_largo_y_secreto
API_KEY_ENCRYPTION_SECRET=otro_texto_largo_y_secreto
OPENAI_API_KEY=sk-tu-clave
# o OPENROUTER_API_KEY=...
NEXTAUTH_URL=http://localhost:3000
```

## Build y deploy

```bash
npm run build
npm run doctor:deploy
```

Para Vercel:

- usar PostgreSQL cloud en `DATABASE_URL`
- configurar `SESSION_SECRET` y `API_KEY_ENCRYPTION_SECRET`
- configurar `OPENAI_API_KEY` o `OPENROUTER_API_KEY`
- configurar `NEXTAUTH_URL`
- no depender de Ollama en preview o produccion

`npm run vercel-build` es el alias de build usado por Vercel y dispara el flujo de postbuild definido en `package.json`.

## Docs

- `AGENTS.md` para contexto operativo
- `docs/README.md` para indice documental
- `docs/architecture/REGISTRY.json` para arquitectura vigente
- `docs/plans/REGISTRY.json` para planes vigentes
