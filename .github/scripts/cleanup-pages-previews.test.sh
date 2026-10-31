#!/usr/bin/env bash
# Prueba local del merge paginado de previews (formato API Cloudflare Pages).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fixture="${root}/fixtures/pages-preview-list-page.json"

acc=$(mktemp)
trap 'rm -f "${acc}"' EXIT
echo '[]' >"${acc}"

jq -s '.[0] + (.[1].result // [])' "${acc}" "${fixture}" >"${acc}.next"
mv "${acc}.next" "${acc}"

count=$(jq 'length' "${acc}")
test "${count}" -eq 2

branch=$(jq -r '.[0].deployment_trigger.metadata.branch' "${acc}")
test "${branch}" = "cursor/ci-e2e-cache-aa3d"

echo "cleanup-pages-previews merge OK (${count} despliegues)"
