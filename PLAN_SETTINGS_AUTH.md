# Plan: Reestructuración Settings + Sistema de Cuentas

## Contexto

La app LAP usa un modelo single-user hardcodeado (`DEFAULT_USER_ID = 'local-user'`), sin auth, sin login, sin cuentas. Las API keys se cifran server-side con AES-256-GCM. La página de Settings (894 líneas) es un monolito que mezcla gestión de credenciales, wallet y build. Se necesita: (1) selector de modo LLM con cifrado E2E en cliente, (2) sistema de cuentas con modo anónimo, (3) reestructura completa del UI de Settings.

---

## Fase 1: Schema DB + Fundación Auth

### 1A. Dependencias nuevas (`package.json`)
- `argon2` — hash de contraseñas (Argon2id, memory 64MB, iterations 3, parallelism 1)
- `jose` — JWT ligero para sesiones en httpOnly cookie

### 1B. Schema (`src/lib/db/schema.ts`)

**Tabla `users`:**
| Columna | Tipo |
|---------|------|
| id | text (UUID, PK) |
| username | text (unique, not null) |
| email | text (unique, nullable) |
| passwordHash | text (not null) |
| hashAlgorithm | text (default 'argon2id') |
| createdAt / updatedAt | timestamp with tz |
| deletedAt | timestamp with tz, nullable (soft delete) |

**Tabla `sessions`:**
| Columna | Tipo |
|---------|------|
| id | text (UUID, PK) |
| userId | text (FK → users, on delete cascade) |
| tokenHash | text (not null) |
| expiresAt | timestamp with tz |
| createdAt | timestamp with tz |

**Tabla `encrypted_key_vaults`:**
| Columna | Tipo |
|---------|------|
| id | text (UUID, PK) |
| userId | text (FK → users, on delete cascade) |
| encryptedBlob | text (not null) |
| salt | text (not null) |
| createdAt / updatedAt | timestamp with tz |

**Modificación:** `profiles` — agregar columna `userId` (text, FK → users, nullable, on delete cascade).

### 1C. Password hashing — `src/lib/auth/password.ts` (nuevo)
- `hashPassword(plain)` → Argon2id (memory 64MB, iterations 3, parallelism 1)
- `verifyPassword(plain, hash)` → detecta algoritmo por prefijo del hash (`$argon2id$` vs `$2b$`)
- Salt único por hash (manejado internamente por argon2)

### 1D. Sesiones + JWT — `src/lib/auth/session.ts` (nuevo)
- `createSession(userId)` → genera JWT con `jose`, guarda SHA-256 del token en `sessions`, retorna token
- `validateSession(token)` → verifica firma JWT, retorna `{ userId }`
- `destroySession(token)` / `destroyAllSessions(userId)`
- Cookie: `lap-session`, httpOnly, secure, sameSite=lax, 30 días
- Secret: env var `SESSION_SECRET`

### 1E. Middleware — `middleware.ts` (nuevo, raíz del proyecto)
- Lee cookie `lap-session`, valida JWT
- Inyecta header `x-lap-user-id` en el request para rutas API
- Rutas públicas (sin validación): `/api/auth/register`, `/api/auth/login`
- Todo lo demás pasa con o sin user (anónimo es válido)

### 1F. Resolución de usuario — `src/lib/auth/resolve-user.ts` (nuevo)
- `resolveUserId(request)` → lee header `x-lap-user-id` o fallback a `'local-user'`
- Reemplaza gradualmente los imports directos de `DEFAULT_USER_ID`

---

## Fase 2: API Routes de Auth

### Archivos nuevos en `app/api/auth/`:

| Ruta | Método | Función |
|------|--------|---------|
| `register/route.ts` | POST | Crear cuenta (username + password), hashear con Argon2id, crear sesión, setear cookie |
| `login/route.ts` | POST | Verificar password, crear sesión, setear cookie |
| `logout/route.ts` | POST | Destruir sesión, limpiar cookie |
| `me/route.ts` | GET | Retornar user actual o `{ authenticated: false }` |
| `delete-account/route.ts` | POST | Confirmar con `"ELIMINAR"`, borrar en cascada dentro de transaction, limpiar cookie |

