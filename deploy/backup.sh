#!/bin/bash
# Copia diaria de la base de neanbit type (requiere sqlite3).
# Copiar a ~/neanbit-type-data/backup.sh, dar permiso con chmod +x y programar en cron:
#   30 4 * * * /home/USUARIO/neanbit-type-data/backup.sh
DB="${NT_DB:-$HOME/neanbit-type-data/data.db}"
OUT="${NT_BACKUPS:-$HOME/neanbit-type-backups}"
DIAS=14

mkdir -p "$OUT"
sqlite3 "$DB" ".backup '$OUT/data-$(date +%F).db'"
find "$OUT" -name 'data-*.db' -mtime +"$DIAS" -delete
