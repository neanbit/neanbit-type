<div align="center">

<picture>
  <source media="(prefers-color-scheme: light)" srcset="https://cdn.neanbit.com/neanbit-wordmark-transparent-onlight.svg">
  <img src="https://cdn.neanbit.com/neanbit-wordmark-transparent-ondark.svg" alt="neanbit" width="240">
</picture>

# neanbit type

**Una app de mecanografía competitiva para el navegador: carreras con efecto TypeRacer, modo Hardcore, duelos 1 contra 1 en tiempo real, torneos de eliminación directa, medallas, estadísticas y rankings, con un panel de administración aparte.**

![Node.js](https://img.shields.io/badge/Node.js-22.13+-339933?logo=nodedotjs&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-node:sqlite-003B57?logo=sqlite&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES_modules-F7DF1E?logo=javascript&logoColor=black)
![WebSocket](https://img.shields.io/badge/WebSocket-propio-fca311)
![Sin dependencias](https://img.shields.io/badge/dependencias-0-14213d)
![Cloudflare Tunnel](https://img.shields.io/badge/Cloudflare_Tunnel-F38020?logo=cloudflare&logoColor=white)
![systemd](https://img.shields.io/badge/systemd-30D475?logo=systemd&logoColor=white)
![Ubuntu](https://img.shields.io/badge/Ubuntu-24.04-E95420?logo=ubuntu&logoColor=white)

[Funciones](#funciones) · [Modos de juego](#modos-de-juego) · [Duelos](#duelos) · [Torneos](#torneos) · [Medallas](#medallas) · [Instalación](#instalaci%C3%B3n) · [Despliegue](#despliegue-en-un-vps) · [Operación](#operaci%C3%B3n) · [Desarrollo](#desarrollo) · [Panel](#panel-de-administraci%C3%B3n) · [Variables](#variables-de-entorno) · [Seguridad](#seguridad) · [Estructura](#estructura) · [API](#api) · [Problemas](#soluci%C3%B3n-de-problemas) · [Hoja de ruta](#hoja-de-ruta)

</div>

En línea en **[type.neanbit.com](https://type.neanbit.com)**.

## Funciones

| Módulo | Qué hace |
|---|---|
| Carrera | Motor de tipeo con efecto TypeRacer: panel en vivo, resultado comparado contra el promedio de las últimas 10 carreras, atajos visibles y unidades CPM, WPM o Zen. |
| Modos | Aleatorio, personalizado (buscador de textos con filtros), Hardcore, entrenamiento de errores y contra fantasma (el propio récord). Textos favoritos. |
| Duelos | Carreras 1 contra 1 en tiempo real por WebSocket, contra un rival al azar o invitando por nombre de usuario. El servidor mide el tiempo y calcula la velocidad. |
| Torneos | Eliminación directa de 4, 8, 16 o 32 jugadores. Cada partido es un duelo. Se crean y se controlan desde el panel. |
| Perfil | Foto con recorte, biografía, país, teclado, Discord, insignia de ranking, verificado, vitrina de medallas, historial con fantasma y personalización de estilo. |
| Medallas | Íconos SVG en cinco niveles, con condiciones automáticas (carreras, velocidad, Hardcore, duelos, torneos) o manuales. Se crean y editan desde el panel. |
| Estadísticas | Resumen, gráfico de evolución con media móvil, actividad de 14 días, velocidad por categoría, teclado con errores y palabras críticas. Filtro General, Duelos y Torneos. |
| Rankings | Inicio con pestañas de Carreras, Promedios, Hardcore, Duelos y Torneos. |
| Cuentas | Registro e inicio de sesión propios, con scrypt, cookie HttpOnly y límite de intentos. Sin servicios externos de autenticación. |
| Anuncios y mantenimiento | Un anuncio activo que cada jugador ve una sola vez, un botón de información y un modo mantenimiento, todo desde el panel. |
| Temas | Tres temas (neanbit, claro y carbón) con el logo adaptado a cada uno. Poppins e IBM Plex Mono. |

**Principios de diseño:** solo navegador (sin Electron), sin Firebase ni Supabase ni servicios parecidos, sin emojis en la interfaz, íconos de línea propios en SVG, y todo lo configurable sale de variables de entorno, sin secretos en el código.

## Modos de juego

| Modo | Descripción |
|---|---|
| Aleatorio | Un texto activo al azar. |
| Personalizado | Elegir el texto: buscador con resaltado, filtros por largo, "una al azar" y "tu mejor" por texto. |
| Hardcore | Un error elimina la carrera. Tiene ranking propio. |
| Entrenamiento de errores | Practicar con las teclas y palabras en las que más se falla. |
| Contra fantasma | Correr contra el propio récord. |
| Duelo | Contra otra persona en tiempo real. Ver [Duelos](#duelos). |
| Torneo | Partidos de duelo dentro de una llave. Ver [Torneos](#torneos). |

Las unidades se cambian desde Ajustes: CPM (caracteres por minuto), WPM (palabras por minuto, 1 WPM = 5 CPM) y Zen (sin velocidad en pantalla).

## Duelos

El servidor no confía en el cliente: el navegador solo manda progreso, precisión y mapas de errores. El tiempo y la velocidad los calcula el servidor desde el mensaje `go`.

| Regla | Detalle |
|---|---|
| Conexión | Exige la cookie `nt_session` y que el `Origin` coincida con el `Host`. Una conexión por usuario: la nueva reemplaza a la vieja. |
| Emparejamiento | Rival al azar (cola) o invitación por nombre de usuario. La invitación vence a los 30 segundos y se puede aceptar, rechazar o cancelar. Solo se reciben invitaciones estando en la sala de Duelos. |
| Texto | Los dos corren el mismo texto: uno activo, elegido al azar, con los espacios normalizados. |
| Largada | Cuenta regresiva de 3 segundos y largada con el mensaje `go`. |
| Resultado | Gana quien termina primero. El otro tiene 90 segundos de gracia y el duelo tiene un tope de 5 minutos. Se rechazan velocidades imposibles (más de 1800 CPM). |
| Abandono | Si alguien se desconecta en plena carrera, gana el rival. Si se va antes de largar, el duelo se cancela sin resultado. |
| Mantenimiento | Con el modo mantenimiento activo no se puede buscar duelo (salvo el administrador). |

Las carreras de duelo suman al historial y a las estadísticas generales, con una marca de duelo (`races.duel`). Los rankings de Duelos ordenan por victorias, con desempate por porcentaje de victorias, y tienen filtro de 24 horas o histórico.

## Torneos

Eliminación directa. Cada partido es un duelo real, así que cuenta también en el filtro y en los rankings de Duelos. Los torneos se crean y se administran desde [el panel](#panel-de-administraci%C3%B3n); desde la app los jugadores solo se inscriben, se retiran y juegan.

**Estados:** `borrador` (oculto), `inscripcion`, `en_curso`, `finalizado` y `cancelado`.

| Regla | Detalle |
|---|---|
| Tamaño | 4, 8, 16 o 32 jugadores. |
| Acceso | `open` (abierto), `rules` (récord mínimo en CPM y/o medalla ganada, que puede ser oculta) o `list` (solo entran los que agrega el panel). |
| Llave | Se sortea al empezar. Si el número de inscriptos no es potencia de 2, los mejores sembrados pasan directo la primera ronda. |
| Inicio | Manual con "Iniciar ahora", o automático a la hora definida si hay 2 o más inscriptos. |
| Partido | Los dos jugadores tienen un tiempo (180 segundos por defecto) para pulsar "Estoy listo". Quien no aparece pierde; si no aparece ninguno, pasa el mejor sembrado. |
| Empate | Si en el duelo no termina nadie en 5 minutos, pasa quien llegó más lejos en el texto. Con igualdad total se repite con otro texto, y si vuelve a haber igualdad, pasa el mejor sembrado. |
| Abandono | Si alguien abandona o se desconecta durante el duelo o la cuenta regresiva, pierde. |
| Reinicio del servidor | Un partido en juego vuelve a "listo" con tiempo nuevo. |
| Mantenimiento | Los plazos se congelan; al volver quedan 60 segundos. |

**Cómo se juega:** entrar a Torneos desde el inicio, abrir un torneo e inscribirse si se cumple el acceso. Mientras se espera el partido hay que **dejar abierta la pantalla del torneo**, porque la conexión vive ahí: si se sale al inicio, no llega el aviso. Cuando el partido está listo aparece el aviso con cuenta regresiva y el botón "Estoy listo"; al confirmar los dos, arranca el duelo. Al terminar, "Volver al torneo" lleva a la llave.

### Contrato con el panel

El panel escribe en las tablas `tournaments`, `tournament_players`, `tournament_matches` y `tournament_orders`, que crea la app al arrancar. Para las acciones en vivo deja filas en `tournament_orders`; la app las lee cada 2 segundos y responde en `done_at` y `result` (`ok` o el motivo del error).

| Orden | Efecto |
|---|---|
| `start` | Sortea la llave y arranca. |
| `cancel` | Cancela el torneo. |
| `add` (`user_id`) | Agrega un jugador a mano, saltándose el acceso. Solo en inscripción. |
| `remove` (`user_id`) | Lo quita. Solo en inscripción. |
| `dq` (`user_id`) | Descalifica; si está jugando, el rival gana al instante. |
| `advance` (`user_id`, `match_id`) | Fuerza que ese jugador gane su partido pendiente. |

## Medallas

Las medallas no están fijas en el código: `server/medals-base.json` solo se carga en una base nueva (marca `settings.medals_v2`) y desde entonces todo se crea, edita y borra desde el panel.

- **Ícono y nivel separados.** Cada medalla tiene un ícono y un nivel: bronce, gris, oro, coral o blanco. La API entrega `icon` como `<ícono>--<nivel>` y el servidor arma el SVG al vuelo en `/img/medals/<ícono>--<nivel>.svg`, con ETag.
- **63 íconos** en `server/medal-icons/<pack>/<nombre>.svg`, en cuatro packs: `base` (20), `variados` (20), `torneos` (11) y `duelos` (12). Un ícono solo puede usarlo una medalla.
- **Condiciones automáticas:**

| Grupo | Condiciones |
|---|---|
| Carreras | Carreras completadas, velocidad máxima, promedio, carreras sin errores. |
| Hardcore | Carreras y velocidad. |
| Duelos | Jugados, ganados, racha, porcentaje ganado (desde 10 duelos), velocidad máxima, promedio (desde 5 duelos) y ganados sin errores. |
| Torneos | Torneos ganados. |
| Manual | Se otorga o se quita desde el perfil del usuario en el panel. |

Las condiciones de velocidad se escriben en CPM o WPM y se guardan en CPM. Las medallas manuales pueden ser apilables (con contador), como Campeón.

`server/medals.js` es **idéntico** en la app y en el panel. Si se cambia en uno, hay que copiarlo al otro. Para sumar un ícono, soltar el SVG en `server/medal-icons/<pack>/` de **los dos** proyectos y reiniciar ambos servicios.

## Requisitos

| Qué | Para qué |
|---|---|
| Node.js 22.13 o superior | El servidor usa `node:sqlite`, que no existe en versiones anteriores. |
| Git | Clonar y actualizar. |
| Un VPS con Ubuntu 24.04 | Solo para el despliegue en línea. |
| Un dominio con el DNS en Cloudflare | Solo para el despliegue en línea (túnel de Cloudflare). |

No hay `npm install`: el proyecto no tiene dependencias ni paso de compilación.

## Instalación

Para probar en una máquina propia.

```bash
git clone https://github.com/neanbit/neanbit-type.git
cd neanbit-type
node -v
```

Resultado esperado: `v22.13.0` o superior.

```bash
NT_ADMIN=tuusuario NT_DB=/tmp/prueba.db PORT=3000 node server/index.js
```

Resultado esperado: `neanbit type en http://localhost:3000`. Aparece también `ExperimentalWarning: SQLite is an experimental feature`, que es normal.

Abrir `http://localhost:3000`, crear la cuenta con el mismo nombre de usuario que `NT_ADMIN` (esa cuenta es la administradora) y probar el inicio, una carrera y Estadísticas. Si no se define `NT_DB`, la base se crea como `data.db` en la raíz del proyecto; está en el `.gitignore`.

## Despliegue en un VPS

Guía para un VPS con Ubuntu 24.04 y el usuario `neanbit`. Los comandos se pegan en la terminal del servidor. Cambiar `neanbit` y `type.neanbit.com` por el usuario y el dominio propios.

Los archivos de configuración que se usan en los pasos 4, 9 y 10 también están en la carpeta [`deploy/`](deploy) como ejemplos, para copiarlos y editarlos en vez de pegar los bloques: `neanbit-type.service.example`, `neanbit-type-admin.service.example`, `cloudflared-config.yml.example` y `backup.sh`. Ninguno lleva claves; las credenciales del túnel quedan en el servidor.

### 1. Reconocer el VPS

```bash
lsb_release -d
node -v
sudo ss -tlnp | grep -E ':3000 |:4000 ' || echo "puertos 3000 y 4000 libres"
git --version
```

Resultado esperado: Ubuntu 24.04, la versión de Node (la de Ubuntu es demasiado vieja), los puertos libres y la versión de Git. El filtro lleva un espacio al final porque `:4000` sin espacio también coincide con `:40000`.

### 2. Node 22 y el repositorio

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
git clone https://github.com/neanbit/neanbit-type.git ~/neanbit-type
ls ~/neanbit-type
```

Resultado esperado: `node -v` muestra `v22.x.x` (22.13 o superior) y el `ls` lista `css`, `img`, `index.html`, `js` y `server`. Esto reemplaza el Node del sistema; los procesos que ya corrían con otro Node no se tocan.

### 3. Prueba de arranque con base temporal

```bash
cd ~/neanbit-type
mkdir -p ~/neanbit-type-data
node --check server/index.js && echo "sintaxis ok"
NT_DB=/tmp/prueba.db PORT=3000 node server/index.js > /tmp/nt.log 2>&1 & echo $! > /tmp/nt.pid
sleep 2; curl -s -o /dev/null -w "respuesta: %{http_code}\n" http://localhost:3000/; cat /tmp/nt.log; kill $(cat /tmp/nt.pid)
```

Resultado esperado: `sintaxis ok`, `respuesta: 200` y en el log `neanbit type en http://localhost:3000`.

### 4. Servicio systemd

Pedir antes la contraseña de `sudo`, sola, para que no se mezcle con las líneas del bloque siguiente:

```bash
sudo -v
rm -f /tmp/prueba.db*
```

Crear el servicio:

```bash
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
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF
```

Activar y verificar:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now neanbit-type
sleep 2
systemctl is-active neanbit-type
curl -s -o /dev/null -w "respuesta: %{http_code}\n" http://localhost:3000/
sudo ss -tlnp | grep ':3000'
```

Resultado esperado: `active`, `respuesta: 200` y una línea de `ss` con el puerto 3000. Aparece como `*:3000`: el servidor escucha en todas las interfaces, por eso es clave el firewall del paso siguiente.

### 5. Verificar que el puerto 3000 no está expuesto

```bash
sudo ufw status verbose
```

Resultado esperado: `Status: active`, política `deny (incoming)` y solo el puerto 22 (OpenSSH) permitido. Desde otra máquina, con la IP pública del VPS (`curl -4 -s ifconfig.me; echo`), `Test-NetConnection IP-DEL-VPS -Port 3000` en PowerShell debe dar `TcpTestSucceeded : False`. La app solo se alcanza por el túnel de Cloudflare.

### 6. Instalar cloudflared

```bash
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg > /dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared
cloudflared --version
```

Resultado esperado: la última línea muestra `cloudflared version 20xx.x.x`.

### 7. Autorizar con la cuenta de Cloudflare

```bash
cloudflared tunnel login
```

Resultado esperado: imprime un enlace de `dash.cloudflare.com`. Se abre en el navegador, se elige el dominio y la terminal dice `You have successfully logged in`. Guarda un certificado en `~/.cloudflared/`: es una credencial y no se pega ni se comparte en ningún lado.

### 8. Crear el túnel y el registro DNS

```bash
cloudflared tunnel create neanbit-type
cloudflared tunnel route dns neanbit-type type.neanbit.com
ID=$(ls -t ~/.cloudflared/*.json | head -1 | xargs basename | sed 's/\.json//'); echo "ID del tunel: $ID"
```

Resultado esperado: `Created tunnel neanbit-type with id ...`, luego `Added CNAME type.neanbit.com which will route to this tunnel` y el ID del túnel.

### 9. Configurar el servicio de cloudflared

**Antes de escribir nada, comprobar si el VPS ya tiene un servicio de cloudflared**, porque `/etc/cloudflared/config.yml` es un archivo compartido:

```bash
systemctl is-enabled cloudflared 2>/dev/null; ls -la /etc/cloudflared/ 2>/dev/null
```

Si no existe nada:

```bash
sudo -v
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/$ID.json /etc/cloudflared/
```

```bash
sudo tee /etc/cloudflared/config.yml > /dev/null <<EOF
tunnel: $ID
credentials-file: /etc/cloudflared/$ID.json
ingress:
  - hostname: type.neanbit.com
    service: http://localhost:3000
  - service: http_status:404
EOF
```

```bash
sudo cloudflared service install
sleep 3; systemctl is-active cloudflared
```

Resultado esperado: `active`.

Si el VPS ya tenía un servicio, `service install` falla con "already installed". En ese caso no se desinstala nada: se hace copia del config existente, se agrega el `hostname` de type al `ingress` que ya existe y se reinicia el servicio.

```bash
sudo cp /etc/cloudflared/config.yml /etc/cloudflared/config.yml.bak
sudo systemctl restart cloudflared
sleep 4
systemctl is-active cloudflared
sudo journalctl -u cloudflared --no-pager --since "1 minute ago" | grep -E "Registered tunnel|ERR" | sed 's/connection=[^ ]*//' | tail -6
curl -s -o /dev/null -w "type.neanbit.com: %{http_code}\n" https://type.neanbit.com/
```

Resultado esperado: `active`, varias líneas `Registered tunnel connection` y `type.neanbit.com: 200`. Las líneas `ERR` del proceso viejo cerrándose son normales. Si el `curl` da 530 o 1033, esperar un minuto y repetir. Para revisar el estado, usar `systemctl is-active` o `journalctl` filtrado y no `systemctl status`, que puede mostrar el token del servicio en pantalla.

### 10. Backup diario de la base

```bash
sudo -v
sudo apt-get install -y sqlite3
tee ~/neanbit-type-data/backup.sh > /dev/null <<'EOF'
#!/bin/bash
DB=/home/neanbit/neanbit-type-data/data.db
OUT=/home/neanbit/neanbit-type-backups
mkdir -p "$OUT"
sqlite3 "$DB" ".backup '$OUT/data-$(date +%F).db'"
find "$OUT" -name 'data-*.db' -mtime +14 -delete
EOF
chmod +x ~/neanbit-type-data/backup.sh
~/neanbit-type-data/backup.sh && ls -lh ~/neanbit-type-backups/
```

Resultado esperado: un archivo `data-AAAA-MM-DD.db` en la lista. Programarlo todos los días a las 4:30 (pegar una sola vez, para no duplicar la tarea):

```bash
(crontab -l 2>/dev/null; echo "30 4 * * * /home/neanbit/neanbit-type-data/backup.sh") | crontab -
crontab -l | tail -3
```

Resultado esperado: la última línea muestra `30 4 * * * /home/neanbit/neanbit-type-data/backup.sh`. Las copias se conservan 14 días y quedan en el mismo VPS: protegen de errores, no de la pérdida del servidor.

### 11. Primer uso

Abrir `https://type.neanbit.com`, crear la cuenta con el nombre de usuario igual a `NT_ADMIN` y probar: inicio, una carrera y Estadísticas. Para usar otro nombre de administrador, cambiar la línea `Environment=NT_ADMIN=...` en `/etc/systemd/system/neanbit-type.service` y correr `sudo systemctl daemon-reload` y `sudo systemctl restart neanbit-type`.

### Entorno de referencia

Así corre hoy en producción, por si sirve de comparación:

| Pieza | Detalle |
|---|---|
| Servidor | VPS de Contabo con Ubuntu 24.04, 4 núcleos y 7,8 GiB de RAM. En reposo la carga ronda 0,05. |
| App | Servicio `neanbit-type`, puerto 3000, reinicio automático. Node 22 instalado con NodeSource. |
| Base y copias | `~/neanbit-type-data/data.db` y `~/neanbit-type-backups/`, fuera del repositorio. |
| Acceso | Túnel `neanbit-type` de Cloudflare hacia `localhost:3000`. El firewall solo deja pasar SSH. |
| Convive con | Bots de Discord y APIs de FastAPI bajo pm2, otro proceso de cloudflared con token y `warp-svc` en `127.0.0.1:40000`. Nada de eso se toca. |

## Operación

### Actualizar

```bash
cd ~/neanbit-type
git pull
sudo systemctl restart neanbit-type
systemctl is-active neanbit-type
```

Resultado esperado: `active`. **Siempre hay que reiniciar el servicio después de cambiar archivos**: el servidor agrega `?v=<hash>` a cada archivo que carga la página (los `src` y `href` de `index.html` y cada `import` de los `.js`), y ese hash se calcula al arrancar a partir de `index.html`, `css/` y `js/`. Así cada actualización cambia todas las direcciones y ninguna copia vieja del navegador, de una extensión o de Cloudflare puede reutilizarse. Los estáticos se sirven con `cache-control: no-cache`.

Las migraciones de la base son automáticas al arrancar (`create table if not exists` y `alter table ... add column`), por eso actualizar no rompe los datos existentes. La base y los backups están fuera de la carpeta del proyecto, así que ni `git pull` ni un `unzip` los tocan.

Para publicar un cambio propio:

```bash
cd ~/neanbit-type
git add .
git commit -m "mensaje corto de lo que cambió"
git push
sudo systemctl restart neanbit-type
```

### Estado y registros

```bash
systemctl is-active neanbit-type
sudo journalctl -u neanbit-type --no-pager -n 30
sudo systemctl restart neanbit-type
sudo systemctl stop neanbit-type
```

### Backups

```bash
ls -lh ~/neanbit-type-backups/
~/neanbit-type-data/backup.sh
```

Restaurar un backup (reemplaza la base actual; usar solo si hace falta):

```bash
sudo systemctl stop neanbit-type
cp ~/neanbit-type-data/data.db ~/neanbit-type-data/data.db.antes
cp ~/neanbit-type-backups/data-AAAA-MM-DD.db ~/neanbit-type-data/data.db
rm -f ~/neanbit-type-data/data.db-wal ~/neanbit-type-data/data.db-shm
sudo systemctl start neanbit-type
```

Los archivos `pre-*.db` de la misma carpeta son los backups que deja el panel antes de una acción destructiva; se restauran con el mismo procedimiento.

### Recursos

```bash
nproc
free -h
uptime
ps -eo pid,comm,%cpu,rss --sort=-rss | head -8
```

## Desarrollo

Para tocar el código no hace falta instalar nada. Esto es lo que conviene correr antes de subir un cambio.

Revisar la sintaxis de todos los módulos:

```bash
cd ~/neanbit-type
for f in js/*.js server/*.js; do node --check "$f" || echo "falla: $f"; done
```

Resultado esperado: ninguna salida. Si un archivo tiene un error, aparece su nombre.

Levantar el servidor con una base de prueba, en otro puerto, y apagarlo después:

```bash
NT_DB=/tmp/h.db PORT=3222 NT_ADMIN=ana node server/index.js > /tmp/srv.log 2>&1 & echo $! > /tmp/srv.pid
sleep 2; curl -s -o /dev/null -w "respuesta: %{http_code}
" http://localhost:3222/
kill $(cat /tmp/srv.pid)
```

Resultado esperado: `respuesta: 200`.

Algunas cosas que ya nos hicieron perder tiempo:

- **No usar `pkill -f "server/index.js"`** en el mismo comando que lanza el servidor: el texto del comando contiene esa ruta y se mata a sí mismo. Guardar el PID y usar `kill $(cat /tmp/srv.pid)`, como arriba.
- Los rankings guardan copia 20 segundos. Después de cargar datos de prueba hay que reiniciar o esperar.
- Los números de JavaScript llegan a `node:sqlite` como decimales. Si un parámetro entra en una división o en un `group by`, los grupos salen mal; escribir el entero ya calculado en el SQL (nunca texto del usuario) y dejar como parámetros solo los filtros.
- Antes de agregar una clase CSS, buscarla con `grep` para que no choque con otra. `.big` y `.table` no se pueden borrar de `style.css`, y una cuenta regresiva llamada `.count` ya chocó con la insignia de `profile.css`. Los estilos de Duelos llevan el prefijo `d-`.
- `server/medals.js` tiene que quedar igual en la app y en el panel.

Lo que falta de Torneos está anotado en [TORNEOS-PENDIENTES.md](TORNEOS-PENDIENTES.md), en la raíz del repositorio.

## Panel de administración

El panel es un proyecto aparte, **neanbit-type-admin**: Node 22.13 o superior, sin dependencias y sin build, que abre la misma base SQLite de la app. Por ahora no tiene repositorio y vive solo en el servidor; cuando lo tenga, se enlaza desde acá. Cada proyecto de neanbit tiene su propio panel; `neanbit-admin` queda reservado para un panel general que solo enlace a cada uno.

| Sección | Qué permite |
|---|---|
| Resumen | Usuarios, carreras, duelos, jugadores activos, carreras por día, horarios de juego, textos más jugados, últimos registros y estado del sistema (incluido el último backup). |
| Carreras | Filtrar por usuario, tipo, CPM mínimo y texto; ordenar; borrar carreras normales y Hardcore con backup previo. |
| Duelos | Historial, resumen y los 5 con más victorias. Anular un duelo con backup previo. |
| Torneos | Crear, editar, publicar, iniciar y cancelar; agregar, quitar y descalificar jugadores; forzar un ganador; llave en vivo. |
| Usuarios | Perfil, rol, verificado, medallas manuales, últimas carreras, cierre de sesiones, reinicio de estadísticas y borrado de cuenta. |
| Medallas | Crear, editar, ordenar y borrar medallas, con ícono, nivel y condición. |
| Mantenimiento y anuncios | Interruptor de mantenimiento con mensaje, botón de información y anuncios. |
| Textos y categorías | Alta, edición, activación y borrado de textos y categorías, con contadores de caracteres y palabras. |

**Instalación.** Se clona o se copia a `/home/neanbit/neanbit-type-admin` y se corre como servicio, igual que la app (hay una unidad de ejemplo en [`deploy/neanbit-type-admin.service.example`](deploy/neanbit-type-admin.service.example)), con estas variables: `NT_DB` (la misma base que la app), `NT_ADMIN`, `PORT=4000` y, opcionalmente, `NTA_BACKUPS`. Ejemplo manual:

```bash
NT_DB=/home/neanbit/neanbit-type-data/data.db NT_ADMIN=neanbit node server/index.js
```

Se abre en `http://localhost:4000`. En el VPS, VS Code reenvía el puerto solo desde la pestaña Puertos.

Para comprobar que solo escucha en local:

```bash
systemctl is-active neanbit-type-admin
sudo ss -tlnp | grep ':4000 '
```

Resultado esperado: `active` y `127.0.0.1:4000`. Si aparece `*:4000`, algo está mal.

**Reglas del panel:**

- Las acciones destructivas (reiniciar estadísticas, borrar una cuenta, cancelar un torneo, borrar una medalla) piden escribir una palabra de confirmación, y el servidor la verifica de nuevo. Antes de cada una se guarda un backup `pre-*.db` con `VACUUM INTO` (se conservan los últimos 20).
- El dueño (`NT_ADMIN`) no puede perder el rol de administrador ni borrarse.
- Un texto que ya se usó en carreras, duelos o muertes no se borra: se desactiva. No se puede desactivar ni borrar el último texto.
- Los textos nuevos miden entre 40 y 600 caracteres.
- El panel no crea tablas ni migra nada: usa las de la app. Si faltan las de Torneos, la sección avisa; hay que arrancar primero la versión de la app que las crea.
- Los rankings de la app guardan una copia de hasta 20 segundos (el texto del día, hasta 60), así que un cambio hecho desde el panel puede tardar ese tiempo en verse.

El panel tiene su propio README y su propio archivo de pendientes.

### Contrato entre la app y el panel

Si cambia alguno de estos formatos en la app, hay que actualizar el panel.

| Dato | Formato |
|---|---|
| `settings.maintenance` | `{"on": true, "message": "..."}`. La app solo lee esos dos campos. |
| `settings.info` | `{"title", "body"}`. Si se vacía, el panel borra la clave. |
| `users.verified` | `0`, `1` o `2`. |
| `users.role` | `user` o `admin`. |
| `user_medals` | El panel solo otorga y quita medallas de condición `manual`. |
| `announcements` | La app muestra el activo más reciente, una sola vez por jugador. |
| Tablas de torneos | `tournaments`, `tournament_players`, `tournament_matches` y `tournament_orders` (ver [Torneos](#contrato-con-el-panel)). |

## Variables de entorno

### App

| Variable | Por defecto | Qué es |
|---|---|---|
| `NT_ADMIN` | vacía | Nombre de usuario del administrador. Esa cuenta recibe el rol `admin` al arrancar. |
| `NT_DB` | `data.db` en la raíz del proyecto | Ruta de la base SQLite. |
| `PORT` | `3000` | Puerto del servidor. |

### Panel

| Variable | Por defecto | Qué es |
|---|---|---|
| `NT_DB` | obligatoria | La misma base que usa la app. |
| `NT_ADMIN` | vacía | El mismo usuario dueño que en la app. |
| `PORT` | `4000` | Puerto del panel (solo `127.0.0.1`). |
| `NTA_BACKUPS` | `neanbit-type-backups`, junto a la carpeta de la base | Carpeta de los backups previos a acciones destructivas. |

No hay archivo `.env`: las variables se definen en el servicio de systemd. El `.gitignore` excluye `data.db*`, `.env`, `node_modules/` y `*.zip`.

## Seguridad

- **Puerto cerrado.** `ufw` con `deny incoming` y solo SSH permitido. La app se alcanza únicamente por el túnel de Cloudflare.
- **Cuentas.** Claves con scrypt asíncrono (no frena el servidor), cookie `nt_session` HttpOnly y límite de intentos en registro e inicio de sesión.
- **Validación en el servidor.** Las carreras se validan en el servidor. En los duelos, el tiempo y la velocidad los mide el servidor.
- **WebSocket.** Exige la cookie de sesión y que el `Origin` coincida con el `Host`; tiene un límite de 4 KB por mensaje y 60 mensajes por segundo.
- **Panel.** Escucha solo en `127.0.0.1`, sin login (el acceso lo protege SSH). Acepta solo `Host` localhost o 127.0.0.1, exige el mismo origen y una cabecera propia en los cambios. **No se debe agregar un nombre de host público para el puerto 4000**; antes de exponerlo en línea hay que sumar login y HTTPS.
- **Unidad de systemd.** `NoNewPrivileges`, `PrivateTmp` y `ProtectSystem=full`.
- **Sin secretos en el repositorio.** La app no usa claves de terceros. Las credenciales de Cloudflare viven en `~/.cloudflared/` y `/etc/cloudflared/` del servidor, y nunca se pegan en chats ni en issues.

## Estructura

```text
neanbit-type/
├── index.html              Página única; el servidor le agrega ?v=<hash> a lo que carga
├── css/                    style, home, race, pick, stats, profile, duel y tourney
├── js/                     Módulos ES, sin build
├── img/                    Marca: mark.png y los wordmarks para fondo oscuro y claro
├── server/                 Servidor Node sin dependencias
├── deploy/                 Ejemplos de systemd, cloudflared y backup
├── package.json
└── .gitignore
```

| Archivo | Qué hace |
|---|---|
| `server/index.js` | Servidor HTTP: API, archivos estáticos con versionado, sesiones, rankings con caché de 20 segundos y migraciones de la base. |
| `server/ws.js` | WebSocket escrito a mano: handshake, tramas de texto con máscara, ping cada 25 segundos y límites de tamaño y de frecuencia. |
| `server/duels.js` | Lógica de Duelos: cola, invitaciones, cuenta regresiva, resultado y abandono. |
| `server/tournaments.js` | Torneos: tablas, acceso, llave, partidos, plazos y órdenes del panel (se revisan cada 2 segundos). |
| `server/medals.js` | Niveles, condiciones, migración, carga de íconos y render del SVG. Idéntico al del panel. |
| `server/medals-base.json` | Medallas iniciales, solo para una base nueva. |
| `server/medal-icons/` | 63 íconos SVG en los packs `base`, `variados`, `torneos` y `duelos`. |
| `server/seed.js` | Textos de ejemplo, por categoría, para una base vacía. |
| `js/main.js` | Punto de entrada: une los módulos y maneja la carrera, el selector de textos y los ajustes. |
| `js/engine.js` | Motor de tipeo. |
| `js/home.js` | Inicio: resumen personal, texto del día, modos y rankings. |
| `js/duel.js` | Sala y carrera de Duelos. |
| `js/tourney.js` | Lista de torneos, inscripción, llave y aviso de partido. |
| `js/stats.js` | Estadísticas (General, Duelos y Torneos). |
| `js/profile.js`, `editor.js`, `vitrina.js`, `crop.js`, `avatar.js` | Perfil, edición, vitrina de medallas y recorte de foto. |
| `js/account.js`, `api.js`, `store.js`, `site.js`, `ui.js` | Cuentas, cliente de la API, almacenamiento local (prefijo `nt_`), botón Info y datos del sitio, e íconos SVG con utilidades de interfaz. |

El perfil (`css/profile.css`, `js/editor.js`, `js/vitrina.js`, `js/profile.js`, `js/ui.js`, `js/crop.js` y sus secciones en `index.html`) es una zona cuidada: se modifica solo con un cambio mínimo y a propósito.

### Base de datos

SQLite en modo WAL con `busy_timeout`. Tablas: `users`, `sessions`, `races`, `errors`, `deaths`, `categories`, `texts`, `announcements`, `settings`, `medals`, `user_medals`, `duels`, `tournaments`, `tournament_players`, `tournament_matches` y `tournament_orders`. La columna `races.duel` vale `0` en una carrera normal y el id del duelo en una de duelo.

## API

| Grupo | Rutas |
|---|---|
| Cuenta | `GET /api/me`, `POST /api/register`, `POST /api/login`, `POST /api/logout`, `/api/profile`, `/api/avatar` |
| Textos y configuración | `/api/texts`, `/api/config` |
| Carreras | `POST /api/races`, `/api/deaths`, `/api/best` |
| Usuarios | `/api/users`, `/api/users/:handle` (incluye `duels`), `/api/users/:handle/races` |
| Inicio y rankings | `/api/home`, `/api/races/top`, `/api/ranking`, `/api/ranking/average`, `/api/ranking/duels`, `/api/ranking/tourneys` |
| Estadísticas | `/api/stats` y `/api/stats?mode=duel` |
| Torneos | `GET /api/tournaments`, `GET /api/tournaments/:id`, `POST /api/tournaments/:id/join`, `POST /api/tournaments/:id/leave` |
| Tiempo real | WebSocket en `/ws` (Duelos y partidos de torneo) |

Los rankings tienen una caché de 20 segundos que se invalida al guardar una carrera o un duelo.

## Solución de problemas

| Síntoma | Causa y solución |
|---|---|
| El servidor no arranca y menciona `node:sqlite` | La versión de Node es anterior a 22.13. Revisar con `node -v` y reinstalar con NodeSource (paso 2 del despliegue). |
| Al arrancar aparece `ExperimentalWarning: SQLite is an experimental feature` | Es normal. No es un error. |
| Se actualizó un archivo y la página sigue igual | Falta reiniciar el servicio: el hash `?v=` se calcula al arrancar. `sudo systemctl restart neanbit-type`. |
| Una ventana del navegador ejecuta archivos `.js` viejos | Con el versionado `?v=` no debería pasar. Probar en una ventana de incógnito y en `http://localhost:3000`, y revisar en F12, pestaña Network, las cabeceras `cf-cache-status`, `age` y `cache-control` del archivo. |
| `cloudflared service install` dice "already installed" | El VPS ya tiene un túnel. No desinstalar: copiar `config.yml` a `config.yml.bak`, agregar el `hostname` al `ingress` existente y reiniciar el servicio (paso 9). |
| Se pisó `/etc/cloudflared/config.yml` | Se escribió sin comprobar si ya existía. Antes de escribir un archivo compartido, correr `ls -la /etc/cloudflared/` y hacer siempre copia `.bak`. |
| `type.neanbit.com` responde 530 o 1033 | El túnel todavía se está registrando. Esperar un minuto y repetir. Revisar con `systemctl is-active cloudflared`. |
| `sudo ss` muestra `*:3000` | Es lo esperado: el servidor escucha en todas las interfaces y lo protege `ufw`. Comprobar con `sudo ufw status verbose`. |
| Un bloque de comandos con `sudo` sale desordenado al pegarlo | La contraseña se mezcló con las líneas siguientes. Correr `sudo -v` solo, poner la contraseña y después pegar el bloque. |
| `grep ':4000'` muestra un puerto que no es el del panel | También coincide con `:40000`. Usar el espacio final: `grep ':4000 '`. |
| El panel escucha en `*:4000` | Algo está mal: debe escuchar solo en `127.0.0.1`. Revisar `server/index.js` del panel y no publicar ese puerto. |
| La sección Torneos del panel avisa que faltan tablas | Las crea la app al arrancar. Actualizar y reiniciar la app antes de usar el panel. |
| Una acción del panel queda "en cola" en Torneos | La app está apagada: las órdenes se aplican cuando arranca. Se pueden descartar desde la misma pantalla. |
| Un jugador no recibe el aviso "Estoy listo" | La conexión vive en la pantalla del torneo. Si el jugador salió al inicio, no llega el aviso: tiene que volver a abrir el torneo. |
| No se puede borrar un usuario desde el panel | Está activo en un torneo en inscripción o en curso. Quitarlo o descalificarlo primero. |
| Una medalla no deja elegir un ícono | Cada ícono lo puede usar una sola medalla; el panel indica quién lo tiene. |
| Un ícono nuevo no aparece | Hay que soltar el SVG en `server/medal-icons/<pack>/` de la app **y** del panel, y reiniciar los dos servicios. |
| `git commit` pide nombre y correo | Configurarlos con `git config --global user.name "..."` y `git config --global user.email "..."`. |
| Falta `unzip` o `sqlite3` | `sudo apt-get install -y unzip` o `sudo apt-get install -y sqlite3`. |

## Hoja de ruta

- **Torneos, etapa 5:** los torneos ya se juegan, pero falta que «torneos ganados» de las medallas se cuente solo, usar medallas ocultas como pase de acceso y mostrar un resumen de torneos en el perfil (esto último toca el perfil y se hace con cuidado).
- **Licencia:** el repositorio es público pero todavía no tiene una definida.
- **Endurecimiento:** que la app escuche solo en `127.0.0.1` (hoy escucha en `*:3000` y lo protege `ufw`) y backups fuera del VPS, por ejemplo en R2.
- **Rendimiento:** una prueba de carga con números reales. Puntos a vigilar: `node:sqlite` es síncrono, las fotos de perfil están en base64 dentro de `users` y algunas consultas hacen `select *`. SQLite en un solo VPS alcanza para un círculo de usuarios; con más de un servidor habría que migrar a PostgreSQL.
- **Panel:** ordenar textos dentro de una categoría, restablecer claves (compartiendo el hash scrypt con la app), suspender usuarios, título e ícono propios en el mantenimiento, registro de acciones del administrador, importación y exportación de textos por CSV, y un repositorio privado para el panel.

<div align="center">

<picture>
  <source media="(prefers-color-scheme: light)" srcset="https://cdn.neanbit.com/neanbit-n-transparent-onlight.svg">
  <img src="https://cdn.neanbit.com/neanbit-n-transparente.svg" alt="neanbit" width="44">
</picture>

Hecho por neanbit.

</div>