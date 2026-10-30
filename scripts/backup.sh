#!/bin/bash
# Copia diaria consistente de la base (VACUUM INTO) y rotación por FECHA: conserva KEEP días (14 por defecto).
# Uso en cron (usuario neanbit):  17 4 * * * /home/neanbit/neanbit-type/scripts/backup.sh
# Variables: NT_DB (base), NT_BACKUPS (carpeta), KEEP (días)
set -euo pipefail
DB="${NT_DB:-/home/neanbit/neanbit-type-data/data.db}"
DEST="${NT_BACKUPS:-/home/neanbit/neanbit-type-backups}"
KEEP="${KEEP:-14}"
umask 077
mkdir -p "$DEST"; chmod 700 "$DEST"
OUT="$DEST/data-$(date +%Y-%m-%d-%H%M).db"
node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1]);d.exec('pragma busy_timeout=5000');d.exec(\"vacuum into '\"+process.argv[2].replace(/'/g,\"''\")+\"'\");" "$DB" "$OUT"
chmod 600 "$OUT"
find "$DEST" -maxdepth 1 -name 'data-*.db' -mtime +"$KEEP" -delete
# Nunca dejar menos de 1 copia: si el find borró todo (reloj raro), esta línea avisa.
ls "$DEST"/data-*.db >/dev/null 2>&1 || { echo "ALERTA: no hay copias diarias" >&2; exit 1; }
echo "ok $OUT ($(ls "$DEST"/data-*.db | wc -l) copias, $(du -sh "$DEST" | cut -f1) en total)"
