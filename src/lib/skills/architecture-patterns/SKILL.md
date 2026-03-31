---
name: architecture-patterns
version: 1.0.0
description: Guía de implementación de patrones de arquitectura (Clean Architecture, HEX, DDD, MVC). Uso para diseñar sistemas, revisar estructuras de código y tomar decisiones tecnológicas fundamentadas.
---

Este skill proporciona conocimiento experto sobre patrones de arquitectura de software modernos para asegurar que el sistema sea testeable, mantenible y escalable.

## Cuándo usar
- Diseño de nuevos componentes o servicios.
- Revisión de estructura de archivos y dependencias.
- Implementación de lógica de negocio compleja (Domain-Driven Design).
- Evaluación de trade-offs entre diferentes arquitecturas.

## Patrones Soportados

### 1. Clean Architecture
- **Inversión de Dependencias**: El core (entidades/casos de uso) no depende de frameworks externos.
- **Capas**: Entidades -> Casos de Uso -> Controladores -> DB/UI.

### 2. Hexagonal Architecture (Ports and Adapters)
- **Ports**: Interfaces que definen qué necesita el dominio.
- **Adapters**: Implementaciones concretas (Ej: PrismaAdapter para una DB).
- Aísla el núcleo de la aplicación de IO, protocolos y servicios externos.

### 3. Tactical DDD
- **Aggregates**: Raíz de consistencia para un grupo de objetos relacionados.
- **Value Objects**: Objetos definidos por sus atributos, no por identidad.
- **Repositories**: Contratos para la persistencia del agregado completo.

## Directrices de Implementación en este Proyecto (Next.js 15)

1. **Core Business Logic**: Siempre en `src/lib/domain` o similar. Debe ser agnóstica a Next.js (sin `next/*` imports).
2. **Infrastructure**: Implementaciones de base de datos (`src/lib/db`) y clientes externos.
3. **Application/API**: `app/api` actúa como el controlador/entrypoint.
4. **Shared Kernel**: `src/shared` para tipos y utilidades que cruzan capas.

---

**CRÍTICO**: Evita la "Arquitectura Espagueti". No importes servicios de infraestructura directamente en los componentes de UI a menos que sea una operación de lectura trivial (RSC). Toda mutación compleja debe pasar por un Caso de Uso o Service.
