# PLAN — Demo: gestión de subidas con gate de validación

## Objetivo

Repositorio nuevo, aislado, que replica en miniatura el flujo descrito en
[Flow.md](Flow.md): cola de merges serializada (con prioridad `hotfix`) +
ventana de validación post-deploy que resuelve el propio "elegido" (OK /
pausa / fallo), con timeout configurable. El análisis automático de métricas
por LLM queda fuera del MVP, como evolución futura.

Doble propósito: sirve de demo técnica del sistema Y la propia app desplegada
es la página de presentación de la idea (GH Pages).

**Temática:** Matrix. El bot se llama **Morpheus**, el autor del PR es
**"el elegido"**, confirmar = **pastilla roja**, fallo = **pastilla
azul**, el label de prioridad es la llamada **"Operador, necesito una
salida"**. Mapeo completo en [Flow.md](Flow.md#temática-de-la-demo-matrix) —
los nombres técnicos (`gate:ok`, `gate:stop`, etc.) no cambian, esto es solo
el copy de cara al público.

## Alcance

**Dentro:**
- App de presentación en React + Vite, estática, desplegada a GH Pages.
- Workflows de GHA que replican la estructura del monolito (rebase, merge por
  label, pipeline de tests, release-and-deploy).
- Label `hotfix`: salta al frente de la cola.
- Simulación de pipeline rojo: tests que fallan aleatoriamente.
- Gate de validación con cola serializada, estado en GitHub Issues, resuelto
  por el propio elegido: confirmación OK, pausa (temporal o indefinida), o
  señal de fallo.
- Dos modos de timeout configurables: `default-ok` (sin respuesta → se asume
  OK) y `prudente` (sin respuesta → se queda bloqueado/`stop`).
- Notificación de fallo: `gate:stop` bloquea la cola y deja constancia
  explícita de que haría falta un revert manual en el monolito — no se
  automatiza el revert (ver "Fuera de alcance").
- Timers configurables (10 min "real", override corto para demo en directo).

