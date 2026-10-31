#!/usr/bin/env bash
# Limpia despliegues preview de Cloudflare Pages vía API REST.
# Variables requeridas: CF_ACCOUNT_ID, CF_API_TOKEN, CLEANUP_MODE
# Modos: pr-closed | sweep | purge-all-previews

set -euo pipefail

CF_API_BASE="https://api.cloudflare.com/client/v4"
PROJECT="${CF_PAGES_PROJECT:-proto-lab}"
PRODUCTION_BRANCH="${PRODUCTION_BRANCH:-main}"
MODE="${CLEANUP_MODE:?CLEANUP_MODE requerido}"
DRY_RUN="${DRY_RUN:-false}"
MAX_AGE_DAYS="${MAX_AGE_DAYS:-14}"
TARGET_BRANCH="${TARGET_BRANCH:-}"

if [ -z "${CF_ACCOUNT_ID:-}" ] || [ -z "${CF_API_TOKEN:-}" ]; then
  echo "::notice::Faltan secretos CLOUDFLARE_ACCOUNT_ID o CLOUDFLARE_API_TOKEN. No se borra nada."
  exit 0
fi

auth_header="Authorization: Bearer ${CF_API_TOKEN}"

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
  local detail
  detail=$(cf_api_error_detail "${body_file}")
  if [ -z "${detail}" ]; then
    if jq -e . "${body_file}" >/dev/null 2>&1; then
      detail="sin mensaje de error en el cuerpo JSON"
    else
      detail="cuerpo no JSON (¿HTML o respuesta truncada?)"
    fi
  fi
  echo "::error::Cloudflare API (${context}): HTTP ${http_code} — ${detail}"
  exit 1
}

api_get_to_file() {
  local url="$1"
  local out_file="$2"
  local context="$3"
  local http_code
  http_code=$(curl --silent --show-error --location --max-time 120 \
    --write-out '%{http_code}' \
    --header "${auth_header}" \
    --header 'Accept: application/json' \
    --output "${out_file}" \
    "${url}") || {
    echo "::error::Petición GET fallida (red) — ${context}."
    exit 1
  }
  if [ "${http_code}" -lt 200 ] || [ "${http_code}" -ge 300 ]; then
    cf_fail_api "${http_code}" "${out_file}" "${context}"
  fi
}

api_delete_deployment() {
  local deployment_id="$1"
  local encoded_project url out_file http_code detail
  encoded_project=$(jq -rn --arg p "${PROJECT}" '$p|@uri')
  url="${CF_API_BASE}/accounts/${CF_ACCOUNT_ID}/pages/projects/${encoded_project}/deployments/${deployment_id}?force=true"
  if [ "${DRY_RUN}" = "true" ]; then
    return 0
  fi
  out_file=$(mktemp)
  http_code=$(curl --silent --show-error --location --max-time 60 \
    --request DELETE \
    --write-out '%{http_code}' \
    --header "${auth_header}" \
    --header 'Accept: application/json' \
    --output "${out_file}" \
    "${url}") || {
    rm -f "${out_file}"
    echo "::warning::DELETE fallido (red) para despliegue ${deployment_id}."
    return 1
  }
  if [ "${http_code}" -lt 200 ] || [ "${http_code}" -ge 300 ]; then
    detail=$(cf_api_error_detail "${out_file}")
    if [ -z "${detail}" ]; then
      detail="HTTP ${http_code}"
    else
      detail="HTTP ${http_code} — ${detail}"
    fi
    echo "::warning::DELETE despliegue ${deployment_id}: ${detail}."
    rm -f "${out_file}"
    return 1
  fi
  rm -f "${out_file}"
  return 0
}

deployment_branch() {
  jq -r '.deployment_trigger.metadata.branch // .deployment_trigger_metadata.branch // empty'
}

deployment_environment() {
  jq -r '.environment // empty'
}

merge_preview_page_into() {
  local acc_file="$1"
  local page_file="$2"
  local merged
  merged=$(mktemp)
  jq -s '.[0] + (.[1].result // [])' "${acc_file}" "${page_file}" >"${merged}"
  mv "${merged}" "${acc_file}"
}

