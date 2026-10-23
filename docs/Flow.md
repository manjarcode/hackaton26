# Flujo de gestión de subidas al monolito

Sistema para serializar los merges automáticos al monolito, con una ventana
de validación tras cada despliegue que resuelve el "elegido" (el autor del
PR desplegado) de forma explícita o por timeout, y un bot de Slack que
elimina la dependencia de que un humano avise al siguiente de la cola.

El análisis automático de métricas por un LLM queda como mejora futura (ver
abajo) — hoy la validación es manual, el bot solo quita la carga de
comunicación, no la decisión.

## Componentes

- **Gatekeeper (job `gatekeeper` dentro de `release-and-deploy.yml`)**: no
  disparado por eventos de ninguna PR — se despierta solo por
  `workflow_dispatch` explícito (cuando se encola una PR o se resuelve un
  gate). Sin `schedule`/cron: el timeout por modo es una aproximación que
  solo se recalcula cuando algo lo despierta. Decide si se puede mergear la
  siguiente PR de la cola (`hotfix` primero, luego `automerge`, FIFO por
  número) o si hay que esperar; si mergea, ese mismo `push` a `main`
  dispara los jobs de build+deploy+open-gate del propio workflow. Al vivir
  fuera de la PR, esta nunca se queda con un check "en curso" raro — y si
  el sistema está bloqueado, se ve con claridad en el resumen del último
  run del gatekeeper (qué gate, qué label, quién es el asignado), en vez de
  en cada PR en cola.
- **Gate de validación**: lo que el gatekeeper consulta antes de mergear —
  si el gate del despliegue anterior no está en `gate:ok`, no deja avanzar
  nada.
- **Parada manual (`queue:blocked`)**: si un intento de merge falla, el
  gatekeeper abre un issue con esta label y falla el job. Mientras esté
  abierto, ninguna ejecución futura del gatekeeper evalúa ni mergea nada —
  no hay fallback automático a la siguiente PR. Se coordinan los humanos
  (alguien mergea a mano lo que esté listo) y se cierra el issue para
  reanudar la rotación.
- **Estado del gate**: un GitHub Issue por despliegue, con labels
  `gate:pending` / `gate:ok` / `gate:stop` / `gate:paused`, actualizado vía
  API. Sirve de almacén de estado y de log de auditoría.
