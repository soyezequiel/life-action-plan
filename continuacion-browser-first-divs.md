# Continuacion Browser-First de LAP

## Contexto
- Objetivo del plan: continuar la implementacion de LAP desde el estado actual browser-first, corrigiendo los puntos donde un IDE agéntico se queda sin feedback o trabaja sobre supuestos viejos.
- Fuente: `PLAN_LAP_FINAL.md`, `AGENTS.md`, estado real del repo al 2026-03-19 y pedido del usuario de endurecer el plan para vibe coding con feedback continuo.
- Ruta del documento: `F:\proyectos\planificador-vida\continuacion-browser-first-divs.md`
- Supuestos:
  - el repo ya corre en modo web con `npm run dev`;
  - existe backend local compartido en `src/server/`;
  - existe inspector LLM, simulacion, exportacion `.ics`, streaks, cost summary y shell Electron secundaria;
  - el problema principal a corregir en el plan es la falta de feedback corto y confiable para agentes.
- Regla operativa: ejecutar y revisar un solo div a la vez.
- Consumo esperado: este documento esta pensado para que cada div sea ejecutado en una sola corrida por `$implementar-div-atomico` o, si se necesita aislamiento, por `$coordinar-div-orquestado`.

## Divs

### DIV-001 - Baseline verificable browser-first
- ID: DIV-001
- Titulo corto: baseline browser-first
- Objetivo: dejar una linea base reproducible del estado actual para que ningun agente arranque desde suposiciones o desde HMR roto.
- Que se implementa: una verificacion minima y persistida de los flujos criticos actuales en modo web y shell Electron, incluyendo carga inicial, build de plan, inspector LLM, simulacion, exportacion y estado de wallet.
- Que no se implementa: features nuevas, rediseños visuales o refactors de arquitectura.
- Dependencias: ninguna
- Precondiciones: `npm run dev` y `npm run dev:electron` deben poder arrancar en limpio.
- Criterio de finalizacion: existe una matriz de smoke checks con resultado observable para ambos modos y el repo tiene una referencia clara de que funciones ya estan vivas hoy.
- Notas para la siguiente unidad: deja lista la base de verdad desde la cual definir feedback obligatorio por feature.

### DIV-002 - Contrato de feedback obligatorio
- ID: DIV-002
- Titulo corto: contrato de feedback
- Objetivo: impedir que un agente siga codificando sin senales observables.
- Que se implementa: una regla formal del proyecto donde cada unidad futura debe cerrar con una evidencia automatica y una visible; tambien define que cambios en transporte, backend local, preload o contratos compartidos exigen corrida limpia.
- Que no se implementa: tests especificos de una feature ni instrumentacion de una pantalla puntual.
- Dependencias: DIV-001
- Precondiciones: la linea base del proyecto ya esta documentada.
- Criterio de finalizacion: la documentacion operativa del repo obliga explicitamente a producir feedback verificable y define cuando HMR no es evidencia valida.
- Notas para la siguiente unidad: deja listo el marco para endurecer primero las superficies de observabilidad.

### DIV-003 - Inspector LLM como criterio de aceptacion
- ID: DIV-003
- Titulo corto: debug como acceptance gate
- Objetivo: convertir el inspector LLM en una herramienta de validacion y no solo en una UI accesoria.
- Que se implementa: el plan para endurecer trazas, errores y snapshots del inspector en browser y Electron, incluyendo la exigencia de que operaciones LLM largas muestren progreso o error visible.
- Que no se implementa: nuevas features del plan-builder ni cambios de producto fuera del inspector.
- Dependencias: DIV-002
- Precondiciones: existe el panel de debug y puede abrirse en al menos una superficie.
- Criterio de finalizacion: toda operacion LLM critica tiene como evidencia minima una traza visible o un error visible en el inspector, tanto en ruta feliz como en ruta de fallo.
- Notas para la siguiente unidad: deja preparada la base de observabilidad para pulir UI sin perder diagnostico.

### DIV-004 - Pulido visual de dashboard y estados de carga
- ID: DIV-004
- Titulo corto: polish dashboard
- Objetivo: mejorar la calidad percibida del modo browser-first sin mezclarlo con backend o pagos.
- Que se implementa: ajustes de jerarquia visual, estados vacios, tarjetas, botones, pantalla de building y consistencia de layout para dashboard e intake, con evidencia visual clara de antes y despues.
- Que no se implementa: wallet, simulacion, debug panel ni cambios de arquitectura.
- Dependencias: DIV-001
- Precondiciones: baseline visual del flujo principal disponible.
- Criterio de finalizacion: el flujo principal browser-first se puede recorrer con una UI consistente y cada cambio deja una evidencia visual verificable.
- Notas para la siguiente unidad: deja la base estable para agregar motion y accesibilidad sin mezclar objetivos.

