# Mapa Mental — LAP (Life Action Planner)

> Abrir en Obsidian en **Reading View** (`Ctrl+E`) para ver el diagrama.

```mermaid
mindmap
  root((LAP))
    Frontend
      Dashboard
      Intake
      Plan y Flow
      Settings
      Calendario
      Inspector LLM
    API — 20+ endpoints
      intake y profile
      plan/build SSE
      simulate y export
      progress y streak
      wallet y cost
      debug
    Pipeline V6
      Orquestador + FSM
      7 Agentes
        Goal Interpreter
        Clarifier
        Domain Expert
        Feasibility
        Critic
        Scheduler
        Packager
      Prompts y Strategy
    Persistencia
      PostgreSQL
      Drizzle ORM
    Providers LLM
      OpenAI cloud
      Ollama local
    Auth
      Sessions
      API Keys
      Login Guard
    Dominio
      Taxonomia de metas
      Simulacion
      Adherencia y riesgo
      Habitos
    Billing
      Nostr Wallet Connect
      Cobro por operacion
    Estado
      Hecho
        App completa
        Pipeline V6
        Streaming SSE
        Tests
      En progreso
        Refactors
        Limpieza legacy
      Pendiente
        Deploy Vercel
        Pulido visual
        Wallet produccion
```

---

## Como leer este mapa

| Rama | Que es |
|------|--------|
| **Frontend** | 5 paginas Next.js 15 con App Router |
| **API** | 20+ endpoints REST, varios con streaming SSE |
| **Pipeline V6** | Corazon del producto: orquestador con 7 agentes IA especializados |
| **Persistencia** | PostgreSQL con Drizzle ORM |
| **Providers** | OpenAI para produccion, Ollama para desarrollo local |
| **Auth** | Sesiones, API keys, login guard |
| **Dominio** | Logica de negocio: metas, simulacion, adherencia, riesgo |
| **Billing** | Pagos Lightning via Nostr Wallet Connect |
| **Estado** | Resumen de que esta hecho, en progreso y pendiente |