- **Bot de Slack**: notifica proactivamente la posición en la cola ("eres el
  siguiente", "quedan 8 por delante", "tu PR se está desplegando"), abre la
  ventana de validación, y recoge la acción del elegido (OK / pausa / fallo).
- **El "elegido" (humano)**: sigue siendo quien decide si su despliegue va
  bien. El bot no sustituye su criterio, solo le avisa sin que tenga que
  estar pendiente de Slack y avisa al siguiente sin que él tenga que hacerlo.
- **Notificación de fallo**: si el gate pasa a `stop`, bloquea la cola y
  notifica que haría falta un revert manual en el monolito — no hay
  workflow de revert automático (en el monolito real no es un rollback
  trivial, así que no se simula).

## Modos de resolución de la ventana (configurable)

- **Modo "default OK"**: si el elegido no responde en X minutos, se asume que
  todo fue bien y el gate pasa a `gate:ok` automáticamente.
- **Modo "prudente"**: si no hay confirmación explícita, el gate se queda
  bloqueado (no pasa a `ok` por sí solo) hasta que el elegido confirme o
  expire un timeout más largo que requiere intervención manual.

El elegido puede, en cualquier momento de su ventana:
- Confirmar OK → libera la cola de inmediato.
- Pedir una pausa (duración fija o indefinida) → `gate:paused`, la cola se
  detiene hasta que él mismo la reanude.
- Señalar un fallo → `gate:stop`, bloquea la cola y notifica que haría
  falta un revert manual en el monolito.

## Diagrama de flujo

```mermaid
flowchart TD
    A["Usuario activa label 'automerge' o 'hotfix'<br/>(hotfix = prioridad en la cola, no bypass)"] --> B1["pr-merge.yml: solo despierta<br/>al gatekeeper (gh workflow run release-and-deploy.yml)<br/>— termina ya, PR en verde"]
    B1 --> C0{"¿Hay issue 'queue:blocked' abierto?"}
    C0 -- Sí --> C1["Gatekeeper no hace nada<br/>hasta que un humano lo cierre"]
    C1 -. "se despierta de nuevo al resolver el gate o al encolar otra PR" .-> C0
    C0 -- No --> D["Job 'gatekeeper' en release-and-deploy.yml<br/>(solo workflow_dispatch, sin cron)<br/>¿hay gate abierto de un despliegue anterior?"]
    D -- "gate:pending / gate:paused" --> D1["Run del gatekeeper deja claro<br/>quién bloquea (issue, label, asignado)"]
    D1 -. "se despierta de nuevo al resolver el gate o al encolar otra PR" .-> D
    D -- "gate:ok o sin gate activo" --> E{"Gatekeeper mergea la siguiente<br/>de la cola (hotfix primero, luego automerge)"}
    E -- "Merge OK" --> F["Ese mismo merge dispara<br/>un push a main"]
    E -- "Merge falla" --> E1["Abre issue 'queue:blocked'<br/>y falla el job — no intenta la siguiente PR"]
    E1 --> E2["Humanos se coordinan:<br/>alguien mergea a mano lo que esté listo<br/>y cierra el issue"]
    E2 -.-> C0
    F --> G["release-and-deploy.yml (jobs build+deploy):<br/>despliegue al monolito"]
    G --> H["Abrir Issue de gate<br/>estado = gate:pending<br/>asignado al elegido"]
    H --> I["Slack: avisa al elegido<br/>'tu PR se está subiendo'"]
    I --> J["Ventana de validación: X min<br/>(modo default-ok / modo prudente)"]

    J --> K{"¿Qué hace el elegido<br/>o qué pasa con el timeout?"}
    K -- "Confirma OK" --> L["gate = gate:ok"]
    K -- "Timeout, modo default-ok" --> L
    K -- "Timeout, modo prudente" --> M["gate = gate:stop"]
    K -- "Señala fallo" --> M
    K -- "Pide pausa" --> M2["gate = gate:paused<br/>cola detenida"]

    L --> N["Gate liberado<br/>Slack notifica al siguiente de la cola"]
    N --> B1

    M --> O["Slack: alerta de fallo<br/>requiere revert manual en el monolito"]
    O --> Q["Cola bloqueada hasta resolución manual"]

    M2 --> R["El elegido reanuda manualmente<br/>o expira el límite de la pausa"]
    R --> J

    style M fill:#f8d7da,stroke:#c0392b
    style O fill:#f8d7da,stroke:#c0392b
    style L fill:#d4edda,stroke:#2e7d32
    style N fill:#d4edda,stroke:#2e7d32
    style M2 fill:#fff3cd,stroke:#b8860b
```

## Reparto de responsabilidades

| Elemento | Decide / hace | No puede |
|---|---|---|
| GHA merge action existente | Mergear si pipeline verde + rebaseado | Saltarse el orden de la cola (salvo `hotfix`) |
| Gatekeeper (job `gatekeeper` en `release-and-deploy.yml`) | Decidir si se mergea la siguiente PR de la cola (`hotfix` con prioridad); aplicar el timeout por modo configurado sobre el gate `pending`; detener la rotación (issue `queue:blocked`) si un merge falla | Avanzar antes de `gate:ok`; decidir por el elegido; saltar a la siguiente PR si la actual falló al mergear |
| Bot de Slack (nice-to-have) | Notificar posición en cola, recoger OK/pausa/fallo del elegido sin pasar por GitHub | Decidir por el elegido, forzar un merge o un despliegue |
| El elegido (humano) | Confirmar OK, pausar, o señalar fallo de su propio despliegue | Saltarse la cola sin label `hotfix` |

## Futuro: análisis automático de métricas (LLM)

No forma parte del MVP. La idea original — que un LLM monitorice métricas
(Kibana/Datadog) durante la ventana y pueda escribir `gate:stop` como freno
de emergencia, sin nunca poder forzar `gate:ok` ni un merge — queda como
evolución natural una vez el flujo manual esté rodado y se confíe en él.

## Temática de la demo: Matrix

Los estados técnicos (`gate:pending` / `gate:ok` / `gate:stop` /
`gate:paused`) y los nombres de workflow no cambian. Esta tabla es la capa de
naming para el copy de Slack, la app de presentación y la narrativa de la
demo — para que cale el mensaje sin tener que explicar el sistema entero.

| Concepto técnico | Nombre temático | Por qué encaja |
|---|---|---|
| Bot de Slack | **Morpheus** | Es quien te despierta, te avisa y te hace la pregunta |
| El autor del PR en su ventana de validación | **Neo / "el elegido"** | Es quien decide, no el sistema |
| Confirmación OK → `gate:ok`, libera la cola | **Pastilla roja** | Ves la verdad, aceptas que todo va bien, el mundo real (producción) continúa |
| Señal de fallo → `gate:stop` | **Pastilla azul** | Vuelves a la cama, pero el problema sigue ahí fuera hasta que alguien actúe a mano |
| Label `hotfix` (salta al frente de la cola) | **"Operador, necesito una salida"** | La llamada urgente para ir primero, aunque sigues saliendo por la misma puerta (el gatekeeper, el gate sigue aplicando) |
| Pausa del elegido → `gate:paused` | **Bullet time** | Todo se congela mientras tú decides |
| Modo "prudente" (sin timeout automático a `ok`) | **"Sigue al conejo blanco"** | No hay red de seguridad que te salve, tienes que actuar |
| Notificación de posición en cola | **"Despierta, Neo..."** | El mensaje de Morpheus avisando que se acerca tu turno |
