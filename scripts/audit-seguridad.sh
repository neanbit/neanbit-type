#!/bin/bash
# Auditoría rápida, solo lectura. Uso: bash scripts/audit-seguridad.sh   (con sudo ve más cosas)
ok(){ echo "  [ok]   $*"; }; mal(){ echo "  [MAL]  $*"; }; av(){ echo "  [ojo]  $*"; }
echo "1) Puertos escuchando (3000 y 4000 deben ser 127.0.0.1)"
ss -ltnH 2>/dev/null | awk '{print $4}' | while read a; do
  p=${a##*:}; case "$p" in 3000|4000) case "$a" in 127.0.0.1:*|\[::1\]:*) ok "$a";; *) mal "$a expuesto a la red";; esac;; esac; done
echo "2) Todo lo que escucha en la red (debería ser casi solo SSH)"
ss -ltnH 2>/dev/null | awk '{print $4}' | grep -v '^127\.\|^\[::1\]' | sed 's/^/  - /'
echo "3) Firewall"
if command -v ufw >/dev/null; then sudo -n ufw status 2>/dev/null | head -3 | sed 's/^/  /' || av "ufw necesita sudo"; else av "ufw no instalado"; fi
echo "4) Archivos sensibles (deben ser 600/700)"
for f in "${NT_DB:-/home/neanbit/neanbit-type-data/data.db}" "${NTA_TOKEN_FILE:-/home/neanbit/neanbit-type-data/admin.token}"; do
  [ -e "$f" ] && { m=$(stat -c %a "$f"); [ "${m: -2}" = "00" ] && ok "$f $m" || mal "$f $m (corré: chmod 600 $f)"; } || av "no existe $f"; done
d="${NT_BACKUPS:-/home/neanbit/neanbit-type-backups}"; [ -d "$d" ] && { m=$(stat -c %a "$d"); [ "${m: -2}" = "00" ] && ok "$d $m" || mal "$d $m (chmod 700)"; }
echo "5) Copias"
[ -d "$d" ] && { echo "  diarias: $(ls "$d"/data-*.db 2>/dev/null | wc -l)  previas: $(ls "$d"/pre-*.db 2>/dev/null | wc -l)  tamaño: $(du -sh "$d" | cut -f1)"; echo "  libre en disco: $(df -h --output=avail "$d" | tail -1 | tr -d ' ')"; }
echo "6) SSH"
if [ -r /etc/ssh/sshd_config ]; then grep -Ei '^\s*(PasswordAuthentication|PermitRootLogin)' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/* 2>/dev/null | sed 's/^/  /'; echo "  (idealmente: PasswordAuthentication no, PermitRootLogin no)"; fi
echo "7) Respuesta HTTP local"
curl -sI localhost:3000/ | grep -iE 'content-security|strict-transport|x-frame|nosniff' | sed 's/^/  /'
echo "8) Servicios"
systemctl is-active neanbit-type neanbit-type-admin cloudflared 2>/dev/null | paste -sd' ' | sed 's/^/  /'
