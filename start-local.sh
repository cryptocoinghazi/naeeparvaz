#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_HOST="${NAEE_HOST:-127.0.0.1}"
APP_PORT="${NAEE_PORT:-4321}"
TEMP_NODE_BIN="/tmp/naee-node-runtime/node_modules/node/bin/node"

node_is_supported() {
  "$1" -e '
    const [major, minor, patch] = process.versions.node.split(".").map(Number);
    const supported = major === 22 && (minor > 12 || (minor === 12 && patch >= 0));
    process.exit(supported ? 0 : 1);
  ' >/dev/null 2>&1
}

select_node() {
  if [[ -n "${NAEE_NODE_BIN:-}" ]] && [[ -x "${NAEE_NODE_BIN}" ]] && node_is_supported "${NAEE_NODE_BIN}"; then
    printf '%s\n' "${NAEE_NODE_BIN}"
    return
  fi

  if command -v node >/dev/null 2>&1; then
    local system_node
    system_node="$(command -v node)"
    if node_is_supported "${system_node}"; then
      printf '%s\n' "${system_node}"
      return
    fi
  fi

  if [[ -x "${TEMP_NODE_BIN}" ]] && node_is_supported "${TEMP_NODE_BIN}"; then
    printf '%s\n' "${TEMP_NODE_BIN}"
    return
  fi

  return 1
}

if ! NODE_BIN="$(select_node)"; then
  printf '%s\n' "Naee Parvaz requires Node.js 22.12.0 or newer within the Node 22 release line."
  printf '%s\n' "Install the current Node 22 LTS release, open a new terminal, and run this script again."
  printf '%s\n' "If using nvm: nvm install 22 && nvm use 22"
  exit 1
fi

cd "${PROJECT_DIR}"

if [[ ! -f "node_modules/astro/bin/astro.mjs" ]]; then
  if ! command -v npm >/dev/null 2>&1; then
    printf '%s\n' "npm is required to install the project dependencies."
    exit 1
  fi
  NPM_CLI="$(readlink -f "$(command -v npm)")"
  printf '%s\n' "Installing project dependencies..."
  "${NODE_BIN}" "${NPM_CLI}" install
fi

"${NODE_BIN}" "${PROJECT_DIR}/scripts/bootstrap-local.mjs"

USES_LOCAL_DATABASE="$("${NODE_BIN}" --env-file=.env -e '
  const value = process.env.DATABASE_URL;
  if (!value) process.exit(2);
  const url = new URL(value);
  process.stdout.write(["localhost", "127.0.0.1"].includes(url.hostname) ? "yes" : "no");
')" || {
  printf '%s\n' "DATABASE_URL is missing or invalid in .env."
  exit 1
}

if [[ "${USES_LOCAL_DATABASE}" == "yes" ]]; then
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    printf '%s\n' "Docker Compose is required for the default local PostgreSQL database."
    printf '%s\n' "Install Docker, or replace DATABASE_URL in .env with an accessible PostgreSQL URL."
    exit 1
  fi
  printf '%s\n' "Starting local PostgreSQL..."
  docker compose up -d database
  for _attempt in {1..30}; do
    if docker compose exec -T database pg_isready -U naee -d naee_parvaz >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  if ! docker compose exec -T database pg_isready -U naee -d naee_parvaz >/dev/null 2>&1; then
    printf '%s\n' "PostgreSQL did not become ready. Run: docker compose logs database"
    exit 1
  fi
fi

printf '%s\n' "Applying PostgreSQL database migrations..."
"${NODE_BIN}" --env-file=.env "${PROJECT_DIR}/scripts/migrate.mjs"

LOCAL_CODE="$("${NODE_BIN}" --env-file=.env -e 'process.stdout.write(process.env.LOCAL_ADMIN_CODE ?? "")')"
printf '%s\n' "Starting Naee Parvaz with Node $("${NODE_BIN}" --version)"
printf '%s\n' "English website: http://${APP_HOST}:${APP_PORT}/en/"
printf '%s\n' "Hindi website:   http://${APP_HOST}:${APP_PORT}/hi/"
printf '%s\n' "Editor sign-in:  http://${APP_HOST}:${APP_PORT}/editor/"
if [[ -n "${LOCAL_CODE}" ]]; then
  printf '%s\n' "Local editor code: ${LOCAL_CODE}"
fi
printf '%s\n' "Press Ctrl+C to stop the website. PostgreSQL remains available for the next run."

exec env ASTRO_TELEMETRY_DISABLED=1 \
  "${NODE_BIN}" --env-file=.env "${PROJECT_DIR}/node_modules/astro/bin/astro.mjs" dev \
  --host "${APP_HOST}" \
  --port "${APP_PORT}" \
  "$@"
