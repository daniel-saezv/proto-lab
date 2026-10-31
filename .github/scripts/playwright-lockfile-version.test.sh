#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
version=$(bash "${root}/playwright-lockfile-version.sh" "${root}/../../pnpm-lock.yaml")
test "${version}" = "1.64.1"
echo "playwright-lockfile-version OK (${version})"
