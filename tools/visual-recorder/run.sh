#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
APPIUM_PID=""

cleanup() {
    if [[ -n "${APPIUM_PID}" ]] && kill -0 "${APPIUM_PID}" 2>/dev/null; then
        echo "Cerrando Appium (${APPIUM_PID})..."
        kill "${APPIUM_PID}" 2>/dev/null || true
    fi
}

trap cleanup EXIT INT TERM

if [[ ! -f "${FRAMEWORK_ROOT}/package.json" ]] ||
   [[ ! -d "${FRAMEWORK_ROOT}/features/yape-features" ]]; then
    echo "No se pudo localizar fwk-mobile-test en ${FRAMEWORK_ROOT}" >&2
    exit 1
fi

if [[ ! -x "${SCRIPT_DIR}/node_modules/.bin/electron" ]]; then
    echo "Faltan las dependencias del recorder." >&2
    echo "Ejecuta: cd \"${SCRIPT_DIR}\" && npm install" >&2
    exit 1
fi

if lsof -ti :4723 >/dev/null 2>&1; then
    echo "El puerto 4723 ya está ocupado. Cierra la sesión Appium existente." >&2
    exit 1
fi

export FWK_MOBILE_ROOT="${FRAMEWORK_ROOT}"
cd "${SCRIPT_DIR}"

APPIUM_CACHE_DIR="${FRAMEWORK_ROOT}/node_modules/.cache/appium"
APPIUM_EXTENSIONS="${APPIUM_CACHE_DIR}/extensions.yaml"
APPIUM_PACKAGE_HASH="${APPIUM_CACHE_DIR}/package.hash"

# Appium guarda rutas absolutas de los drivers instalados. Si el repositorio fue
# movido o copiado, el manifiesto puede seguir apuntando al workspace anterior y
# cargar dependencias incompatibles.
if [[ -f "${APPIUM_EXTENSIONS}" ]] &&
   ! node -e '
       const fs = require("fs");
       const yaml = require("yaml");
       const manifest = yaml.parse(fs.readFileSync(process.argv[1], "utf8"));
       const expected = process.argv[2] + "/node_modules/";
       const extensions = [
           ...Object.values(manifest.drivers || {}),
           ...Object.values(manifest.plugins || {})
       ];
       process.exit(
           extensions.length > 0 &&
           extensions.every(extension =>
               typeof extension.installPath === "string" &&
               extension.installPath.startsWith(expected)
           ) ? 0 : 1
       );
   ' "${APPIUM_EXTENSIONS}" "${FRAMEWORK_ROOT}"; then
    echo "Regenerando caché de drivers Appium con rutas del framework actual..."
    rm -f "${APPIUM_EXTENSIONS}" "${APPIUM_PACKAGE_HASH}"
fi

echo "Framework: ${FWK_MOBILE_ROOT}"
echo "Iniciando Appium..."

if [[ -x "${FRAMEWORK_ROOT}/node_modules/.bin/appium" ]]; then
    "${FRAMEWORK_ROOT}/node_modules/.bin/appium" \
        --port 4723 --log-level error --relaxed-security &
else
    appium --port 4723 --log-level error --relaxed-security &
fi
APPIUM_PID=$!

echo "Compilando e iniciando el recorder..."
npm run build
"${SCRIPT_DIR}/node_modules/.bin/electron" .
