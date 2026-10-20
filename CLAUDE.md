# Hackathon — Morpheus (gate de validación para subidas al monolito)

## Qué es este proyecto

Demo técnica + app de presentación para una idea de hackathon: eliminar el
factor humano (Slack, testigo manual) en la cola de subidas al monolito.
Repositorio nuevo y aislado (no es InfoJobs/Adevinta real), que replica en
miniatura un flujo de merge automático serializado con ventana de validación
post-deploy.

Documentación fuente (leer antes de tocar nada):
- [docs/PLAN.md](docs/PLAN.md) — alcance, arquitectura, fases de implementación. Es la referencia principal.
- [docs/Flow.md](docs/Flow.md) — diagrama de flujo, estados del gate, tabla de responsabilidades, mapeo temático Matrix.
- [docs/Idea inicial.md](docs/Idea%20inicial.md) — propuesta original, contexto del problema.

Si `docs/PLAN.md` y este archivo entran en conflicto, `docs/PLAN.md` manda —
actualizar este CLAUDE.md para reflejarlo, no al revés.

## Concepto (resumen)

- Cola de merges serializada vía `concurrency.group` de GHA (FIFO nativo).
- Label `hotfix` salta al frente de la cola.
- Tras cada deploy se abre un **gate** (GitHub Issue con labels
  `gate:pending`/`gate:ok`/`gate:stop`/`gate:paused`) asignado al autor del PR
  desplegado ("el elegido").
- El elegido resuelve la ventana de validación: OK, pausa, o fallo (dispara
  revert automático). Timeout configurable: modo `default-ok` o `prudente`.
- El análisis automático de métricas por LLM es **futuro, fuera del MVP** —
  nunca puede dar `gate:ok` ni forzar un merge, solo escribir `gate:stop`
  como freno adicional.

## Temática Matrix (solo copy, no cambia nombres técnicos)

Bot de Slack = **Morpheus**. Autor del PR en su ventana = **Neo / "el
elegido"**. OK = **pastilla roja**. Fallo/revert = **pastilla azul**. Label
`hotfix` = **"Operador, necesito una salida"**. Pausa = **Bullet time**. Modo
`prudente` = **"Sigue al conejo blanco"**. Notificación de cola = **"Despierta,
Neo..."**.

Los estados reales (`gate:pending`, `gate:ok`, etc.) y nombres de workflow
nunca cambian por la temática — la temática es solo para Slack, la app de
presentación y la narrativa de la demo.

## Stack y arquitectura (según PLAN.md)

- **App de presentación:** React + Vite, estática, sin backend propio, sin
  Next.js. Deploy a GH Pages (`actions/deploy-pages` o
  `peaceiris/actions-gh-pages`).
- **Workflows GHA** (mirror simplificado del monolito real
  `all-ij--web-empleo`): `pr-rebase.yml`, `pr-merge.yml` (cola global vía
  `concurrency.group: "monolith-deploy-queue"`), `qa-pipeline.yml` (fallo
  aleatorio para simular pipeline inestable), `release-and-deploy.yml`
  (deploy + apertura de gate).
- **Estado del gate:** GitHub Issues (no backend propio).
- **Sin autenticación/autorización real** — es una demo, estado y permisos
  simplificados a propósito.

## Fases de implementación (orden, ver PLAN.md §Fases)

1. App React/Vite mínima + deploy manual a GH Pages.
2. `qa-pipeline.yml` con fallo aleatorio + branch protection.
3. `pr-rebase.yml` + `pr-merge.yml` con cola global + label `hotfix`.
4. `release-and-deploy.yml` + apertura de Issue-gate.
5. Job `wait-for-validation-window` (resolución manual vía Issue + timeout por modo).
6. Workflow de revert.
7. (Nice-to-have) Bot de Slack.
8. (Futuro, fuera del MVP) Paso LLM de métricas.

No implementar fases fuera de orden salvo que el usuario lo pida explícitamente
— cada fase depende de la anterior para poder probarse.

## Fuera de alcance

- Cualquier integración con infraestructura real de InfoJobs/Adevinta.
- Autenticación/autorización real.
- El paso LLM de métricas y el bot de Slack son nice-to-have/futuro, no el
  MVP — no darles prioridad sobre las fases 1-6.

## Preferencias de trabajo (heredadas del perfil global, aplican aquí también)

- Responder siempre en español, sin emojis.
- Explicar el razonamiento detrás de cada decisión o cambio.
- Pedir confirmación antes de cambios grandes o destructivos.
- Preguntar siempre antes de hacer commits o abrir PRs.
- Repo remoto: `github.mpi-internal.com/manuel-miguel/hackaton26` (privado).
  Punto "Abierto / a decidir" de PLAN.md ya resuelto.
