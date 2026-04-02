# Deploy en Vercel

LAP esta pensado para Vercel como preview y produccion. El deploy correcto requiere base cloud, secrets de auth y un proveedor LLM cloud.

## Requisitos

- Cuenta en Vercel
- PostgreSQL cloud en `DATABASE_URL`
- `SESSION_SECRET`
- `API_KEY_ENCRYPTION_SECRET`
- `OPENAI_API_KEY` o `OPENROUTER_API_KEY`
- `NEXTAUTH_URL`

`LAP_CODEX_AUTH_SESSION_JSON` no es un requisito de despliegue. Solo aplica si el backend local usa la sesion de Codex exportada.

## Flujo recomendado

1. Ejecutar `npm run doctor:deploy` antes de empujar cambios.
2. Linkear el repo a Vercel.
3. Usar `npm run vercel-build` como build command. Es un alias de `npm run build`.
4. Dejar que el `postbuild` ejecute `node scripts/vercel-prepare.mjs --postbuild`.
5. Si hace falta una accion explicita sobre DB, usar `LAP_POSTBUILD_DB_ACTION=migrate` o `LAP_POSTBUILD_DB_ACTION=push`.
6. `db:push` queda bloqueado por seguridad salvo que se habilite `LAP_POSTBUILD_DB_PUSH_ALLOW_DESTRUCTIVE=1`.

## Comandos

```bash
npm run doctor:deploy
npm run vercel-build
```

## Notas operativas

- No depender de Ollama en preview o produccion.
- No usar `AUTH_SECRET`; el proyecto valida `SESSION_SECRET`.
- `NEXTAUTH_URL` es recomendable para produccion y el doctor lo reporta como aviso si falta.
- Si `doctor:deploy` falla, corregir la configuracion antes de desplegar.