**Nice-to-have (si llegamos):**
- Bot de Slack: notifica proactivamente la posición en cola ("eres el
  siguiente", "quedan 8 por delante", "tu PR se está desplegando") y recoge
  la acción del elegido (OK/pausa/fallo) sin que tenga que ir a GitHub.
  Requiere un endpoint público (serverless) que traduzca la interacción de
  Slack a `repository_dispatch`. Sin el bot, el MVP usa el propio Issue de
  GitHub como canal (comentarios/labels) — funciona, pero no es proactivo.
  Si se implementa el bot, es el golpe de demo definitivo.

**Futuro (fuera del MVP, documentado para no perderlo):**
- Paso LLM que analice métricas (reales o sintéticas) durante la ventana de
  validación y pueda escribir `gate:stop` como freno de emergencia adicional
  al criterio del elegido — nunca sustituyéndolo, nunca pudiendo dar `ok`.

**Fuera de alcance:**
- Cualquier integración con infraestructura real de InfoJobs/Adevinta.
- Autenticación/autorización real — es una demo, estado y permisos simplificados.
- Workflow de revert automático: en el monolito real (`all-ij--web-empleo`)
  revertir un despliegue no es trivial (no es un simple rollback de artefacto
  estático), así que no tiene sentido simularlo en la demo. `gate:stop`
  bloquea la cola y notifica que haría falta un revert manual — el revert en
  sí queda fuera.

## Arquitectura de la app demo

- **Stack:** React + Vite, sin backend propio, sin Next.js (GH Pages no
  necesita SSR y así evitamos exigirle modo `export` a Next sin motivo).
- **Contenido:** la propia presentación de esta idea (puede reusar el
  contenido de [Flow.md](Flow.md) como guion).
- **Build:** `vite build` → artefacto estático → acción `actions/deploy-pages`
  (o `peaceiris/actions-gh-pages` si se prefiere más control).

## Workflows de GHA (mirror del monolito)

Replican la estructura real vista en `all-ij--web-empleo`, pero simplificados:

| Workflow demo | Equivalente en el monolito | Rol |
|---|---|---|
| `pr-rebase.yml` | `pr-rebase.yml` | Rebase automático al activar el label, `concurrency.group: "rebase"` |
| `pr-merge.yml` | `pr-merge.yml` | Merge al activar el label, pero con `concurrency.group: "monolith-deploy-queue"` (global, no por PR) — esto crea la cola FIFO. Label `hotfix` fuerza un grupo de concurrencia distinto con prioridad, o reordena la cola vía API antes de encolar |
| `qa-pipeline.yml` | `qa-pipeline.yml` | Tests con fallo aleatorio (p. ej. `Math.random() < 0.15` fuerza un test rojo) — simula pipeline inestable, bloquea merge vía required status check |
| `release-and-deploy.yml` | `release-and-deploy.yml` | Build + deploy a GH Pages + genera `metrics.json` sintético + abre el gate |

## Simulación de fallos

**Pre-merge (pipeline rojo):** test que falla con probabilidad configurable.
Gestionado 100% por GitHub nativo (branch protection + required check), no
hay que construir nada extra — igual que en el monolito.

(La simulación de anomalía post-deploy con métricas sintéticas queda
aparcada junto con el paso LLM — ver "Futuro" más arriba — porque hoy esa
revisión la hace el propio elegido mirando lo que corresponda, no un
archivo generado por la demo.)

## Gate de validación

- **Estado:** un GitHub Issue por despliegue, labels `gate:pending` /
  `gate:ok` / `gate:stop` / `gate:paused`. Se crea al completar el deploy,
  asignado al elegido (autor del PR), se cierra al resolver la ventana.
- **Cola:** resuelta por el `concurrency.group` global de `pr-merge.yml`,
  con el label `hotfix` saltando al frente — no se construye cola propia.
- **Job `wait-for-validation-window`:** antes de `automerge`, bloquea hasta
  que el gate del despliegue en curso (si existe) pase a `gate:ok`. Si está
  en `gate:paused` o `gate:stop`, espera sin avanzar.
- **Resolución:** la hace el elegido, comentando/etiquetando el Issue (o,
  si existe el bot, respondiendo en Slack):
  - OK → `gate:ok`, libera la cola.
  - Pausa (duración fija o indefinida) → `gate:paused`.
  - Fallo → `gate:stop`, bloquea la cola y notifica (consola de Actions en la
    demo; Slack si llega el nice-to-have) que haría falta un revert manual
    en el monolito — no se dispara ningún revert automático (ver "Fuera de
    alcance"). Deja la cola bloqueada hasta resolución manual (cerrar el
    Issue a mano).
- **Timeout configurable por modo** (input del `workflow_dispatch`, o
  variable de repo):
  - `default-ok`: sin respuesta en N minutos → `gate:ok` automático.
  - `prudente`: sin respuesta en N minutos → se queda bloqueado (no pasa a
    `ok` solo); requiere intervención manual explícita.

## Fases de implementación propuestas

1. App React/Vite mínima + deploy manual a GH Pages (validar el pipeline base).
2. `qa-pipeline.yml` con test de fallo aleatorio + branch protection.
3. `pr-rebase.yml` + `pr-merge.yml` con concurrency group global (cola) + label `hotfix`.
4. `release-and-deploy.yml` + apertura de Issue-gate asignado al elegido.
5. Job `wait-for-validation-window`: resolución manual vía Issue (OK/pausa/fallo) + timeout por modo (`default-ok`/`prudente`).
6. (Nice-to-have) Bot de Slack: notificaciones proactivas de posición en cola + recoger OK/pausa/fallo sin pasar por GitHub.
7. (Futuro, fuera del MVP) Step LLM leyendo métricas y escribiendo `gate:stop` como freno adicional.

## Abierto / a decidir

- Nombre y ubicación del repo nuevo (personal / org).
- Visibilidad (público, para poder usar GH Pages gratis sin restricciones;
  privado también funciona con GitHub Pro/Team).
- Duración por defecto de los timeouts (real vs. demo en directo) y cuál de
  los dos modos (`default-ok` / `prudente`) se usa como default del repo.