### DIV-005 - Motion y accesibilidad con evidencia observable
- ID: DIV-005
- Titulo corto: motion y a11y
- Objetivo: agregar micro-interacciones y accesibilidad sin introducir regresiones invisibles.
- Que se implementa: plan para animaciones acotadas, `prefers-reduced-motion`, foco visible, contraste y comportamiento de screen readers en estados de carga o streaming.
- Que no se implementa: rediseño completo de componentes ni nuevas features de negocio.
- Dependencias: DIV-004
- Precondiciones: el layout principal ya esta visualmente estabilizado.
- Criterio de finalizacion: cada mejora de motion o accesibilidad deja una prueba o evidencia visible de que funciona y una degradacion definida cuando la preferencia del sistema exige menos movimiento.
- Notas para la siguiente unidad: deja la experiencia principal lista para endurecer los limites entre modo real y modo demo.

### DIV-006 - Frontera explicita entre ruta real y demo
- ID: DIV-006
- Titulo corto: frontera real vs demo
- Objetivo: evitar que un agente o desarrollador crea que validó backend real cuando en realidad está en fallback.
- Que se implementa: reglas y superficies visibles para distinguir modo real, fallback por error y modo demo; tambien la prohibicion de que un mock tape errores HTTP o de transporte sin señal clara.
- Que no se implementa: nuevas integraciones de producto ni cambios visuales generales.
- Dependencias: DIV-002
- Precondiciones: existe al menos una ruta real y al menos un fallback/demo.
- Criterio de finalizacion: el proyecto tiene una forma visible y verificable de saber si una operacion corrió contra backend real, contra fallback de red o contra demo explicita.
- Notas para la siguiente unidad: deja lista la base para productizar wallet y budget sin ambiguedades.

### DIV-007 - Wallet y presupuesto como flujo de producto
- ID: DIV-007
- Titulo corto: wallet y budget
- Objetivo: completar la parte visible de Lightning/NWC y presupuesto sin mezclarla con infraestructura general.
- Que se implementa: UX de conexion, estados de error, presupuesto disponible, costo estimado por operacion y feedback claro sobre si una accion consumio saldo o solo estimacion.
- Que no se implementa: refactor amplio del provider o cambios ajenos al flujo de wallet/costos.
- Dependencias: DIV-006
- Precondiciones: existe arquitectura NWC base y cost tracking minimo.
- Criterio de finalizacion: un agente puede verificar el flujo de wallet y budget con estados visibles y sin depender de interpretar logs internos.
- Notas para la siguiente unidad: deja preparado el terreno para automatizar la validacion cross-surface.

### DIV-008 - Paridad browser y Electron en operaciones criticas
- ID: DIV-008
- Titulo corto: parity matrix
- Objetivo: cortar la deriva entre el modo web y la shell desktop.
- Que se implementa: una matriz de paridad para operaciones criticas como profile, build, progress, streak, simulate, export, wallet, cost y debug, con smoke tests o checklist reproducible por superficie.
- Que no se implementa: empaquetado final ni optimizaciones de release.
- Dependencias: DIV-001, DIV-003, DIV-007
- Precondiciones: las rutas criticas ya tienen feedback observable.
- Criterio de finalizacion: existe una verificacion reproducible de que las operaciones criticas respetan el mismo contrato en browser y Electron, o quedan documentadas con diferencia explicita.
- Notas para la siguiente unidad: deja listo el paso final de endurecimiento de la shell desktop.

### DIV-009 - Shell Electron delgada y verificable
- ID: DIV-009
- Titulo corto: shell desktop delgada
- Objetivo: mantener Electron como adaptador liviano y evitar que vuelva a capturar la logica principal.
- Que se implementa: limpieza de responsabilidades entre `src/server`, `src/renderer`, `src/main` y `src/preload`, mas los checks minimos para safeStorage, dialogs, tray y empaquetado.
- Que no se implementa: nuevas features de producto web ni cambios del plan-builder.
- Dependencias: DIV-008
- Precondiciones: la paridad browser/Electron ya fue medida.
- Criterio de finalizacion: la shell desktop queda documentada y validada como adaptador de capacidades nativas, sin volver a ser el contrato base de la aplicacion.
- Notas para la siguiente unidad: deja preparado el proyecto para empaquetado y release sin romper la direccion browser-first.

## Registro de avance

- 2026-03-19 - DIV-003 observabilidad del inspector: el collector ahora guarda `firstTokenAt` y `timeToFirstTokenMs`; el panel muestra una espera inicial explicita y el dato del primer token cuando aparece; el cliente browser precalienta el stream de debug al habilitar el inspector. Evidencia automatica: `npx vitest run tests/trace-collector.test.ts tests/debug-panel-render.test.ts tests/browser-http-client.test.ts tests/i18n.test.ts` y `npm run typecheck`. Evidencia visible: durante `crear plan`, el inspector deja de quedar mudo y muestra "Esperando primer token..." hasta que entra el stream, luego informa el tiempo del primer token.
- 2026-03-19 - DIV-003 observabilidad del inspector, ajuste de apertura tardia: el collector ahora captura spans y respuesta parcial aunque el panel no este abierto; al abrir el inspector despues de haber lanzado `crear plan`, el snapshot ya trae la traza en curso y el texto acumulado hasta ese momento. Evidencia automatica: `npx vitest run tests/trace-collector.test.ts tests/instrumented-runtime.test.ts`, `npx vitest run` y `npm run typecheck`. Evidencia visible: si abris el inspector unos segundos despues del click, igual ves la traza activa y el stream ya acumulado.
