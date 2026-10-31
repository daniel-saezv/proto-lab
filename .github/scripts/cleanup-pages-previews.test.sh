#!/usr/bin/env bash
# Pruebas locales de utilidades Pages (merge, paginación, errores API).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cleanup-pages-api.sh
source "${root}/cleanup-pages-api.sh"

page1="${root}/fixtures/pages-preview-list-page.json"
page2="${root}/fixtures/pages-preview-list-page2.json"
api_error="${root}/fixtures/pages-api-error-per-page.json"

acc=$(mktemp)
trap 'rm -f "${acc}"' EXIT
echo '[]' >"${acc}"

cf_merge_list_page_into "${acc}" "${page1}" "test merge página 1"
cf_merge_list_page_into "${acc}" "${page2}" "test merge página 2"

count=$(jq 'length' "${acc}")
test "${count}" -eq 3

total_pages=$(cf_read_total_pages "${page1}" "test paginación")
test "${total_pages}" -eq 2

url=$(cf_build_deployments_list_url "https://api.cloudflare.com/client/v4" "acc123" "proto-lab" "preview" "2")
case "${url}" in
  *"env=preview"*"per_page=25"*"page=2"*) ;;
  *)
    echo "URL inesperada: ${url}" >&2
    exit 1
    ;;
esac

detail=$(cf_api_error_detail "${api_error}")
case "${detail}" in
  *1001*per_page*) ;;
  *)
    echo "Detalle de error inesperado: ${detail}" >&2
    exit 1
    ;;
esac

set +e
err_out=$(cf_assert_list_page "${api_error}" "test error per_page" "400" 2>&1)
status=$?
set -e
test "${status}" -eq 1
case "${err_out}" in
  *"Paso «test error per_page»"*"HTTP 400"*"1001"*) ;;
  *)
    echo "Salida cf_assert_list_page inesperada: ${err_out}" >&2
    exit 1
    ;;
esac

echo "cleanup-pages-previews API helpers OK (merge paginado + errores)"
