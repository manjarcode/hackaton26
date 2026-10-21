# Morpheus — gate de validación para subidas al monolito

Demo técnica (y app de presentación de la propia idea) de un sistema que
elimina el factor humano manual en la cola de subidas a un monolito: cola
de merges serializada vía GitHub Actions, con un label `hotfix` que salta
al frente, y una ventana de validación post-deploy que resuelve el propio
autor del PR desplegado — OK, pausa, o fallo — en vez de depender de un
aviso por Slack y un testigo que vaya comprobando a mano.

Repositorio nuevo y aislado, no es infraestructura real de InfoJobs/Adevinta.
Más contexto en [docs/PLAN.md](docs/PLAN.md) y [docs/Flow.md](docs/Flow.md).

**Demo desplegada:** https://manjarcode.github.io/hackaton26/
