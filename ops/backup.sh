#!/bin/bash
set -euo pipefail
umask 077
cd /opt/burnhero/ops
exec 9>/run/lock/burnhero-backup.lock
flock -n 9
backup=/var/backups/burnhero
install -d -m 700 "$backup"
work=$(mktemp -d "$backup/.partial.XXXXXXXX")
dc=(docker compose -f compose.yml)
# Stop the only application writer across the dump and photo snapshot.
trap '"${dc[@]}" start api >/dev/null; rm -rf -- "$work"' EXIT
"${dc[@]}" stop api
"${dc[@]}" exec -T db pg_dump -U burnhero -Fc burnhero >"$work/db.dump"
"${dc[@]}" run --rm -T --no-deps --entrypoint tar api -C /data/images -cf - . >"$work/images.tar"
"${dc[@]}" start api
(cd "$work" && sha256sum db.dump images.tar >SHA256SUMS)
"${dc[@]}" exec -T db pg_restore -l <"$work/db.dump" >/dev/null
tar tf "$work/images.tar" >/dev/null
mv "$work" "$backup/$(date -u +%Y%m%dT%H%M%SZ)"
find "$backup" -mindepth 1 -maxdepth 1 -type d -name '20??????T??????Z' -mmin +10080 -exec rm -rf -- {} +
