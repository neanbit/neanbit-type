# Torneos de neanbit type: estado y pendientes

## Etapas
1. Diseño y tablas: hecho.
2. Servidor (esta entrega): hecho y probado de punta a punta con un servidor real.
3. App: lista de torneos, inscripción, llave, aviso de partido y filtro «Torneos» en Estadísticas. Pendiente.
4. Panel (neanbit-type-admin): crear, publicar, controlar en vivo, descalificar y agregar. Pendiente.
5. Integración con medallas (torneos ganados real, medallas ocultas como pase VIP) y perfil. Pendiente.

## Reglas asumidas (cambiables)
- Eliminación directa. La llave se sortea al empezar; si no son potencia de 2, los mejores sembrados pasan directo la primera ronda.
- Cada partido es un duelo. Los dos tienen `ready_secs` (180 por defecto) para pulsar «Listo». Quien no aparece pierde; si no aparece ninguno, pasa el mejor sembrado.
- Si en el duelo no termina nadie en 5 minutos, pasa quien llegó más lejos en el texto. Si hay igualdad total, se repite con otro texto. Si vuelve a haber igualdad, pasa el mejor sembrado.
- Si alguien abandona o se desconecta durante el duelo, pierde (regla de Duelos). Si se va durante la cuenta regresiva, también pierde.
- Si el servidor se reinicia con un partido en juego, el partido vuelve a «listo» con tiempo nuevo.
- Durante el modo mantenimiento los plazos se congelan; al volver quedan 60 segundos.
- Los duelos de torneo también cuentan en el filtro «Duelos» y en los rankings de Duelos (son duelos reales). El filtro «Torneos» muestra solo los de torneo.
- «Torneos ganados» de las medallas sigue siendo manual hasta la etapa 5.

## Fuera de alcance por ahora
- Agregar jugadores con el torneo ya en curso (solo antes de empezar).
- Sembrado por velocidad (hoy es sorteo).
- Mejor de 3 por partido, tercer puesto, doble eliminación y los otros formatos.
- Notificaciones fuera de la app.

## Contrato con el panel (etapa 4)
Estados de `tournaments.status`: `borrador` (oculto), `inscripcion`, `en_curso`, `finalizado`, `cancelado`.
El panel crea la fila en `tournaments` (name, description, status, size 4/8/16/32, access, starts_at, ready_secs, text_id, created_at).

`access` es JSON:
- `{"mode":"open"}`: abierto a todos.
- `{"mode":"rules","minCpm":400,"medal":"id-de-medalla"}`: exige récord mínimo y/o medalla ganada (puede ser oculta). Ambos opcionales.
- `{"mode":"list"}`: solo entran los que agrega el panel.

Órdenes: el panel inserta filas en `tournament_orders` (tournament_id, kind, user_id, match_id, created_at). La app las procesa cada 2 segundos y escribe `done_at` y `result` (`ok` o el motivo del error).
- `start`: sortea la llave y arranca (también arranca solo a la hora `starts_at`, si hay 2 o más inscriptos).
- `cancel`: cancela el torneo.
- `add` (user_id): agrega un jugador a mano, saltándose el acceso. Solo en inscripción.
- `remove` (user_id): lo quita. Solo en inscripción.
- `dq` (user_id): descalifica; si está jugando, el rival gana al instante.
- `advance` (user_id, match_id): fuerza que ese jugador gane su partido pendiente.
