#!/usr/bin/env bash
# Falla si la imagen mcr.microsoft.com/playwright:v<versión>-noble no existe en el registry.
set -euo pipefail
version=$(bash "$(dirname "$0")/playwright-lockfile-version.sh")
image="mcr.microsoft.com/playwright:v${version}-noble"
if ! command -v docker >/dev/null 2>&1; then
  echo "docker no disponible; no se puede comprobar $image" >&2
  exit 1
fi
echo "Comprobando manifest de $image"
if ! docker manifest inspect "$image" >/dev/null; then
  echo "La imagen $image no existe o no es accesible." >&2
  echo "Actualiza @playwright/test solo a una versión con tag -noble publicado." >&2
  exit 1
fi
echo "OK: $image"
