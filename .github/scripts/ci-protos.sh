#!/usr/bin/env bash
# Typecheck, tests y build de las aplicaciones listadas en PROTOS (separadas por comas).
set -euo pipefail

if [[ -z "${PROTOS:-}" ]]; then
  echo "PROTOS vacío" >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

if [[ "${CI_PROTOS_DRY:-}" != "1" ]]; then
  pnpm generate
fi

IFS=',' read -ra slugs <<< "$PROTOS"
for slug in "${slugs[@]}"; do
  if [[ ! "$slug" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
    echo "Slug no válido: ${slug}" >&2
    exit 1
  fi
  dir="protos/${slug}"
  if [[ ! -d "$dir" || ! -f "${dir}/package.json" ]]; then
    if [[ -f "${dir}/proto.json" && ! -f "${dir}/package.json" ]]; then
      echo "export estático ${slug}"
      if [[ "${CI_PROTOS_DRY:-}" != "1" ]]; then
        node scripts/app-budget.mjs "$dir"
      fi
      continue
    fi
    echo "Sin paquete protos/${slug}; el catálogo cubre el alta y la baja."
    continue
  fi
  if [[ "${CI_PROTOS_DRY:-}" == "1" ]]; then
    echo "typecheck ${slug}"
    echo "test ${slug}"
    echo "build ${slug}"
    continue
  fi
  pnpm --filter "./protos/${slug}" typecheck
  pnpm exec vitest run "protos/${slug}" --passWithNoTests
  pnpm --filter "./protos/${slug}" build
  node scripts/app-budget.mjs "${dir}/dist"
done
