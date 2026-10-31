#!/usr/bin/env bash
# Utilidades compartidas para la API de Cloudflare Pages (listado/borrado).
# Pensado para ser source'd desde cleanup-pages-previews.sh y tests.

: "${CF_PAGES_LIST_PER_PAGE:=25}"

cf_api_error_detail() {
  local body_file="$1"
  jq -r '
    if type == "object" then
      ([.errors[]? | "\(.code // "?"): \(.message // "sin mensaje")"] + [.messages[]?.message // empty])
      | map(select(. != null and . != ""))
      | unique
      | join("; ")
    else
      empty
    end
  ' "${body_file}" 2>/dev/null || true
}

cf_fail_api() {
  local http_code="$1"
  local body_file="$2"
  local context="$3"
  local detail=""
  if [ -f "${body_file}" ]; then
    detail=$(cf_api_error_detail "${body_file}")
    if [ -z "${detail}" ]; then
      if jq -e 'type == "object"' "${body_file}" >/dev/null 2>&1; then
        detail="sin mensaje de error en el cuerpo JSON"
      else
        detail="cuerpo no JSON (¿HTML o respuesta truncada?)"
      fi
    fi
  else
    detail="sin cuerpo de respuesta"
  fi
  echo "::error::Paso «${context}»: Cloudflare API HTTP ${http_code} — ${detail}" >&2
  exit 1
}

cf_fail_jq() {
  local context="$1"
  local err_file="$2"
  local jq_msg=""
  if [ -s "${err_file}" ]; then
    jq_msg=$(head -n 3 "${err_file}" | tr '\n' ' ')
  else
    jq_msg="error desconocido"
  fi
  echo "::error::Paso «${context}»: jq — ${jq_msg}" >&2
  exit 1
}

cf_assert_list_page() {
  local page_file="$1"
  local context="$2"
  local http_code="${3:-200}"
  local err_file success

  if [ ! -s "${page_file}" ]; then
    echo "::error::Paso «${context}»: respuesta vacía (HTTP ${http_code})" >&2
    exit 1
  fi

  err_file=$(mktemp)
  if ! jq -e 'type == "object"' "${page_file}" >/dev/null 2>"${err_file}"; then
    cf_fail_jq "${context} (JSON inválido)" "${err_file}"
  fi

  success=$(jq -r '.success // false' "${page_file}" 2>"${err_file}") || cf_fail_jq "${context} (campo success)" "${err_file}"
  rm -f "${err_file}"

  if [ "${success}" != "true" ]; then
    cf_fail_api "${http_code}" "${page_file}" "${context}"
  fi
}

cf_merge_list_page_into() {
  local acc_file="$1"
  local page_file="$2"
  local context="$3"
  local merged err_file

  merged=$(mktemp)
  err_file=$(mktemp)
  if ! jq -s '.[0] + (.[1].result // [])' "${acc_file}" "${page_file}" >"${merged}" 2>"${err_file}"; then
    cf_fail_jq "${context} (fusionar result)" "${err_file}"
  fi
  rm -f "${err_file}"
  mv "${merged}" "${acc_file}"
}

cf_read_total_pages() {
  local page_file="$1"
  local context="$2"
  local err_file total

  err_file=$(mktemp)
  total=$(jq -r '.result_info.total_pages // 1' "${page_file}" 2>"${err_file}") || cf_fail_jq "${context} (result_info.total_pages)" "${err_file}"
  rm -f "${err_file}"

  if ! [[ "${total}" =~ ^[0-9]+$ ]] || [ "${total}" -lt 1 ]; then
    total=1
  fi
  echo "${total}"
}

cf_build_deployments_list_url() {
  local api_base="$1"
  local account_id="$2"
  local encoded_project="$3"
  local environment="$4"
  local page="$5"
  local per_page="${6:-${CF_PAGES_LIST_PER_PAGE}}"
  printf '%s/accounts/%s/pages/projects/%s/deployments?env=%s&per_page=%s&page=%s' \
    "${api_base}" "${account_id}" "${encoded_project}" "${environment}" "${per_page}" "${page}"
}
