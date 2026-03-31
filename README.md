<div align="center">
  <h1>🌟 Pulso (Life Action Plan)</h1>
  <p><strong>Transforma tus objetivos en planes de acción estructurados, paso a paso.</strong></p>
  <br />
  <a href="https://life-action-plan.vercel.app/">
    <img src="https://img.shields.io/badge/Usar%20Aplicaci%C3%B3n%20Web-Live%20Demo-success?style=for-the-badge&logo=vercel" alt="Live Demo" height="35" />
  </a>
</div>

<br />

## 👋 ¿Qué es Pulso?

**Pulso** es tu asistente personal de planificación. Toma esa idea, proyecto o meta gigante que tienes en la cabeza y usa Inteligencia Artificial para dividirla en un plan de acción claro, con fases, hitos y tareas totalmente manejables.

Ya no más "no sé por dónde empezar". Pulso te guía, te muestra cuánto tiempo te tomará realmente y te ayuda a hacer el seguimiento de tu progreso día a día para que no rompas tu racha.

🔗 **¡Pruébalo ahora mismo!** 👉 [life-action-plan.vercel.app](https://life-action-plan.vercel.app/)

---

## ✨ Características Principales

- 🎯 **Entrevista Guiada:** Solo responde un par de preguntas naturales sobre tu meta y tus tiempos. Pulso hace el resto.
- 🤖 **IA al Mando:** Construye un plan estructurado, adaptado a tu contexto y con dependencias listas para completarse.
- ⚖️ **Baño de Realidad:** Compara el tiempo que exige tu plan con tu tiempo libre real. Nada de sobrecargas ilusorias.
- 📆 **Simulación y Calendario:** Visualiza tu plan semana a semana y expórtalo a tu calendario favorito (`.ics`).
- ⚡ **Dashboard Diario:** Revisa tus tareas, marca tu progreso con un clic y mantén tu racha intacta.
- 🚀 **Despliegue Rápido:** Construido para funcionar al instante.

---

## 🛠️ Para Desarrolladores (Cómo ejecutarlo en tu PC)

Si quieres correr Pulso en tu propia máquina (para modificarlo o probarlo localmente), aquí tienes todo lo que necesitas. 
La aplicación está construida con tecnología moderna y sólida: **Next.js 15, React 19, TypeScript, PostgreSQL y Drizzle ORM.**

### 1. Requisitos Previos

- **Node.js 20** o superior.
- Una base de datos **PostgreSQL** (puede estar instalada en tu PC u hospedada en la nube como Neon, Supabase, etc.).

### 2. Descarga e Instalación

Abre tu terminal, clona el repositorio (o ubícate en la carpeta) e instala las dependencias:

```bash
npm install
```

Luego, prepara tu archivo de configuración de entorno (donde irán tus contraseñas y claves privadas):

```bash
cp .env.example .env.local
```

### 3. Configuración (`.env.local`)

Abre el archivo recién creado `.env.local` con cualquier editor de texto y completa estos valores fundamentales:

```env
# Tu conexión a la base de datos PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lap

# Una contraseña aleatoria y larga para proteger las sesiones de usuario
SESSION_SECRET=escribe_aqui_un_texto_muy_largo_y_secreto

# Tu clave privada de OpenAI (para la generación de planes)
OPENAI_API_KEY=sk-tu-clave-de-openai
```

### 4. Preparar la Base de Datos

Antes de arrancar, necesitas que el sistema cree las tablas en tu base de datos:

```bash
npm run db:push
```

### 5. ¡A jugar!

Levanta el servidor en modo desarrollo:

```bash
npm run dev
```

Ve a tu navegador y entra a `http://localhost:3000`. ¡Listo!

---

## 🚀 Despliegue en Vercel (Para Producción)

Si quieres subir tu propia versión de Pulso a internet (igual que la demo en vivo), está 100% optimizado para Vercel:

1. Importa tu repositorio en **Vercel**.
2. Asegúrate de configurar el **Build Command** así: 
   `npm run vercel-build` *(Esto ejecuta migraciones automáticas además del build)*.
3. Configura tus **Variables de Entorno** en Vercel:
   - `DATABASE_URL` (Tu DB en la nube, ej. Neon)
   - `SESSION_SECRET` (Un string seguro)
   - `API_KEY_ENCRYPTION_SECRET` (Otro string seguro para las keys)
   - `OPENAI_API_KEY` (Opcional, si usarás OpenAI directo)
   - `NEXTAUTH_URL` (La URL pública que te asigne Vercel, ej. `https://mi-pulso.vercel.app`)

---

> [!NOTE]  
> **Arquitectura Interna:** Para información detallada sobre decisiones técnicas y manuales para agentes, consulta `/docs` o lee nuestro archivo base `AGENTS.md`.

<div align="center">
  <sub>Private — All rights reserved.</sub>
</div>
