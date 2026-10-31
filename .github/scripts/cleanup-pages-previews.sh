#!/usr/bin/env bash
# Limpia despliegues preview de Cloudflare Pages vía API REST.
# Variables requeridas: CF_ACCOUNT_ID, CF_API_TOKEN, CLEANUP_MODE
# Modos: pr-closed | sweep | purge-all-previews

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cleanup-pages-api.sh
source "${SCRIPT_DIR}/cleanup-pages-api.sh"

CF_API_BASE="https://api.cloudflare.com/client/v4"
PROJECT="${CF_PAGES_PROJECT:-proto-lab}"
PRODUCTION_BRANCH="${PRODUCTION_BRANCH:-main}"
MODE="${CLEANUP_MODE:?CLEANUP_MODE requerido}"
DRY_RUN="${DRY_RUN:-false}"
MAX_AGE_DAYS="${MAX_AGE_DAYS:-14}"
TARGET_BRANCH="${TARGET_BRANCH:-}"
CURRENT_STEP="inicio"

on_fatal() {
  local code=$?
  echo "::error::Abortado en paso «${CURRENT_STEP}» (línea ${BASH_LINENO[0]}, código ${code})." >&2
  exit "${code}"
}
trap on_fatal ERR

if [ -z "${CF_ACCOUNT_ID:-}" ] || [ -z "${CF_API_TOKEN:-}" ]; then
  echo "::notice::Faltan secretos CLOUDFLARE_ACCOUNT_ID o CLOUDFLARE_API_TOKEN. No se borra nada."
  exit 0
fi

auth_header="Authorization: Bearer ${CF_API_TOKEN}"

api_get_to_file() {
  local url="$1"
  local out_file="$2"
  local context="$3"
  local http_code err_file

  http_code=$(curl --silent --show-error --location --max-time 120 \
    --write-out '%{http_code}' \
    --header "${auth_header}" \
    --header 'Accept: application/json' \
    --output "${out_file}" \
    "${url}") || {
    echo "::error::Paso «${context}»: petición GET fallida (red)." >&2
    exit 1
  }

  if ! [[ "${http_code}" =~ ^[0-9]{3}$ ]]; then
    echo "::error::Paso «${context}»: código HTTP no válido «${http_code}»." >&2
    exit 1
  fi

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

list_preview_deployments_to_file() {
  local out_file="$1"
  local acc_file page_file encoded_project url page total_pages context

  CURRENT_STEP="listar previews (inicializar)"
  acc_file=$(mktemp)
  echo '[]' >"${acc_file}"
  page=1
  total_pages=1
  encoded_project=$(jq -rn --arg p "${PROJECT}" '$p|@uri')
  page_file=$(mktemp)

  while [ "${page}" -le "${total_pages}" ]; do
    context="listar previews env=preview page=${page} per_page=${CF_PAGES_LIST_PER_PAGE}"
    CURRENT_STEP="${context}"
    url=$(cf_build_deployments_list_url "${CF_API_BASE}" "${CF_ACCOUNT_ID}" "${encoded_project}" "preview" "${page}")
    api_get_to_file "${url}" "${page_file}" "${context}"
    cf_assert_list_page "${page_file}" "${context}"
    cf_merge_list_page_into "${acc_file}" "${page_file}" "${context} (merge)"
    total_pages=$(cf_read_total_pages "${page_file}" "${context} (paginación)")
    page=$((page + 1))
  done

  mv "${acc_file}" "${out_file}"
  rm -f "${page_file}"
}

current_production_deployment_id() {
  local encoded_project url response_file id context err_file
  encoded_project=$(jq -rn --arg p "${PROJECT}" '$p|@uri')
  context="listar producción env=production page=1 per_page=${CF_PAGES_LIST_PER_PAGE}"
  CURRENT_STEP="${context}"
  url=$(cf_build_deployments_list_url "${CF_API_BASE}" "${CF_ACCOUNT_ID}" "${encoded_project}" "production" "1")
  response_file=$(mktemp)
  api_get_to_file "${url}" "${response_file}" "${context}"
  cf_assert_list_page "${response_file}" "${context}"
  err_file=$(mktemp)
  id=$(jq -r --arg branch "${PRODUCTION_BRANCH}" '
    (.result // [])
    | map(select(.environment == "production"))
    | map(select((.deployment_trigger.metadata.branch // .deployment_trigger_metadata.branch // "") == $branch))
    | map(select(.latest_stage.status == "success"))
    | sort_by(.created_on) | reverse
    | .[0].id // empty
  ' "${response_file}" 2>"${err_file}") || cf_fail_jq "${context} (elegir producción)" "${err_file}"
  rm -f "${err_file}" "${response_file}"
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
    local response err_file count
    err_file=$(mktemp)
    response=$(curl --silent --show-error --max-time 60 \
      --header "Authorization: Bearer ${GH_TOKEN}" \
      --header 'Accept: application/vnd.github+json' \
      "https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls?state=open&per_page=100&page=${page}") || break
    count=$(echo "${response}" | jq 'length' 2>"${err_file}") || {
      rm -f "${err_file}"
      break
    }
    rm -f "${err_file}"
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
        echo "::error::TARGET_BRANCH vacío en modo pr-closed." >&2
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
      echo "::error::Modo desconocido: ${MODE}" >&2
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
  local deployments_file total err_file

  echo "Modo=${MODE} dry_run=${DRY_RUN} proyecto=${PROJECT} max_age_days=${MAX_AGE_DAYS} per_page=${CF_PAGES_LIST_PER_PAGE}"
  if [ "${MODE}" = "pr-closed" ]; then
    echo "Rama objetivo (PR cerrada): ${TARGET_BRANCH}"
  fi

  CURRENT_STEP="identificar despliegue de producción"
  PROTECTED_PRODUCTION_ID=$(current_production_deployment_id)
  if [ -n "${PROTECTED_PRODUCTION_ID}" ]; then
    echo "Despliegue de producción actual protegido: ${PROTECTED_PRODUCTION_ID}"
  else
    echo "::notice::No se identificó despliegue de producción actual; solo se aplican reglas por environment/rama."
  fi

  if [ "${MODE}" = "sweep" ] || [ "${MODE}" = "purge-all-previews" ]; then
    CURRENT_STEP="cargar ramas remotas y PRs abiertas"
    load_remote_branches
    load_open_pr_branches
    open_count=$(wc -l <"${OPEN_PR_BRANCHES_FILE}" | tr -d ' ')
    remote_count=$(wc -l <"${REMOTE_BRANCHES_FILE}" | tr -d ' ')
    echo "Ramas remotas: ${remote_count}; ramas con PR abierta: ${open_count}"
  fi

  deployments_file=$(mktemp)
  list_preview_deployments_to_file "${deployments_file}"

  CURRENT_STEP="contar previews listados"
  err_file=$(mktemp)
  total=$(jq -r 'length' "${deployments_file}" 2>"${err_file}") || cf_fail_jq "contar previews" "${err_file}"
  rm -f "${err_file}"
  echo "Previews listados: ${total}"

  deleted=0
  skipped=0
  failed=0
  pending=0

  CURRENT_STEP="evaluar y borrar previews"
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
  done < <(jq -c '.[]' "${deployments_file}")

  rm -f "${deployments_file}"

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