### Schemas (`app/api/_schemas.ts`) — agregar:
- `registerRequestSchema` — username (3-40 chars), password (8-128 chars). Zod `.strict()`
- `loginRequestSchema` — username, password. Zod `.strict()`
- `deleteAccountRequestSchema` — confirmation: literal `"ELIMINAR"`. Zod `.strict()`

---

## Fase 3: Crypto Client-Side (E2E)

### 3A. Web Crypto wrapper — `src/lib/client/client-crypto.ts` (nuevo, client-only)
- `deriveKeyFromPassword(password, salt)` → PBKDF2 + SHA-256, 600,000 iteraciones (Web Crypto API nativo, sin WASM)
- `encryptBlob(plaintext, key)` → AES-256-GCM, retorna `{ iv, ciphertext }` en base64
- `decryptBlob(iv, ciphertext, key)` → descifra y retorna plaintext
- `generateSalt()` → 16 bytes random via `crypto.getRandomValues`

### 3B. Key vault local — `src/lib/client/local-key-vault.ts` (nuevo)
- Interfaz `StoredApiKey { id, provider, alias, encryptedValue, iv, salt, createdAt }`
- CRUD sobre localStorage key `lap.keys.v1`
- Las keys se cifran con la contraseña de cifrado del usuario antes de guardarse
- La contraseña de cifrado solo vive en memoria durante la sesión, nunca se persiste

### 3C. Sync con servidor — `src/lib/client/vault-sync.ts` (nuevo)
- `uploadVaultBackup(encryptedBlob, salt)` → POST `/api/vault/backup`
- `downloadVaultBackup()` → GET `/api/vault/backup`
- El servidor solo almacena el blob opaco cifrado, nunca conoce las keys

### 3D. API vault — `app/api/vault/backup/route.ts` (nuevo)
- GET: retorna vault cifrado del user (requiere auth)
- POST: guarda/reemplaza vault (requiere auth)
- Zero-knowledge: el server nunca ve las keys en texto plano

---

## Fase 4: Reestructura UI de Settings

### 4A. Decomposición del monolito

`components/SettingsPageContent.tsx` (894 → ~150 líneas) se convierte en shell con selector de modo:

| Componente nuevo | Responsabilidad |
|------------------|----------------|
| `components/settings/LlmModeSelector.tsx` | Toggle visual "Mi propia conexión" vs "Asistente del servicio" (patrón radio-card) |
| `components/settings/OwnKeyManager.tsx` | Modo A: lista de keys locales cifradas, formulario para agregar key (proveedor + alias + clave), setup de contraseña de cifrado, toggle de backup en servidor |
| `components/settings/ServiceAiSelector.tsx` | Modo B: fetch modelos disponibles desde `/api/models/available`, selección como cards |
| `components/settings/WalletSection.tsx` | Extraído de SettingsPageContent.tsx actual (líneas ~746-817): conexión/desconexión de wallet |
| `components/settings/AccountSection.tsx` | Si anónimo: formulario login/registro. Si autenticado: info cuenta + logout + eliminar cuenta |
| `components/settings/BuildSection.tsx` | Configuración de build de plan, extraído de lógica actual (~líneas 564-743) |

### 4B. API modelos disponibles — `app/api/models/available/route.ts` (nuevo)
- GET: consulta `credentialRegistry` por credenciales backend con `status = 'active'`
- Retorna `[{ providerId, modelId, displayName }]`
- No requiere auth (info pública del servicio)

### 4C. CSS — `components/SettingsPageContent.module.css`
- Agregar estilos para selector de modo (tab/radio-card)
- Reutilizar glassmorphism y grid existentes
- Crear CSS modules para sub-componentes si es necesario

---

## Fase 5: Transición Anónimo → Autenticado

### 5A. Claim de datos — `app/api/auth/claim-local-data/route.ts` (nuevo)
- POST (requiere auth): acepta `{ localProfileId }`
- Actualiza `profiles` donde `userId IS NULL AND id = localProfileId` → `userId = user autenticado`
- Cascada: plans, progress, userSettings, credentialRegistry con `ownerId = 'local-user'` se reasignan

