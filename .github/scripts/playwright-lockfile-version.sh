#!/usr/bin/env bash
# Imprime la versión exacta de @playwright/test en pnpm-lock.yaml (una línea, semver).
set -euo pipefail
lockfile="${1:-pnpm-lock.yaml}"
version=$(
  grep -E "^  '@playwright/test@" "$lockfile" | head -1 |
    sed -E "s/^  '@playwright\\/test@([0-9.]+)':/\1/"
)
if [[ -z "$version" ]]; then
  echo "No se encontró @playwright/test en $lockfile" >&2
  exit 1
fi
echo "$version"