list_preview_deployments_json() {
  local acc_file page_file encoded_project url page total_pages context
  acc_file=$(mktemp)
  echo '[]' >"${acc_file}"
  page=1
  total_pages=1
  encoded_project=$(jq -rn --arg p "${PROJECT}" '$p|@uri')
  page_file=$(mktemp)
  while [ "${page}" -le "${total_pages}" ]; do
    context="listar previews página ${page}"
    url="${CF_API_BASE}/accounts/${CF_ACCOUNT_ID}/pages/projects/${encoded_project}/deployments?env=preview&per_page=50&page=${page}"
    api_get_to_file "${url}" "${page_file}" "${context}"
    if [ "$(jq -r '.success // false' "${page_file}")" != "true" ]; then
      cf_fail_api "200" "${page_file}" "${context} (success=false)"
    fi
    merge_preview_page_into "${acc_file}" "${page_file}"
    total_pages=$(jq -r '.result_info.total_pages // 1' "${page_file}")
    page=$((page + 1))
  done
  rm -f "${page_file}"
  cat "${acc_file}"
  rm -f "${acc_file}"
}

current_production_deployment_id() {
  local encoded_project url response_file id
  encoded_project=$(jq -rn --arg p "${PROJECT}" '$p|@uri')
  url="${CF_API_BASE}/accounts/${CF_ACCOUNT_ID}/pages/projects/${encoded_project}/deployments?env=production&per_page=10&page=1"
  response_file=$(mktemp)
  api_get_to_file "${url}" "${response_file}" "listar producción"
  id=$(
    jq -r --arg branch "${PRODUCTION_BRANCH}" '
      (.result // [])
      | map(select(.environment == "production"))
      | map(select((.deployment_trigger.metadata.branch // .deployment_trigger_metadata.branch // "") == $branch))
      | map(select(.latest_stage.status == "success"))
      | sort_by(.created_on) | reverse
      | .[0].id // empty
    ' "${response_file}"
  )
  rm -f "${response_file}"
  echo "${id}"
}

load_remote_branches() {
  REMOTE_BRANCHES_FILE=$(mktemp)
  git ls-remote --heads origin 2>/dev/null | awk '{print $2}' | sed 's#refs/heads/##' | sort -u >"${REMOTE_BRANCHES_FILE}" || true
}

branch_exists_remote() {
  local branch="$1"
  grep -Fxq "${branch}" "${REMOTE_BRANCHES_FILE}" 2>/dev/null
}

load_open_pr_branches() {
  OPEN_PR_BRANCHES_FILE=$(mktemp)
  : >"${OPEN_PR_BRANCHES_FILE}"
  if [ -z "${GITHUB_REPOSITORY:-}" ] || [ -z "${GH_TOKEN:-}" ]; then
    return 0
  fi
  local page=1
  while true; do
    local response
    response=$(curl --silent --show-error --max-time 60 \
      --header "Authorization: Bearer ${GH_TOKEN}" \
      --header 'Accept: application/vnd.github+json' \
      "https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls?state=open&per_page=100&page=${page}") || break
    local count
    count=$(echo "${response}" | jq 'length')
    if [ "${count}" -eq 0 ]; then
      break
    fi
    echo "${response}" | jq -r '.[].head.ref' >>"${OPEN_PR_BRANCHES_FILE}"
    if [ "${count}" -lt 100 ]; then
      break
    fi
    page=$((page + 1))
  done
  sort -u -o "${OPEN_PR_BRANCHES_FILE}" "${OPEN_PR_BRANCHES_FILE}" 2>/dev/null || true
}

open_pr_branch() {
  local branch="$1"
  grep -Fxq "${branch}" "${OPEN_PR_BRANCHES_FILE}" 2>/dev/null
}

deployment_age_days() {
  local created_on="$1"
  local created_ts now_ts
  created_ts=$(date -u -d "${created_on}" +%s 2>/dev/null || echo 0)
  now_ts=$(date -u +%s)
  if [ "${created_ts}" -eq 0 ]; then
    echo 99999
    return
  fi
  echo $(((now_ts - created_ts) / 86400))
}

is_protected_deployment() {
  local dep_json="$1"
  local id branch env
  id=$(echo "${dep_json}" | jq -r '.id')
  branch=$(echo "${dep_json}" | deployment_branch)
  env=$(echo "${dep_json}" | deployment_environment)

  if [ -n "${PROTECTED_PRODUCTION_ID:-}" ] && [ "${id}" = "${PROTECTED_PRODUCTION_ID}" ]; then
    return 0
  fi
  if [ "${env}" = "production" ]; then
    return 0
  fi
  if [ "${branch}" = "${PRODUCTION_BRANCH}" ]; then
    return 0
  fi
  return 1
}

should_delete() {
  local dep_json="$1"
  local branch created_on age

  if is_protected_deployment "${dep_json}"; then
    return 1
  fi

  branch=$(echo "${dep_json}" | deployment_branch)
  created_on=$(echo "${dep_json}" | jq -r '.created_on // empty')

  case "${MODE}" in
    pr-closed)
      if [ -z "${TARGET_BRANCH}" ]; then
        echo "::error::TARGET_BRANCH vacío en modo pr-closed."
        exit 1
      fi
      [ "${branch}" = "${TARGET_BRANCH}" ]
      ;;
    sweep)
      age=$(deployment_age_days "${created_on}")
      if ! branch_exists_remote "${branch}"; then
        return 0
      fi
      [ "${age}" -gt "${MAX_AGE_DAYS}" ]
      ;;
    purge-all-previews)
      if open_pr_branch "${branch}"; then
        return 1
      fi
      return 0
      ;;
    *)
      echo "::error::Modo desconocido: ${MODE}"
      exit 1
      ;;
  esac
}

