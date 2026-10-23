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
| `pr-rebase.yml` | `pr-rebase.yml` | Rebase manual bajo demanda: labels `rebase` / `automerge` / `hotfix`, o automático en cada `push` a `main` |
| `pr-merge.yml` | `pr-merge.yml` | Ligero, vive en la propia PR: tanto `hotfix` como `automerge` solo despiertan al gatekeeper (`gh workflow run release-and-deploy.yml`) — termina rápido, la PR queda en verde. `hotfix` no mergea nada por sí mismo, solo avisa con prioridad |
| `qa-pipeline.yml` | `qa-pipeline.yml` | Tests con fallo aleatorio (p. ej. `Math.random() < 0.15` fuerza un test rojo) — simula pipeline inestable, bloquea merge vía required status check |
| `release-and-deploy.yml` | `release-and-deploy.yml` | Doble función según cómo se dispare. Por `push` a `main`: build + deploy a GH Pages + abre el gate. Por `workflow_dispatch` (despertado por `pr-merge.yml` al encolar o por `gate-resolve.yml` al resolver `gate:ok`): job `gatekeeper` — si hay un issue `queue:blocked` abierto no hace nada; si no, comprueba el gate y, si está libre, mergea la siguiente PR de la cola (`hotfix` primero, luego `automerge`, FIFO por número), lo que a su vez dispara un nuevo `push` y por tanto un nuevo build+deploy+gate. Sin cron: el timeout por modo solo se evalúa cuando algo despierta este job, no en un intervalo fijo. Si el merge falla, abre un issue `queue:blocked` y falla el job — no sigue con la siguiente PR, queda detenido hasta que un humano lo resuelva y cierre el issue. Si está bloqueado, lo deja explícito en el resumen del run — ahí se ve quién tiene la cola parada, no en el checklist de cada PR |
| `gate-resolve.yml` | — (nuevo) | Traduce el comentario del elegido (`ok`/`stop`/`pause`) en el Issue-gate al label correspondiente; al resolver a `gate:ok` despierta al gatekeeper inmediatamente |

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
- **Cola:** no vive en la propia PR ni en un job que la bloquea — la decide
  el job `gatekeeper` de `release-and-deploy.yml`, disparado solo por
  `workflow_dispatch` explícito (al encolar una PR o al resolver un gate),
  nunca por eventos de PR. No hay `schedule`/cron: el timeout por modo es
  una aproximación que solo se recalcula cuando algo despierta este job.
  Así la PR en cola se ve con sus propios checks en verde, y si el sistema
  está bloqueado, se ve claramente en el resumen del último run del
  gatekeeper (qué gate, qué label, quién es el asignado) en vez de en cada
  PR esperando.
- **Gatekeeper (job `gatekeeper` en `release-and-deploy.yml`):** en cada ejecución, primero
  comprueba si hay un issue `queue:blocked` abierto (parada manual tras un
  fallo de merge) — si lo hay, no hace nada hasta que un humano lo cierre.
  Si no, comprueba si hay un gate abierto distinto de `gate:ok`; si lo hay,
  no mergea nada. Si está libre, mergea la siguiente PR en cola (`hotfix`
  primero, luego `automerge`, FIFO por número de PR — aproximación simple,
  no por orden exacto de etiquetado). `hotfix` solo tiene prioridad en esta
  selección, no bypassa el gate ni mergea fuera del gatekeeper.
- **Parada dura ante fallo de merge:** si el intento de merge falla (p. ej.
  conflictos), el gatekeeper abre un issue `queue:blocked` y falla el job
  explícitamente. Ninguna ejecución futura del job (siempre vía
  `workflow_dispatch`) evalúa ni mergea nada mientras ese issue esté
  abierto — no hay fallback automático a intentar la siguiente PR de la
  cola. Se coordinan los humanos: alguien mergea a mano la PR que esté
  lista y cierra el issue para reanudar la rotación automática.
- **Resolución:** la hace el elegido, comentando/etiquetando el Issue (o,
  si existe el bot, respondiendo en Slack):
  - OK → `gate:ok`, libera la cola.
  - Pausa (duración fija o indefinida) → `gate:paused`.
  - Fallo → `gate:stop`, bloquea la cola y notifica (consola de Actions en la
    demo; Slack si llega el nice-to-have) que haría falta un revert manual
    en el monolito — no se dispara ningún revert automático (ver "Fuera de
    alcance"). Deja la cola bloqueada hasta resolución manual (cerrar el
    Issue a mano).
- **Timeout configurable por modo** (variables de repo `GATE_TIMEOUT_MINUTES` /
  `GATE_TIMEOUT_MODE`):
  - `default-ok`: sin respuesta en N minutos → `gate:ok` automático.
  - `prudente`: sin respuesta en N minutos → se queda bloqueado (no pasa a
    `ok` solo); requiere intervención manual explícita.

## Fases de implementación propuestas

1. App React/Vite mínima + deploy manual a GH Pages (validar el pipeline base).
2. `qa-pipeline.yml` con test de fallo aleatorio + branch protection.
3. `pr-rebase.yml` + `pr-merge.yml` con label `hotfix` (prioridad en cola) y label `automerge` (encola) — ambos solo despiertan al gatekeeper.
4. `release-and-deploy.yml`: build + deploy + apertura de Issue-gate asignado al elegido (disparado por `push` a `main`).
5. Job `gatekeeper` en `release-and-deploy.yml` (disparado por `workflow_dispatch`, fuera de la PR) + `gate-resolve.yml`: resolución manual vía Issue (OK/pausa/fallo) + timeout por modo (`default-ok`/`prudente`).
6. (Nice-to-have) Bot de Slack: notificaciones proactivas de posición en cola + recoger OK/pausa/fallo sin pasar por GitHub.
7. (Futuro, fuera del MVP) Step LLM leyendo métricas y escribiendo `gate:stop` como freno adicional.

## Abierto / a decidir

- Nombre y ubicación del repo nuevo (personal / org).
- Visibilidad (público, para poder usar GH Pages gratis sin restricciones;
  privado también funciona con GitHub Pro/Team).
- Duración por defecto de los timeouts (real vs. demo en directo) y cuál de
  los dos modos (`default-ok` / `prudente`) se usa como default del repo.
