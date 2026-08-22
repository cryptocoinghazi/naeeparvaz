#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_HOST="${NAEE_HOST:-127.0.0.1}"
APP_PORT="${NAEE_PORT:-4321}"
TEMP_NODE_BIN="/tmp/naee-node-runtime/node_modules/node/bin/node"

node_is_supported() {
  "$1" -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1);
  ' >/dev/null 2>&1
}

select_node() {
  if [[ -n "${NAEE_NODE_BIN:-}" ]] && [[ -x "${NAEE_NODE_BIN}" ]]; then
    if node_is_supported "${NAEE_NODE_BIN}"; then
      printf '%s\n' "${NAEE_NODE_BIN}"
      return
    fi
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
  printf '%s\n' "Naee Parvaz requires Node.js 22.12 or newer."
  printf '%s\n' "Install Node 22, open a new terminal, and run this script again."
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

NODE_VERSION="$("${NODE_BIN}" --version)"
printf '%s\n' "Preparing Naee Parvaz with Node ${NODE_VERSION}"
printf '%s\n' "Applying any pending local database migrations..."
"${NODE_BIN}" "${PROJECT_DIR}/node_modules/wrangler/bin/wrangler.js" \
  d1 migrations apply naee-parvaz --local

printf '%s\n' "Starting Naee Parvaz"
printf '%s\n' "English website: http://${APP_HOST}:${APP_PORT}/en/"
printf '%s\n' "Hindi website:   http://${APP_HOST}:${APP_PORT}/hi/"
printf '%s\n' "Local editor:    http://${APP_HOST}:${APP_PORT}/editor/"
printf '%s\n' "Press Ctrl+C to stop the server."

exec env ASTRO_TELEMETRY_DISABLED=1 \
  "${NODE_BIN}" "${PROJECT_DIR}/node_modules/astro/bin/astro.mjs" dev \
  --host "${APP_HOST}" \
  --port "${APP_PORT}" \
  "$@"
