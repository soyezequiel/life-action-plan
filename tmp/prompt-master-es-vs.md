# Prompt Master ES vs Prompt Master ES v2

## Skills comparadas

- Original: [C:\Users\soyal\.codex\skills\prompt-master-es\SKILL.md](C:\Users\soyal\.codex\skills\prompt-master-es\SKILL.md)
- v2: [C:\Users\soyal\.codex\skills\prompt-master-es-v2\SKILL.md](C:\Users\soyal\.codex\skills\prompt-master-es-v2\SKILL.md)

## Caso de prueba

Prompt crudo de entrada:

```text
Necesito que Codex arregle el login roto en `src/auth.ts` y tambien mejore la UX de `components/settings/BuildSection.tsx`. No agregues dependencias, no toques base de datos, y el repo puede tener cambios mios sin commitear.
```

Criterios de evaluacion:

1. Claridad del objetivo
2. Control de alcance
3. Seguridad operacional
4. Criterio de cierre verificable
5. Eficiencia de tokens
6. Adecuacion al tipo de herramienta

## Salida esperada segun la skill original

```text
Prompt 1 — Fix the broken login flow

Objective:
Fix the broken login flow in `src/auth.ts` with the smallest correct change.

Starting State:
- The broken behavior is in `src/auth.ts`.
- The repository may contain unrelated uncommitted user changes.
- Database-related files and schemas must remain untouched.

Target State:
- The login flow works correctly again.
- The fix stays limited to the auth path and preserves existing contracts unless a minimal local adjustment is required.

Allowed Scope:
- Inspect and modify `src/auth.ts`
- Modify directly related local auth helpers only if strictly necessary to complete the fix

Forbidden Actions:
- Do not add dependencies
- Do not touch database code, migrations, or schemas
- Do not revert unrelated changes
- Do not expand the task beyond the login fix

Human Review Triggers:
- Stop and ask before deleting files
- Stop and ask before changing schemas
- Stop and ask before adding dependencies
- Stop and ask before touching external accounts or services

Done When:
- The root cause of the login failure is fixed
- The login path is validated with the smallest relevant check available
- Unrelated behavior is left unchanged

Prompt 2 — Improve the settings UX

Objective:
Improve the UX of `components/settings/BuildSection.tsx` without changing unrelated product behavior.

Starting State:
- The target UI surface is `components/settings/BuildSection.tsx`
- The repository may contain unrelated uncommitted user changes

Target State:
- The settings experience is clearer and easier to use
- The work stays limited to the specified UI surface and directly related local styling or helper code only if required

Allowed Scope:
- Inspect and modify `components/settings/BuildSection.tsx`
- Modify directly related local styles or helpers only if strictly necessary

Forbidden Actions:
- Do not add dependencies
- Do not touch database code, migrations, or schemas
- Do not revert unrelated changes
- Do not redesign unrelated settings surfaces

Human Review Triggers:
- Stop and ask before deleting files
- Stop and ask before changing schemas
- Stop and ask before adding dependencies
- Stop and ask before affecting external services

Done When:
- The UI is clearer, more self-explanatory, and easier to use
- The scope stays limited to the requested settings area
- The result is validated with the smallest relevant visible or automated check available
```

## Salida esperada segun Prompt Master ES v2

```text
Prompt 1

Objective:
Fix the broken login flow in `src/auth.ts` with the smallest correct change.

Starting State:
- The issue is in `src/auth.ts`
- The repo may contain unrelated uncommitted changes

Target State:
- The login flow works again
- Existing contracts stay intact unless a minimal local fix is required

Scope:
Only work in `src/auth.ts` and directly imported local auth helpers if required.

Do Not:
- Do not add dependencies
- Do not touch database code, migrations, or schemas
- Do not revert unrelated changes
- Do not broaden the task beyond the login fix

Stop and Ask Before:
- deleting files
- changing schemas
- adding dependencies
- touching external accounts or services

Done When:
- the root cause is fixed
- the login path is validated with the smallest relevant check
- unrelated behavior remains unchanged

Prompt 2

Objective:
Improve the UX of `components/settings/BuildSection.tsx` without changing unrelated behavior.

Starting State:
- The target UI is `components/settings/BuildSection.tsx`
- The repo may contain unrelated uncommitted changes

Target State:
- The section is clearer and easier to use

Scope:
Only work in `components/settings/BuildSection.tsx` and directly related local styles if required.

Do Not:
- Do not add dependencies
- Do not touch database code, migrations, or schemas
- Do not revert unrelated changes
- Do not redesign unrelated settings surfaces

Stop and Ask Before:
- deleting files
- changing schemas
- adding dependencies
- touching external services

Done When:
- the section is more understandable and easier to use
- the scope stays local
- the result is validated with the smallest relevant visible or automated check
```

## Puntuacion

| Criterio | Original | v2 | Comentario |
|----------|----------|----|------------|
| Claridad del objetivo | 9/10 | 9/10 | Ambas aterrizan bien la tarea |
| Control de alcance | 9/10 | 9.5/10 | v2 es mas seca y mas dificil de malinterpretar |
| Seguridad operacional | 9/10 | 9/10 | Empate; ambas cubren triggers importantes |
| Criterio de cierre | 8.5/10 | 9/10 | v2 deja el `Done When` mas compacto y chequeable |
| Eficiencia de tokens | 7.5/10 | 9.5/10 | v2 evita relleno y repeticiones |
| Adecuacion a la herramienta | 8.5/10 | 9.5/10 | v2 usa mejor el formato agentico para Codex |

## Veredicto

Ganadora: **Prompt Master ES v2**

Por que:

- Resuelve la misma tarea con menos carga verbal.
- El modo `split` le queda natural; en la original esto funciona, pero pelea contra su contrato global de "un unico bloque".
- El formato de v2 es mas reusable para Codex real: objetivo, scope, no-tocar, stop conditions y done when.
- La skill original sigue siendo buena, pero tiene mas tendencia a sobre-explicar y a repetir estructura.

## Conclusion practica

Si el objetivo es producir prompts mas compactos, consistentes y faciles de ejecutar en agentes de codigo, hoy **v2** es mejor.
Si quieres una skill mas enciclopedica y mas amplia en cobertura explicita por herramienta, la original todavia tiene valor como referencia.
