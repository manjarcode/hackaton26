# Hackathon subidas al monolito

Se ha organizado una hackathon para optimizar las subidas del monolito.

He presentado esta idea:

Quitar la parte humana del proceso. 
Opción agresiva: una vez una PR se marca como "ready" las GHA van subiendo por orden de "fecha de label" y por compilación correcta. 
Opción conservadora: En caso de haber dos PRs activas, la PR con prioridad tiene una ventana de 10 mins para subir, de lo contrario un bot gestionará le pasará el turno al siguiente que esté disponible.

Descripción:

Actualmente la cola de subida de monolito se gestiona avisándonos unos a otros mediante slack pasando el testigo. En ocasiones la comunicación no es efectiva y la persona que tiene el testigo tarda en darse cuenta. Otras veces a la persona con el testigo le falla su PR y no pasa el testigo a la siguiente (por ejemplo: la última vez que miró la cola, no había nadie detrás de él).

En estas ocasiones podemos estar esperando hasta 2-3 horas, donde la pipeline no se está ejecutando.

Objetivo: 
Optimizar los tiempos muertos de la pipeline por el factor humano.


Modelo: Merge automático + deadman button

Habilitamos el merge automático, condiciones:
- Pipeline en verde
- Código rebaseado
- Orden: por activación de "merge automático" (esto sustituye al JIRA de orden)


Ventana de validación: 10 minutos

- El usuario elegido, recibirá una notificación cuando su PR entre a subirse. Se puede ir notificando al usuario estimaciones periódicas del progreso (en función de los jobs completados). Una vez completada la subida, tendrá 10 minutos para revisar métricas y parar si fuera necesario las siguientes subidas. Solo se pueden parar la máquina de subidas si se ha detectado un posible error, para lo cual hay que hacer un revert rápido (Killer feature: se podría llegar a automatizar el proceso de revisión de métricas y revert automático, sería un paso previo a un BlueGreen deployment).

- Si por correcto el despliegue si: 
  - Aviso del usuario dando el OK
  - Pasan 10 minutos 

- Los usuarios que están en cola recibirán notificaciones indicando de su posición en la cola: "Tienes 2 personas por delante"... "Eres el próximo para desplegar". 