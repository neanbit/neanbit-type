# Seguridad de neanbit type

## ¿Es seguro tener localhost:3000 y localhost:4000?
Sí, **siempre que escuchen solo en 127.0.0.1** (desde esta versión es así por defecto: la app usa `HOST=127.0.0.1` y el panel está fijo a 127.0.0.1).
`localhost` significa "esta misma máquina": desde internet nadie llega a esos puertos. El público entra por Cloudflare Tunnel (`cloudflared`), que se conecta desde adentro hacia afuera y abre el puerto 3000 localmente.
Lo que sí hay que cuidar:
- Que `ss -ltn` muestre `127.0.0.1:3000` y `127.0.0.1:4000`, nunca `0.0.0.0` ni `*` (lo chequea `scripts/audit-seguridad.sh`).
- El panel (4000) **no tiene login**: lo protege el token (`admin.token`, permisos 600) más el chequeo de Host/Origin. Cualquier programa corriendo en el VPS con permiso de leer ese archivo puede usarlo, así que no corras en el VPS cosas que no sean tuyas bajo el usuario neanbit.
- Para usar el panel desde tu PC: túnel SSH (`ssh -L 4000:127.0.0.1:4000 vps`) y abrí `http://localhost:4000/?k=TOKEN` una vez (`cat ruta/admin.token`). El token se guarda en esa pestaña.
- No publiques el panel por Cloudflare Tunnel.

## Qué se endureció
| Tema | Antes | Ahora |
|---|---|---|
| Puerto | escuchaba en todas las interfaces | solo 127.0.0.1 |
| IP del cliente | confiaba en cualquier cabecera | `cf-connecting-ip` solo si el pedido viene del túnel (loopback) |
| Login | sin límite | 5 fallos/15 min por IP+usuario, 30 por usuario; 429 con Retry-After |
| Registro | sin límite | 10 intentos/min y 5 cuentas/hora por IP |
| API general / por usuario | sin límite | límites por IP y por usuario |
| CSRF | solo cookie SameSite | además se verifica Origin / Sec-Fetch-Site |
| Cabeceras | mínimas | CSP, HSTS, nosniff, frame-ancestors none, no-store en la API |
| Contraseñas | mínimo corto | 8–200 caracteres, distinta del usuario; scrypt con hash señuelo (sin diferencia de tiempos) |
| IDs de usuario | se reutilizaban al borrar | contador `user_seq`, no se reutilizan nunca |
| WebSocket | un error tumbaba la conexión | try/catch por mensaje |
| Panel | solo Host/Origin | token obligatorio, CSP, cabeceras, timeouts |
| Borrado | quedaba en el archivo | `secure_delete` + checkpoint del WAL; se limpian filas de torneos |
| Copias previas | rotación por nombre (se apilaban) | últimas 20, máx. 30 días y 2000 MB (`NTA_PRE_DAYS`, `NTA_PRE_MAX_MB`), por fecha |
| Copias diarias | rotación manual | `scripts/backup.sh` rota por fecha (14 días) |

## Límites conocidos (decisiones, no olvidos)
- Los contadores de rate limit viven en memoria: se reinician al reiniciar el servicio. El bloqueo de login también puede frenar por unos minutos a la víctima de un ataque a su cuenta (máx. 15 min).
- La CSP bloquea el script inline de "JavaScript Detections" de Cloudflare. Si lo ves en la consola: desactivalo en Cloudflare (Security → Settings) o arrancá con `NT_CSP=report`.
- Las copias de seguridad **conservan lo borrado** hasta que rotan (previas: hasta 20 o 30 días; diarias: 14 días). Borrar de verdad un dato = borrarlo en la app/panel y luego borrar las copias (panel → Resumen → "Borrar copias previas"; las diarias, `rm` manual).
- Las CPM de las carreras las informa el navegador: no hay forma de impedir del todo que alguien envíe marcas falsas; el panel permite anular carreras.
- `MemoryDenyWriteExecute` no se puede usar en systemd con Node (JIT).

## Compactar la base una vez
`secure_delete` pisa con ceros lo que se borra desde ahora. Lo que se borró antes puede seguir en espacio libre del archivo. Una sola vez:
```
sudo systemctl stop neanbit-type neanbit-type-admin
sudo -u neanbit node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.env.NT_DB);d.exec('pragma secure_delete=on');d.exec('vacuum');d.exec('pragma wal_checkpoint(truncate)')"
sudo systemctl start neanbit-type neanbit-type-admin
```
(con `export NT_DB=/home/neanbit/neanbit-type-data/data.db`). Hacé una copia antes.

## Lista fuera del código
- **SSH**: `PasswordAuthentication no`, `PermitRootLogin no`, solo claves. `sudo ufw default deny incoming; sudo ufw allow OpenSSH; sudo ufw enable`. Con el túnel no hace falta abrir 80/443.
- **Cloudflare**: SSL/TLS en Full (strict), "Always use HTTPS", HSTS, Bot Fight Mode; regla de rate limit en `/api/login` y `/api/register` como segunda capa.
- **Sistema**: `unattended-upgrades` activado; `fail2ban` para SSH opcional.
- **Backups**: copiá `neanbit-type-backups` fuera del VPS (rclone/scp) con cifrado; un backup en el mismo disco no sirve si se pierde el VPS.
- **Secretos**: nunca subas `data.db`, `admin.token` ni copias a Git (`.gitignore`).

## Servicio systemd endurecido (ejemplo)
```
[Service]
User=neanbit
Environment=HOST=127.0.0.1 NT_DB=/home/neanbit/neanbit-type-data/data.db
ExecStart=/usr/bin/node server/index.js
WorkingDirectory=/home/neanbit/neanbit-type
Restart=on-failure
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/neanbit/neanbit-type-data /home/neanbit/neanbit-type-backups
ProtectKernelTunables=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
CapabilityBoundingSet=
```
Mismo esquema para el panel (con `NTA_BACKUPS` y `ReadWritePaths` de los mismos directorios).
