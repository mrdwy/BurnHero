#!/bin/bash
set -euo pipefail
umask 077
archive=$(realpath "${1:?pass a completed backup directory}")
(cd "$archive" && sha256sum -c SHA256SUMS)
scratch=$(mktemp -d)
container=burnhero-drill-$(openssl rand -hex 8)
trap 'docker rm -fv "$container" >/dev/null 2>&1 || true; rm -rf -- "$scratch"' EXIT
tar -xf "$archive/images.tar" -C "$scratch"
docker run --detach --network none --name "$container" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
for attempt in {1..30}; do
  docker exec "$container" pg_isready -U postgres >/dev/null && break
  sleep 1
done
docker exec -i "$container" pg_restore --exit-on-error --no-owner --no-privileges -U postgres -d postgres <"$archive/db.dump"
docker exec "$container" psql -XAt -v ON_ERROR_STOP=1 -U postgres -c 'SELECT id FROM media' >"$scratch/media-ids"
while read -r id; do test -s "$scratch/$id.webp"; done <"$scratch/media-ids"
printf 'Restore verified: %s photo references\n' "$(wc -l <"$scratch/media-ids")"