### 5B. Flujo client-side en `AccountSection.tsx`
- Post registro/login: revisa localStorage por `lap.local-profile-id`
- Si existe, llama `/api/auth/claim-local-data`
- En éxito, limpia el marker de localStorage

### 5C. Banner en Dashboard — `components/Dashboard.tsx`
- Si user anónimo + 1 plan creado → banner dismissible: "Creá una cuenta para acceder desde cualquier dispositivo"
- Estado en localStorage: `lap.account-nudge-dismissed`

---

## Fase 6: i18n

### Nuevas keys en `src/i18n/locales/es-AR.json`

**Sección `auth`:**
```json
{
  "auth.login_title": "Entrar a tu cuenta",
  "auth.register_title": "Crear tu cuenta",
  "auth.username_label": "Nombre de usuario",
  "auth.username_placeholder": "Tu nombre de usuario",
  "auth.password_label": "Contraseña",
  "auth.password_placeholder": "Tu contraseña",
  "auth.login_button": "Entrar",
  "auth.register_button": "Crear cuenta",
  "auth.logout_button": "Salir",
  "auth.or_register": "¿No tenés cuenta?",
  "auth.or_login": "¿Ya tenés cuenta?",
  "auth.delete_title": "Borrar mi cuenta",
  "auth.delete_hint": "Esto borra todo: tu perfil, tus planes y tu configuración. No se puede deshacer.",
  "auth.delete_confirm_label": "Escribí ELIMINAR para confirmar",
  "auth.delete_button": "Borrar todo",
  "auth.delete_success": "Tu cuenta fue eliminada.",
  "auth.account_info": "Sesión iniciada como {{username}}"
}
```

**Sección `settings.llm_mode`:**
```json
{
  "settings.llm_mode.title": "Cómo querés que funcione el asistente",
  "settings.llm_mode.own_key_title": "Usar mi propia conexión",
  "settings.llm_mode.own_key_hint": "Vos ponés la clave de acceso. Se guarda solo en este dispositivo.",
  "settings.llm_mode.service_title": "Usar el asistente del servicio",
  "settings.llm_mode.service_hint": "LAP se encarga de todo. Solo elegís el nivel de asistente."
}
```

**Sección `settings.own_keys`:**
```json
{
  "settings.own_keys.title": "Mis conexiones",
  "settings.own_keys.add_title": "Agregar conexión",
  "settings.own_keys.provider_label": "Servicio",
  "settings.own_keys.alias_label": "Nombre para identificarla",
  "settings.own_keys.alias_placeholder": "Ej: Mi cuenta personal",
  "settings.own_keys.key_label": "Clave de acceso",
  "settings.own_keys.key_placeholder": "Pegá tu clave",
  "settings.own_keys.save": "Guardar conexión",
  "settings.own_keys.empty": "Todavía no guardaste ninguna conexión.",
  "settings.own_keys.encryption_password_title": "Contraseña de protección",
  "settings.own_keys.encryption_password_hint": "Esta contraseña protege tus claves. Guardala bien, no la podemos recuperar.",
  "settings.own_keys.encryption_password_placeholder": "Tu contraseña de protección",
  "settings.own_keys.backup_toggle": "Respaldar en mi cuenta",
  "settings.own_keys.backup_hint": "Guardamos una copia protegida para que la recuperes desde otro dispositivo.",
  "settings.own_keys.restore_title": "Recuperar mis conexiones",
  "settings.own_keys.restore_hint": "Ingresá tu contraseña de protección para recuperar las claves.",
  "settings.own_keys.delete": "Eliminar"
}
```

**Sección `settings.service_models`:**
```json
{
  "settings.service_models.title": "Asistentes disponibles",
  "settings.service_models.empty": "No hay asistentes disponibles ahora.",
  "settings.service_models.selected": "Usando: {{name}}"
}
```

