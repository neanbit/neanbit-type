<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cdn.neanbit.com/neanbit-wordmark-transparent-ondark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://cdn.neanbit.com/neanbit-wordmark-transparent-onlight.svg">
    <img alt="neanbit" src="https://cdn.neanbit.com/neanbit-wordmark-transparent-onlight.svg" width="300">
  </picture>
</p>

<h1 align="center">neanbit type</h1>

<p align="center">
  Práctica de mecanografía en español, en el navegador y sin instalar nada.<br>
  Carreras contra el reloj, Hardcore, entrenamiento, duelos 1 contra 1 en vivo, torneos, niveles, medallas y recompensas.
</p>

<p align="center">
  <a href="https://type.neanbit.com"><b>type.neanbit.com</b></a>
  &nbsp;·&nbsp; Node 22.13 o superior
  &nbsp;·&nbsp; sin dependencias
  &nbsp;·&nbsp; sin build
</p>

<!-- Capturas de pantalla: pendiente. Van acá, debajo del encabezado. -->

---

**Contenido:**
[Qué es](#qué-es) ·
[Qué incluye](#qué-incluye) ·
[Cómo correrlo](#cómo-correrlo) ·
[Estructura](#estructura) ·
[Estructura del proyecto](#estructura-del-proyecto) ·
[Cómo funciona](#cómo-funciona) ·
[Administración](#administración) ·
[Despliegue en un VPS](#despliegue-en-un-vps) ·
[Operación](#operación) ·
[Seguridad](#seguridad) ·
[Estado y pendientes](#estado-y-pendientes) ·
[Licencia](#licencia-y-créditos)

---

## Qué es

Recreación desde cero de CananTyper, una app de mecanografía estilo TypeRacer que vivía en Firebase y quedó abandonada. Va bajo la marca personal **neanbit** y está en línea en <https://type.neanbit.com>.

Reglas del proyecto:

- Solo navegador, sin Electron.
- Sin Firebase ni Supabase, para nada.
- Front estático con módulos ES, sin build. Servidor Node **22.13 o superior sin dependencias**: `http`, `node:sqlite` y un WebSocket escrito a mano. Base SQLite en modo WAL.
- Código y estética propios, sin emojis. Los íconos son SVG de línea propios.
- Paleta: fondo `#14213d`, texto `#f1f5f9`, acento `#fca311`. Tipografías Poppins e IBM Plex Mono.

## Qué incluye

**Modos de juego**

- **Aleatorio**, con un texto distinto en cada carrera.
- **Personalizado**: por categoría o por texto, con buscador (resaltado), filtros por largo, «una al azar» y «tu mejor» por texto. Más **Mis textos**: textos propios de 40 a 800 caracteres que se guardan solo en tu navegador y no suman a ranking, XP ni estadísticas.
- **Entrenamiento** con tus errores, y carrera contra el **fantasma** de tu récord.
- **Hardcore**: un error y quedás eliminado. Tiene sus propios rankings (carreras y eliminaciones).
- **Duelos** 1 contra 1 en vivo, con rival al azar o por invitación, y revancha.
- **Torneos** de eliminación directa, donde cada partido es un duelo.

**Carrera y resultado**

- Motor de tipeo con efecto TypeRacer, panel en vivo, atajos visibles y comparación contra el promedio de tus últimas 10 carreras.
- Resultado con animación, barra de XP y estallido si es récord (respeta `prefers-reduced-motion`).
- **Imagen para compartir**: un botón plano que dibuja un PNG de 1200x630 en un `canvas`, solo si lo pedís. No sube nada. Permite descargar, copiar y usar la hoja de compartir del sistema.
- Unidades CPM, WPM o Zen. **Ritmo del cursor** (marca punteada al ritmo de tu promedio o tu récord; necesita 3 carreras) y **sonido de teclas** sintetizado con WebAudio. Los dos vienen apagados.

**Progreso**

- **Niveles y experiencia** con doce títulos (de Novato a Inmortal) y un **camino de niveles** con premios que se reclaman. El nivel se ve en el perfil como una chapa que abre el camino.
- **Racha** de días en una tarjeta compacta del inicio (días seguidos y las últimas 14 jornadas de actividad), y **metas y misiones** que administra el panel: hasta tres a la vez entre el día y la semana, con su progreso y el botón **Reclamar**. La tarjeta del inicio muestra las tres (primero las que se pueden reclamar) sin el contador de carreras del día; si hay más, **Ver todas** abre la ventana con la lista completa agrupada por estado. La meta personal de carreras (`users.goal`) ya no se elige desde el inicio; la columna se conserva.
- **Rankings** de 10 por página con «tu posición»: carreras, promedios, Hardcore, duelos y torneos. Duelos tiene filtro de 24 horas o histórico.

**Perfil**

- Buscador de pilotos, foto con recorte, biografía, país, teclado, Discord, insignia de ranking, verificado y personalización de estilo.
- Selector **General | Duelos | Torneos | Hardcore** que cambia las tarjetas, el expediente y el historial de carreras.
- **Medallas** (63 íconos SVG, cinco niveles de color) y **recompensas** cosméticas.

**Estadísticas**

Página propia con selector de modo (General, Duelos, Torneos, Hardcore) y de período (7, 30, 90 días, todo o un rango propio). Incluye:

- Franja **Hoy** con las carreras del día y la mejor velocidad, aparte del período elegido y según el modo.
- Tarjetas con variación contra el período anterior y minigráficos.
- Evolución de velocidad o precisión, con cruz de lectura y comparación superpuesta contra el período anterior.
- Calendario de actividad de 26 semanas, mapa de calor día por hora, y hora del día y día de la semana con la franja más rápida.
- Distribución de velocidad, velocidad y precisión por categoría, dispersión velocidad contra precisión, y sesiones (corte a 30 minutos).
- Meta de velocidad con proyección (se guarda solo en tu navegador) y comparación con la comunidad por percentil: se calcula con un mínimo de 5 pilotos y nunca se muestra el valor de otra persona.
- Textos más jugados o con mejor marca, récords personales y, según el modo, rivales, últimos duelos y partidos, y los textos que más eliminan en Hardcore.
- Errores por tecla y palabra, y por mano y dedo (como tasa o como cantidad; la tasa cuenta las carreras desde que se registran las teclas tipeadas).
- Exportar a CSV el período elegido.

Los cálculos por período se hacen en el navegador. La duración de cada carrera se guarda medida (desde la v20); en las anteriores el tiempo se estima con el largo del texto y la velocidad.

**Ajustes**

Cuatro temas (**neanbit**, claro, carbón y alto contraste), unidad de velocidad, sonido de teclas y ritmo del cursor. El tema por defecto es neanbit y solo cambia si elegís otro en Ajustes (se guarda en este navegador, en `nt_theme`).

**Información**

Información, Guías con preguntas frecuentes (buscador y categorías), Términos, Privacidad, Cookies y Normas, con rutas propias: `/info`, `/guias`, `/terminos`, `/privacidad`, `/cookies` y `/normas`. El registro pide aceptar Términos y Privacidad (13 años o más); esa aceptación no se guarda en el servidor.

## Cómo correrlo

Necesitás Node 22.13 o superior y Git. No hay `npm install`.

```bash
git clone https://github.com/neanbit/neanbit-type.git
cd neanbit-type
NT_DB=/tmp/h.db PORT=3000 NT_ADMIN=ana node server/index.js
```

Se abre en `http://localhost:3000`. El usuario `NT_ADMIN` se crea al registrarte con ese nombre y siempre es administrador. Con una base en `/tmp` no tocás datos reales. Al arrancar, Node muestra `ExperimentalWarning: SQLite is an experimental feature`: es normal.

| Variable | Qué es |
|---|---|
| `NT_DB` | Ruta de la base SQLite. |
| `PORT` | Puerto (3000 por defecto). |
| `NT_ADMIN` | Usuario dueño: siempre es administrador. Se crea la cuenta con ese nombre. |
| `HOST` | Dirección de escucha. Por defecto `127.0.0.1` (detrás del túnel). |
| `NT_CSP=report` | Cabeceras CSP en modo reporte, en lugar de bloquear. |

## Estructura

```
index.html        única página; las pantallas se muestran con show(nombre)
css/              estilos por pantalla (style, home, race, pick, stats, profile, duel,
                  tourney, nivel, rewards, pages)
js/               módulos ES del front. main.js arma todo; pages.js tiene los textos;
                  art.js genera las ilustraciones SVG; share.js, sound.js, mytexts.js,
                  features.js, nivel.js, rewards.js, unlock.js, duel.js, tourney.js,
                  stats.js, profile.js, editor.js, vitrina.js, crop.js y ui.js
server/           index.js (API y estáticos), ws.js (WebSocket), duels.js, tournaments.js,
                  stats.js, xp.js, levels.js, medals.js, rewards.js, limits.js, content.js,
                  html-safe.js, seed.js, medal-icons/ y los catálogos de siembra
                  (medals-base.json, rewards-base.json, content-defaults.json)
scripts/          backup.sh, audit-seguridad.sh y export-content.mjs
img/              marca (mark.svg, mark.png) y logos (wordmark-ondark.svg y wordmark-onlight.svg)
```

## Cómo funciona

### Servidor y base de datos

- Un único proceso de Node sin dependencias. SQLite en modo WAL con `busy_timeout`.
- Tablas: `users`, `sessions`, `races`, `errors`, `deaths`, `categories`, `texts`, `announcements`, `settings`, `medals`, `user_medals`, `duels`, `tournaments`, `tournament_players`, `tournament_matches`, `tournament_orders`, `xp_events`, `xp_boosters`, `rewards` y `user_rewards`. La columna `races.duel` vale 0 en una carrera normal y el id del duelo en una de duelo.
- Las migraciones son automáticas al arrancar (`create table if not exists` y `alter table ... add column`), así que actualizar no rompe datos existentes.
- Cuentas con scrypt asíncrono, cookie HttpOnly `nt_session` y límite de intentos. Las carreras se validan en el servidor. En `localStorage` las claves llevan el prefijo `nt_` (`nt_sound`, `nt_pace`, `nt_mytexts`, `nt_statgoal` y `nt_statcompare`).

### Caché y versionado del front

El servidor entrega los estáticos con `cache-control: no-cache` y agrega `?v=<hash>` a cada archivo que carga la página: a los `src` y `href` de `index.html` y a cada `import './x.js'` dentro de los `.js`. El hash se calcula **al arrancar** a partir del contenido de `index.html`, `css/` y `js/`. Cada actualización cambia todas las direcciones, así que ninguna copia vieja (del navegador, de una extensión o de Cloudflare) se reutiliza. Consecuencia: después de cambiar archivos hay que reiniciar el servicio.

<details>
<summary><b>Rutas de la API</b></summary>

&nbsp;

`/api/me`, `/api/register`, `/api/login`, `/api/logout`, `/api/profile` (acepta `equip`), `/api/avatar`, `/api/texts`, `/api/config` (devuelve también `features`, `content` y `goalMax`), `/api/races` (POST; devuelve `xp` y `news`), `/api/deaths`, `/api/best`, `/api/users`, `/api/users/:handle` (con `duels`, `tourneys`, `hard`, `level`, `cosm` y `ladder`), `/api/users/:handle/races?page=&mode=all|duel|tourney|hc`, `/api/home`, `/api/races/top`, `/api/ranking`, `/api/ranking/average`, `/api/ranking/duels`, `/api/stats?mode=all|duel|tourney|hc`, `/api/missions` (GET; metas y misiones del cupo con progreso y estado), `/api/missions/claim` (POST `{ mission }`), `/api/goal` (POST), `/api/rewards`, `/api/rewards/news`, `/api/rewards/seen`.

Los rankings aceptan páginas de 10 y guardan una copia de 20 segundos que se invalida al guardar una carrera o un duelo. `/api/stats` tiene un límite de 30 pedidos por minuto por usuario. `POST /api/races` acepta además la duración medida por el navegador (`ms`) y las teclas tipeadas por carácter (`keys`): el servidor descarta la duración si no es coherente con el largo del texto y la velocidad, sin rechazar la carrera. En duelos y torneos la duración la mide el servidor. Las rutas de página (`/info`, `/guias`, `/terminos`, `/privacidad`, `/cookies`, `/normas`) entregan `index.html` (`pageRoutes` en `server/index.js`). El WebSocket de duelos está en `/ws`.

</details>

### Duelos 1 contra 1

Servidor sin dependencias: `server/ws.js` implementa el WebSocket a mano (handshake, tramas de texto con máscara, ping cada 25 s, límite de 4 KB por mensaje y 60 mensajes por segundo) y `server/duels.js` concentra la lógica.

- **Conexión:** exige la cookie `nt_session` y que el `Origin` coincida con el `Host`. Una conexión por usuario: la nueva reemplaza a la vieja.
- **Emparejamiento:** rival al azar (cola) o invitación por nombre de usuario. La invitación vence a los 30 s y se puede aceptar, rechazar o cancelar. Solo se reciben invitaciones estando en la sala de Duelos.
- **Carrera:** los dos corren el mismo texto, con cuenta regresiva de 3 s y largada con el mensaje `go`.
- **Medición:** **el servidor mide el tiempo y calcula la velocidad (CPM) él mismo** desde el `go`. Rechaza resultados imposibles (más de 1800 CPM). El cliente solo envía progreso, precisión y mapas de errores.
- **Resultado:** gana el primero en terminar; el otro tiene 90 s de gracia, con un tope de 5 minutos. Si alguien se desconecta o abandona en plena carrera, el rival gana por abandono. Si se va antes de largar, se cancela sin resultado.
- **Revancha:** tras un duelo los dos siguen conectados, así que es una invitación normal. No hay revancha en torneos ni si el rival abandonó.
- En modo mantenimiento no se puede buscar duelo (salvo administradores).
- **Guardado:** tabla `duels` y marca `races.duel`. Las carreras de duelo suman al historial normal y a las estadísticas generales, con esa marca. Hay estadísticas propias de duelos en el inicio, Estadísticas y el perfil.

### Torneos

Eliminación directa. Cada partido es un duelo, con el mismo motor de `server/duels.js`. Los torneos se crean y se controlan desde el panel; en la app los jugadores solo se inscriben, se retiran y juegan.

- **Llave:** se sortea al empezar. Si los inscriptos no son potencia de 2, los mejores sembrados pasan directo la primera ronda. Tamaños: 4, 8, 16 o 32.
- **Partido:** los dos tienen `ready_secs` (180 por defecto) para pulsar «Estoy listo». Quien no aparece pierde; si no aparece ninguno, pasa el mejor sembrado. Mientras esperan, tienen que dejar abierta la pantalla del torneo (la conexión vive ahí).
- **Desempate:** si en el duelo no termina nadie en 5 minutos, pasa quien llegó más lejos en el texto. Con igualdad total se repite con otro texto, y si vuelve a haber igualdad pasa el mejor sembrado.
- **Abandono:** quien abandona o se desconecta durante el duelo, o durante la cuenta regresiva, pierde.
- **Reinicio y mantenimiento:** si el servidor se reinicia con un partido en juego, el partido vuelve a «listo» con tiempo nuevo. Durante el mantenimiento los plazos se congelan y al volver quedan 60 segundos.
- **Estadísticas:** los duelos de torneo también cuentan en el filtro Duelos y en los rankings de Duelos (son duelos reales). El filtro Torneos muestra solo los de torneo.
- **Acceso:** abierto, por reglas (récord mínimo en CPM o WPM y/o una medalla ganada, que puede ser secreta: un «pase VIP») o lista cerrada. A quien no tiene el pase solo se le dice que no cumple los requisitos, y la lista pública muestra «Con pase» sin el nombre.
- **Premios de XP por puesto:** campeón, finalista, semifinalista y participación, definidos en cada torneo (o el valor global). Los descalificados no cobran.
- **Medallas:** «Torneos ganados» y la medalla Campeón cuentan los torneos realmente ganados en la app.
- **Todavía no:** sumar jugadores con el torneo en curso, sembrado por velocidad (hoy es sorteo), mejor de 3, tercer puesto, doble eliminación y notificaciones fuera de la app. Mientras se está en la pantalla del torneo, las invitaciones a duelos comunes no se muestran.

<details>
<summary><b>Contrato con el panel: tablas, acceso y órdenes</b></summary>

&nbsp;

Estados de `tournaments.status`: `borrador` (oculto), `inscripcion`, `en_curso`, `finalizado` y `cancelado`. El panel crea la fila en `tournaments` (`name`, `description`, `status`, `size`, `access`, `starts_at`, `ready_secs`, `text_id`, `created_at`, y las columnas de XP `xp_champ`, `xp_final`, `xp_semi` y `xp_part`, donde `-1` significa «usar el valor global»). Al iniciar el torneo los `-1` se reemplazan por el global vigente.

`access` es JSON:

- `{"mode":"open"}`: abierto a todos.
- `{"mode":"rules","minCpm":400,"medal":"id-de-medalla"}`: exige récord mínimo y/o medalla. Ambos son opcionales.
- `{"mode":"list"}`: solo entran los que agrega el panel.

El panel deja filas en `tournament_orders` (`tournament_id`, `kind`, `user_id`, `match_id`, `created_at`). La app las procesa cada 2 segundos y escribe `done_at` y `result` (`ok` o el motivo del error):

- `start`: sortea la llave y arranca (también arranca solo a la hora `starts_at`, si hay 2 o más inscriptos).
- `cancel`: cancela el torneo.
- `add` (`user_id`) y `remove` (`user_id`): agrega o quita un jugador a mano. Solo en inscripción. `add` se salta el acceso.
- `dq` (`user_id`): descalifica; si está jugando, el rival gana al instante.
- `advance` (`user_id`, `match_id`): fuerza que ese jugador gane su partido pendiente.

</details>

### Niveles y experiencia

La experiencia se guarda **al ocurrir** (no se recalcula con conteos): `races.xp` en cada carrera, la tabla `xp_events` para duelos, torneos y ajustes, y el total en `users.xp`. El historial queda fijo: cambiar un valor global no baja de nivel a nadie.

- **Valores de fábrica:** 10 XP por carrera, 15 en Hardcore, +5 por carrera sin errores, +20 por duelo ganado y +150 por torneo ganado. Los premios de finalista, semifinalista y participación empiezan en 0.
- **Nivel**: pasar del nivel N al N+1 cuesta `base + aumento × (N−1)` XP, así que cada nivel pide un poco más que el anterior (de fábrica, base 100 y aumento 10: el nivel 10 llega a 1.260 XP y el 100 a 58.410). Títulos por tramo: Novato (1), Aprendiz (3), Mecanógrafo (6), Escribano (10), Veloz (15), Experto (22), Maestro (30), Leyenda (40), Virtuoso (55), Eminencia (70), Titán (85) e Inmortal (100).
- **Potenciadores:** multiplicador de 1,1 a 10, global o para un usuario, con inicio y fin. Rige el más alto entre los activos (no se acumulan) y multiplican la XP de carreras, duelos ganados y torneos, no los ajustes manuales. Se avisan en la ventana de nivel, en el inicio y en el resultado de carrera.
- Todo esto se configura desde el panel (`settings.progress`). Los valores de fábrica y la validación están en `server/levels.js`.

### Metas y misiones

Las administra el panel: metas fijas, misiones por día, por semana y eventos, más un pozo del que la rotación elige las de cada día. El progreso se cuenta con las carreras del período (con filtros), los duelos ganados o los días seguidos, en la zona horaria fija del servidor (UTC−3); no se guardan contadores por carrera.

- **Cupos:** tres misiones a la vez entre el día y la semana, y hasta una de la semana. Las metas fijas y los eventos no ocupan cupo.
- **Premios:** XP, potenciador o cosmético, siempre al reclamar. Lo no reclamado no se entrega y un mismo premio no se cobra dos veces (`mission_claims`). La XP de una misión no la multiplica un potenciador.
- **Economía calibrada contra la curva (base 100, aumento 10).** Una carrera normal da 10 XP y pasar del nivel 50 al 51 pide 590.

| Premio | XP | Equivale a |
|---|---|---|
| Meta fija | 10 | 1 carrera |
| Misión del día | 15 a 25 | 1,5 a 2,5 carreras |
| Misión de la semana | 60 | 6 carreras |
| Evento | 40 | 4 carreras |

- **Tope diario:** 120 XP por defecto (0 = sin tope), que son 12 carreras normales y alrededor del 20 % de un nivel en el 50. Cuenta toda la XP de misiones del día, también la semanal y los eventos; un día normal ronda los 70 XP, así que el tope solo recorta cuando coinciden varias reclamaciones grandes.
- **Efecto en el avance:** con unas 10 carreras por día, las misiones suman alrededor de un 35 % de la XP diaria; con 20, cerca del 20 %. Acompañan el ritmo de las carreras, no lo reemplazan.

### Medallas

- Las automáticas se ganan solas según una condición y un objetivo: carreras completadas, velocidad máxima, promedio, carreras sin errores, Hardcore (carreras y velocidad) y duelos (jugados, ganados, racha, porcentaje de victorias desde 10 duelos, velocidad máxima, promedio desde 5 duelos, ganados sin errores), más torneos ganados. Las de velocidad se escriben en CPM o WPM (1 WPM = 5 CPM; se guarda en CPM). Las manuales las otorga un administrador y pueden ser apilables (con contador) o secretas.
- Nivel de color separado del ícono: bronce, gris, oro, coral y blanco. Hay 63 íconos SVG de línea (24x24) en cuatro paquetes: base (20), variados (20), torneos (11) y duelos (12), en `server/medal-icons/<paquete>/<nombre>.svg`. Cada ícono lo usa una sola medalla. El servidor arma el SVG al vuelo en `/img/medals/<ícono>--<nivel>.svg`, con ETag.
- `server/medals-base.json` solo se carga en una base nueva. En una base existente no vuelve nada de lo que se borró.

### Recompensas

Cosméticos del perfil, de cuatro tipos: **marcos de foto**, **efectos de nombre** (un preset más una tipografía), **portadas** y **paletas de colores** (que cambian el acento y las superficies del perfil). Cada una tiene rareza (común, rara, épica o legendaria), temática y puede ser animada o estática. Se activan desde Editar perfil y avisan con «Desbloqueaste…» al conseguirlas.

- **Presets, no archivos:** los efectos son presets de `css/rewards.css` dibujados con CSS o SVG. Nadie sube archivos y la CSP no cambia. El marco es un anillo con degradado cónico animado (`@property --ang`), el nombre es texto con degradado o sombras, y las portadas son degradados, SVG embebidos y animación de fondo.
- **Tipografías:** lista blanca (`FONTS` en `server/rewards.js`) que se pide a Google Fonts solo cuando aparece alguien que usa esa tipografía.
- **Cómo se desbloquean:** a mano, por medalla, por puesto en un torneo o por un evento con fechas (que puede vencer al terminar). Las de nivel son casilleros del **camino de niveles**: se consiguen al llegar al nivel y **se reclaman a mano** (pueden ser cosméticos temporales o permanentes, potenciadores que corren al reclamarlos o XP extra). Nunca se quita lo ya entregado.
- **Dónde se ven:** en el perfil con animación; en rankings, duelos y torneos, quietas. Respetan `prefers-reduced-motion`.
- **Visibilidad:** cada una se muestra como «bloqueada» (con la pista de cómo conseguirla) u «oculta» hasta tenerla.
- **Compatibilidad:** el anillo animado necesita `@property` (Firefox 128 o superior, Safari 16.4 o superior); en navegadores más viejos queda quieto y no se rompe. Retrowave usa container queries (Chrome 105, Safari 16 y Firefox 110 o superiores).

### Identidad visual

La idea es **una tecla y un cursor**: el logo termina en un cuadrado de color, y ese cuadrado es el cursor que aparece en los rótulos.

- Los botones son teclas (borde inferior, se hunden al apretar); los controles dentro de filas (pestañas, segmentos) quedan planos.
- Los paneles principales llevan marcas de registro en dos esquinas, dibujadas con `background`, sin pseudo-elementos. No hay franjas de color al costado.
- Rótulos en IBM Plex Mono, en mayúsculas y con cuadrado. Fondo de papel cuadriculado (`--grid`).
- Tokens: `--bg-deep`, `--raise`, `--grid`, `--k` (radio de tecla), `--z1` a `--z4` (los dedos en el dibujo del teclado) y `--key-fill`, `--key-line` y `--key-text` (la tecla del dibujo; en los temas oscuros se separa del panel y las letras apagadas, las que no están en la palabra encendida, suben de contraste).
- `js/art.js` genera las ilustraciones SVG (teclado con zonas por dedo, íconos de modo, diagramas de CPM, duelo, llave, Hardcore, récord, niveles de medalla y escenas legales); toman el color del tema. `img/mark.svg` es la marca y el favicon.

### Textos de las páginas

Todo el texto de Información, Guías, FAQ y las páginas legales vive en `js/pages.js`, con marcadores `{{contacto}}`, `{{fecha}}` y `{{repo}}`. El contacto es el perfil público de `@neanbit` (constante `CONTACT_HANDLE`). El HTML pasa por la lista blanca de `server/html-safe.js` al guardar y al servir.

> Los textos legales describen lo que hace la app hoy, pero **no son asesoramiento legal**. Conviene que los revise alguien con conocimiento de la Ley 25.326.

## Administración

El panel `neanbit-type-admin` es un proyecto aparte (repo privado, `neanbit/neanbit-type-admin`): escucha solo en `127.0.0.1`, comparte la base SQLite con la app y escribe en la tabla `settings`. Cada proyecto de neanbit tiene su propio panel. La app lee, en cada pedido a `/api/config`:

| Clave | Qué controla |
|---|---|
| `maintenance` | Modo mantenimiento y mensaje (la app solo lee `on` y `message`). |
| `info` | Aviso del sitio, arriba de la página Información. |
| `features` | Funciones encendidas o apagadas: `share`, `rematch`, `sound`, `pace`, `mytexts`, `levels` y `goal`. Apagar solo **oculta** (con `data-feature` y `html[data-off]`): el servidor no impide una revancha ni un compartir. |
| `progress` | XP por acción (incluye los valores por defecto de los puestos de torneo), curva de niveles (`curve`: base y aumento), títulos de nivel, y meta diaria por defecto y máxima. |
| `missions` | Metas y misiones: zona horaria fija del día y la semana, cupos (cuántas a la vez, cuántas de la semana), pozo, evento automático y tope diario de XP por misiones. |
| `content` | Reemplazos de los textos de las páginas y datos del sitio (contacto, fecha, repositorio). Una página personalizada guarda el texto completo y no recibe cambios posteriores del original. |

Además de `settings`, el contrato incluye las tablas `announcements`, `user_medals`, `tournament_orders`, `xp_events`, `xp_boosters`, `rewards`, `user_rewards`, `tracks`, `track_slots`, `track_claims`, `missions`, `mission_claims` y `mission_rotation`, y las columnas `users.verified` (0, 1 o 2), `users.role` (`user` o `admin`), `users.goal`, `users.xp_bonus` y `missions.pool`. Las tablas y columnas nuevas las crea la app al arrancar: **la app se actualiza primero y el panel después**. Si cambia alguno de estos formatos en la app, hay que actualizar el panel.

Los textos originales de las páginas viven en `js/pages.js`. Cuando cambien, regenerá el archivo que usa el panel y copialo a la carpeta `server/` del panel:

```bash
node scripts/export-content.mjs
```

Estos archivos deben ser **idénticos** en la app y el panel (si se cambia uno, se copia al otro): `server/rewards.js`, `server/medals.js`, `server/levels.js`, `server/xp.js`, `server/html-safe.js`, `server/content.js`, `server/content-defaults.json`, `server/medal-icons/`, `css/rewards.css` y `js/rewards.js`.

## Despliegue en un VPS

Guía usada en producción: VPS con Ubuntu 24.04 LTS, acceso por SSH con un usuario sin privilegios (`neanbit`), Node 22 y un dominio con el DNS en Cloudflare. La app escucha solo en `127.0.0.1:3000` y el público entra por un Cloudflare Tunnel, que se conecta desde adentro hacia afuera: no hace falta abrir 80 ni 443.

<details>
<summary><b>Paso a paso (pasos 1 a 10)</b></summary>

&nbsp;

Cuando un bloque lleve `sudo`, corré `sudo -v` solo primero y poné la contraseña; si no, se mezcla con las líneas siguientes.

**1. Reconocer el VPS**

```bash
lsb_release -d
node -v
sudo ss -tlnp | grep -E ':3000 |:4000 ' || echo "puertos 3000 y 4000 libres"
git --version
```

El filtro lleva un espacio al final: `:4000` sin espacio coincide con el puerto `40000` de `warp-svc` (Cloudflare WARP).

**2. Instalar Node 22 y clonar el repo**

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
git clone https://github.com/neanbit/neanbit-type.git ~/neanbit-type
```

`node -v` tiene que mostrar `v22.13` o superior. Esto reemplaza el Node del sistema.

**3. Prueba de arranque con una base temporal**

```bash
cd ~/neanbit-type
mkdir -p ~/neanbit-type-data
node --check server/index.js && echo "sintaxis ok"
NT_DB=/tmp/prueba.db PORT=3000 node server/index.js > /tmp/nt.log 2>&1 & echo $! > /tmp/nt.pid
sleep 2; curl -s -o /dev/null -w "respuesta: %{http_code}\n" http://localhost:3000/; cat /tmp/nt.log; kill $(cat /tmp/nt.pid)
```

Esperado: `sintaxis ok`, `respuesta: 200` y en el log `neanbit type en http://localhost:3000`.

**4. Servicio systemd (endurecido)**

```bash
sudo -v
rm -f /tmp/prueba.db*
sudo tee /etc/systemd/system/neanbit-type.service > /dev/null <<'EOF'
[Unit]
Description=neanbit type
After=network.target

[Service]
Type=simple
User=neanbit
WorkingDirectory=/home/neanbit/neanbit-type
Environment=NT_ADMIN=neanbit
Environment=NT_DB=/home/neanbit/neanbit-type-data/data.db
Environment=PORT=3000
Environment=HOST=127.0.0.1
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/neanbit/neanbit-type-data /home/neanbit/neanbit-type-backups
ProtectKernelTunables=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
CapabilityBoundingSet=

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now neanbit-type
sleep 2
systemctl is-active neanbit-type
curl -s -o /dev/null -w "respuesta: %{http_code}\n" http://localhost:3000/
sudo ss -tlnp | grep ':3000'
```

Esperado: `active`, `respuesta: 200` y `127.0.0.1:3000` en la línea de `ss` (nunca `0.0.0.0` ni `*`). `MemoryDenyWriteExecute` no se puede usar con Node (JIT). Si cambiás `NT_ADMIN`, editá esa línea, y después `sudo systemctl daemon-reload` y `sudo systemctl restart neanbit-type`.

**5. Firewall**

```bash
sudo ufw default deny incoming
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status verbose
```

Esperado: `Status: active`, política `deny (incoming)` y solo OpenSSH permitido. Desde otra máquina, el puerto 3000 de la IP pública tiene que estar cerrado (en PowerShell: `Test-NetConnection IP-DEL-VPS -Port 3000` da `TcpTestSucceeded : False`).

**6. Instalar cloudflared**

```bash
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg > /dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared
cloudflared --version
```

**7. Autorizar con tu cuenta de Cloudflare**

```bash
cloudflared tunnel login
```

Imprime un enlace de `dash.cloudflare.com`: abrilo, elegí el dominio y la terminal dice `You have successfully logged in`. Guarda un certificado en `~/.cloudflared/`, que es una credencial: no lo pegues en ningún lado.

**8. Crear el túnel y el registro DNS**

```bash
cloudflared tunnel create neanbit-type
cloudflared tunnel route dns neanbit-type type.neanbit.com
ID=$(ls -t ~/.cloudflared/*.json | head -1 | xargs basename | sed 's/\.json//'); echo "ID del tunel: $ID"
```

**9. Configurar el servicio del túnel**

Antes, comprobá que el VPS no tenga ya un servicio de cloudflared (si lo tiene, `service install` falla y un `tee` sobre `config.yml` te pisaría la configuración existente):

```bash
systemctl is-enabled cloudflared 2>/dev/null; ls -la /etc/cloudflared/ 2>/dev/null
```

Si no existe nada:

```bash
sudo -v
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/$ID.json /etc/cloudflared/
sudo tee /etc/cloudflared/config.yml > /dev/null <<EOF
tunnel: $ID
credentials-file: /etc/cloudflared/$ID.json
ingress:
  - hostname: type.neanbit.com
    service: http://localhost:3000
  - service: http_status:404
EOF
sudo cloudflared service install
sleep 3; systemctl is-active cloudflared
```

Si ya existe un servicio, **no lo desinstales**: hacé copia del config (`sudo cp /etc/cloudflared/config.yml /etc/cloudflared/config.yml.bak`), agregá tu hostname al `ingress` del que ya existe y reiniciá:

```bash
sudo systemctl restart cloudflared
sleep 4
systemctl is-active cloudflared
curl -s -o /dev/null -w "type.neanbit.com: %{http_code}\n" https://type.neanbit.com/
```

Esperado: `active` y `type.neanbit.com: 200`. Si da 530 o 1033, esperá un minuto y repetí. Para revisar el estado usá `systemctl is-active cloudflared`, no `systemctl status` (puede mostrar el token del servicio).

**10. Backup diario**

```bash
sudo apt-get install -y sqlite3   # opcional: solo para inspeccionar copias a mano
chmod +x ~/neanbit-type/scripts/backup.sh
~/neanbit-type/scripts/backup.sh && ls -lh ~/neanbit-type-backups/
(crontab -l 2>/dev/null; echo "17 4 * * * /home/neanbit/neanbit-type/scripts/backup.sh") | crontab -
crontab -l | tail -3
```

`scripts/backup.sh` hace una copia consistente con `VACUUM INTO` y rota por fecha (14 días por defecto; variables `NT_DB`, `NT_BACKUPS` y `KEEP`). Pegá el `crontab` una sola vez, para no duplicar la tarea.

**Primer uso:** abrí `https://type.neanbit.com`, registrá el usuario con el mismo nombre que `NT_ADMIN` y probá el inicio, una carrera y Estadísticas.

</details>

## Operación

**Actualizar la app** (el servicio hay que reiniciarlo siempre: el hash del front se calcula al arrancar):

```bash
cd ~/neanbit-type
git pull
sudo systemctl restart neanbit-type
systemctl is-active neanbit-type
```

**Estado y registros:**

```bash
systemctl is-active neanbit-type
sudo journalctl -u neanbit-type --no-pager -n 30
```

**Backup manual y restauración** (la restauración reemplaza la base actual; usala solo si hace falta, y detené también el panel si lo tenés):

```bash
~/neanbit-type/scripts/backup.sh
ls -lh ~/neanbit-type-backups/

sudo systemctl stop neanbit-type
cp ~/neanbit-type-data/data.db ~/neanbit-type-data/data.db.antes
cp ~/neanbit-type-backups/data-FECHA.db ~/neanbit-type-data/data.db
rm -f ~/neanbit-type-data/data.db-wal ~/neanbit-type-data/data.db-shm
sudo systemctl start neanbit-type
```

**Auditoría rápida de seguridad** (solo lectura): `bash scripts/audit-seguridad.sh`. Revisa que 3000 y 4000 escuchen solo en `127.0.0.1`, los permisos de la base, el token y las copias, el estado de SSH y del firewall, las cabeceras HTTP y los servicios.

**Compactar la base una vez.** `secure_delete` pisa con ceros lo que se borra desde que está activo; lo que se borró antes puede seguir en espacio libre del archivo. Con una copia hecha antes:

```bash
export NT_DB=/home/neanbit/neanbit-type-data/data.db
sudo systemctl stop neanbit-type neanbit-type-admin
sudo -u neanbit node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.env.NT_DB);d.exec('pragma secure_delete=on');d.exec('vacuum');d.exec('pragma wal_checkpoint(truncate)')"
sudo systemctl start neanbit-type neanbit-type-admin
```

**Rendimiento.** Es un solo proceso sin dependencias; para un círculo de usuarios (no miles de carreras simultáneas), SQLite en un VPS alcanza de sobra. Puntos a medir con más uso: `node:sqlite` es síncrono, las fotos de perfil están en base64 dentro de `users` y algunas consultas hacen `select *`. Si algún día hay más de un servidor, habría que migrar a PostgreSQL.

## Seguridad

Que los puertos 3000 y 4000 existan en el VPS no los expone: `localhost` es «esta misma máquina», y los dos escuchan solo en `127.0.0.1`. Lo que sí hay que cuidar: que `ss -ltn` muestre `127.0.0.1:3000` y nunca `0.0.0.0` ni `*`, y **no publicar el panel (puerto 4000) por el túnel**.

| Tema | Medida |
|---|---|
| Puerto | Escucha solo en `127.0.0.1`. |
| IP del cliente | `cf-connecting-ip` solo se acepta si el pedido viene del túnel (loopback). |
| Login | 5 fallos cada 15 minutos por IP y usuario, 30 por usuario; responde 429 con `Retry-After`. |
| Registro | 10 intentos por minuto y 5 cuentas por hora por IP. |
| API | Límites generales por IP y por usuario. |
| CSRF | Cookie SameSite y verificación de `Origin` y `Sec-Fetch-Site`. |
| Cabeceras | CSP, HSTS, `nosniff`, `frame-ancestors none` y `no-store` en la API. |
| Contraseñas | De 8 a 200 caracteres y distinta del usuario; scrypt con un hash señuelo (sin diferencia de tiempos). |
| IDs de usuario | Contador `user_seq`: no se reutilizan nunca. |
| WebSocket | Un error en un mensaje no tumba la conexión; verifica el `Origin`. |
| Borrado | `secure_delete` y checkpoint del WAL; se limpian las filas de torneos. |
| Copias | Las previas a acciones destructivas conservan las últimas 20, hasta 30 días y 2000 MB; las diarias, 14 días. |

**Límites conocidos** (decisiones, no olvidos):

- Los contadores de límite de intentos viven en memoria y se reinician con el servicio. El bloqueo de login también puede frenar por unos minutos (máximo 15) a la víctima de un ataque a su cuenta.
- La CSP bloquea el script inline de «JavaScript Detections» de Cloudflare. Si lo ves en la consola, desactivalo en Cloudflare (Security → Settings) o arrancá con `NT_CSP=report`.
- Las copias de seguridad **conservan lo borrado** hasta que rotan. Para borrar de verdad un dato hay que borrarlo en la app o el panel y después borrar las copias.
- La velocidad de las carreras normales la informa el navegador: no hay forma de impedir del todo que alguien envíe marcas falsas (en duelos la mide el servidor). El panel permite anular y editar carreras.

**Fuera del código:**

- **SSH:** `PasswordAuthentication no`, `PermitRootLogin no` y solo claves.
- **Firewall:** `ufw` con `deny incoming` y solo OpenSSH.
- **Cloudflare:** SSL/TLS en Full (strict), «Always use HTTPS», HSTS y Bot Fight Mode, más una regla de rate limit en `/api/login` y `/api/register` como segunda capa.
- **Sistema:** `unattended-upgrades` activado; `fail2ban` para SSH es opcional.
- **Copias:** guardá `neanbit-type-backups` también fuera del VPS (rclone o scp, cifradas): una copia en el mismo disco no sirve si se pierde el VPS.
- **Secretos:** nunca subas `data.db`, `admin.token`, copias ni `.env` a Git (el `.gitignore` ya los excluye).

## Estado y pendientes

Hecho y en producción: el motor de tipeo, todos los modos, duelos, torneos, niveles con XP y potenciadores, el camino de niveles, metas y misiones, medallas, recompensas, estadísticas y las páginas informativas.

Todavía no:

- Capturas de pantalla para este README.
- Tipografías alojadas en el propio servidor (hoy vienen de Google Fonts, y la política de privacidad lo dice).
- Imagen para compartir en redes (`og:image`).
- Recuperación de contraseña y baja de cuenta desde la app (hoy se pide por el contacto).
- Probar en Safari y Firefox con torneos en vivo; la revancha con mala conexión (la invitación vence a los 30 s); el sonido y el ritmo del cursor con teclados reales.
- Estadísticas: no se guardan el tiempo por palabra ni el ritmo dentro de la carrera.
- Torneos: jugadores nuevos con el torneo en curso, sembrado por velocidad, mejor de 3, tercer puesto, doble eliminación y notificaciones fuera de la app.
- Bloquear a un usuario de las revanchas o invitaciones.
- Copia de las bases de datos fuera del VPS (hoy solo hay copias en el mismo servidor).

## Estructura del proyecto

El sitio no se compila: el navegador carga `index.html` y los módulos ES de `js/` tal cual, y `server/index.js` sirve los estáticos y la API con Node puro, sin dependencias.

- **`css/`**: un archivo por pantalla, más `style.css` con la base y las variables: `home`, `pick`, `race`, `stats`, `profile`, `duel`, `tourney`, `nivel`, `camino`, `rewards` y `pages`.
- **`js/`**: el front, en módulos ES y sin bundler. `main.js` arranca la app, `store.js` y `api.js` concentran el estado y las llamadas al servidor, y `engine.js` es el motor de tipeo; el resto cubre cada pantalla y cada función (duelos, torneos, niveles, recompensas, medallas, textos, sonido, editor, avatar).
- **`server/`**: el backend, en Node con `node:http` y SQLite (`node:sqlite`). `index.js` expone la API, las sesiones y los estáticos; `ws.js` mantiene el WebSocket de duelos y torneos; los demás módulos son de dominio (duels, tournaments, stats, xp, levels, medals, rewards, track, misiones, deliver, content, limits, seed, html-safe), junto con `medal-icons/` y los catálogos `*-base.json` con los que se siembra la base.
- **`scripts/`**: utilidades que se corren a mano. `backup.sh` hace la copia consistente con `VACUUM INTO` y la rota por días, `audit-seguridad.sh` audita el VPS en solo lectura y `export-content.mjs` regenera `server/content-defaults.json` a partir de los textos de `js/pages.js`.
- **`deploy/`**: archivos de referencia para desplegar. Las unidades de systemd (`.service.example`) de la app y del panel, la configuración de ejemplo del túnel de Cloudflare, `esquema.sql` para leer o levantar la base vacía, y `backup.sh` con la variante que corre en el servidor.

El detalle archivo por archivo está en [Estructura](#estructura), más arriba.

## Licencia y créditos

**Licencia:** sin definir. El repositorio es público, pero todavía no tiene una licencia; los Términos del sitio remiten a lo que diga el repositorio.

Proyecto de [neanbit](https://github.com/neanbit). Recreación de CananTyper. Tipografías: [Poppins](https://fonts.google.com/specimen/Poppins) e [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono), de Google Fonts.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cdn.neanbit.com/neanbit-n-transparente.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://cdn.neanbit.com/neanbit-n-transparent-onlight.svg">
    <img alt="neanbit" src="https://cdn.neanbit.com/neanbit-n-transparent-onlight.svg" width="48">
  </picture>
</p>