log_action() {
  local action="$1"
  local dep_json="$2"
  local reason="$3"
  local short branch created aliases
  short=$(echo "${dep_json}" | jq -r '.short_id // .id')
  branch=$(echo "${dep_json}" | deployment_branch)
  created=$(echo "${dep_json}" | jq -r '.created_on // "?"')
  aliases=$(echo "${dep_json}" | jq -r '(.aliases // []) | join(", ")')
  echo "${action} | id=${short} branch=${branch} created=${created} aliases=${aliases} | ${reason}"
}

main() {
  echo "Modo=${MODE} dry_run=${DRY_RUN} proyecto=${PROJECT} max_age_days=${MAX_AGE_DAYS}"
  if [ "${MODE}" = "pr-closed" ]; then
    echo "Rama objetivo (PR cerrada): ${TARGET_BRANCH}"
  fi

  PROTECTED_PRODUCTION_ID=$(current_production_deployment_id)
  if [ -n "${PROTECTED_PRODUCTION_ID}" ]; then
    echo "Despliegue de producción actual protegido: ${PROTECTED_PRODUCTION_ID}"
  else
    echo "::notice::No se identificó despliegue de producción actual; solo se aplican reglas por environment/rama."
  fi

  if [ "${MODE}" = "sweep" ] || [ "${MODE}" = "purge-all-previews" ]; then
    load_remote_branches
    load_open_pr_branches
    open_count=$(wc -l <"${OPEN_PR_BRANCHES_FILE}" | tr -d ' ')
    remote_count=$(wc -l <"${REMOTE_BRANCHES_FILE}" | tr -d ' ')
    echo "Ramas remotas: ${remote_count}; ramas con PR abierta: ${open_count}"
  fi

  deployments=$(list_preview_deployments_json)
  total=$(echo "${deployments}" | jq 'length')
  echo "Previews listados: ${total}"

  deleted=0
  skipped=0
  failed=0
  pending=0

  while IFS= read -r dep; do
    [ -z "${dep}" ] && continue
    if should_delete "${dep}"; then
      pending=$((pending + 1))
      reason="modo ${MODE}"
      if [ "${MODE}" = "sweep" ]; then
        branch=$(echo "${dep}" | deployment_branch)
        created_on=$(echo "${dep}" | jq -r '.created_on // empty')
        age=$(deployment_age_days "${created_on}")
        if ! branch_exists_remote "${branch}"; then
          reason="rama ausente en origin"
        else
          reason="antigüedad ${age} días (> ${MAX_AGE_DAYS})"
        fi
      elif [ "${MODE}" = "purge-all-previews" ]; then
        reason="sin PR abierta en la rama"
      elif [ "${MODE}" = "pr-closed" ]; then
        reason="PR cerrada"
      fi
      if [ "${DRY_RUN}" = "true" ]; then
        log_action "DRY-RUN borraría" "${dep}" "${reason}"
      else
        log_action "Borrando" "${dep}" "${reason}"
        if api_delete_deployment "$(echo "${dep}" | jq -r '.id')"; then
          deleted=$((deleted + 1))
        else
          failed=$((failed + 1))
        fi
      fi
    else
      skipped=$((skipped + 1))
    fi
  done < <(echo "${deployments}" | jq -c '.[]')

  if [ "${DRY_RUN}" = "true" ]; then
    echo "Resumen dry-run: borraría=${pending} omitidos=${skipped} (total previews=${total})"
  else
    echo "Resumen: borrados=${deleted} omitidos=${skipped} fallos=${failed}"
  fi

  if [ "${failed}" -gt 0 ]; then
    exit 1
  fi
}

main "$@"