**Dashboard:**
```json
{
  "dashboard.account_nudge": "Creá una cuenta para acceder desde cualquier dispositivo.",
  "dashboard.account_nudge_dismiss": "Ahora no"
}
```

**Regla abuela-proof:** "clave de acceso" (no "API key"), "conexión" (no "credencial"), "contraseña de protección" (no "encryption password"), "asistente" (no "LLM/modelo").

---

## Fase 7: Migración Multi-User

### Archivos a modificar (reemplazar `DEFAULT_USER_ID` por `resolveUserId(request)`):
- `app/api/settings/api-key/route.ts`
- `app/api/_user-settings.ts`
- `src/lib/auth/credential-config.ts` (línea ~86, `resolveOwnerId`)
- Otros API routes que usen `DEFAULT_USER_ID` directamente

### Compatibilidad:
- `DEFAULT_USER_ID` sigue exportado como fallback para sesiones anónimas
- Datos existentes con `ownerId = 'local-user'` siguen funcionando sin cambios
- El claim flow (Fase 5) maneja la transición cuando el usuario crea cuenta

---

## Fase 8: Tests

| Test file | Cubre |
|-----------|-------|
| `tests/password-hashing.test.ts` | Argon2id output, verificación correcta, bcrypt fallback |
| `tests/session.test.ts` | Crear sesión, validar, destruir, expiración |
| `tests/auth-routes.test.ts` | Register, login, logout, me, delete-account (end-to-end) |
| `tests/client-crypto.test.ts` | Encrypt/decrypt round-trip con Web Crypto |
| `tests/local-key-vault.test.ts` | CRUD con localStorage mock |
| `tests/llm-mode-selector.test.tsx` | Switch de modo renderiza sub-componentes correctos |

---

## Orden de ejecución

```
Fase 1 (DB + Auth base) ──┐
                           ├── Fase 2 (Auth API routes)
Fase 3 (Client crypto) ───┤
                           ├── Fase 4 (Settings UI)
                           ├── Fase 5 (Anónimo → Auth)
                           ├── Fase 7 (Multi-user migration)
                           └── Fase 8 (Tests incrementales)

Fase 6 (i18n) → incremental con cada fase
```

Fases 1 y 3 pueden arrancar en paralelo.

---

## Verificación

1. `npm run build` — sin errores de compilación
2. Tests: `npx vitest run` — todos pasan
3. Flujo manual:
   - Abrir Settings → ver selector de modo
   - Modo A: agregar key → verificar que se guarda en localStorage cifrada → no aparece en network tab
   - Modo B: ver modelos disponibles del backend
   - Crear cuenta → verificar cookie httpOnly → verificar hash en DB (no plaintext)
   - Desde anónimo con plan → crear cuenta → verificar claim de datos
   - Eliminar cuenta → verificar borrado en cascada completo
4. Responsive: verificar layout en mobile (<980px)

---

## Decisiones arquitectónicas clave

1. **JWT + tabla sessions** (no next-auth): superficie auth simple, `jose` es ~5KB. La tabla sessions permite revocar sesiones (logout, delete).
2. **PBKDF2 client-side** (no Argon2 browser): Web Crypto API nativo, sin WASM extra (+50KB).
3. **localStorage** (no IndexedDB): las keys cifradas son JSON pequeño, localStorage es más simple y suficiente.
4. **`userId` nullable en profiles**: backward-compatible, anónimos siguen funcionando exactamente como hoy.
5. **Blob opaco en server**: zero-knowledge sobre keys del usuario incluso si la DB se compromete.

---

## Reglas del proyecto a respetar

- Lee `AGENTS.md` y `CLAUDE.md` antes de empezar
- i18n obligatorio: `t()` de `src/i18n/index.ts`, nunca hardcodear strings
- Abuela-proof: no exponer "LLM", "API", "Token", "hash", "cifrado" en UI
- PostgreSQL + Drizzle, schemas con Zod `.strict()`
- Luxon para fechas, no `new Date()`
- API keys solo server-side o cifradas E2E
- No Electron: cero imports de electron/better-sqlite3
- Validar con `npm run build` si se tocan `app/api/`, `src/lib/db/` o contratos compartidos
