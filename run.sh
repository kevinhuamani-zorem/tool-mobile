#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
EMBEDDED_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
RECORDER_MODE="${RECORDER_MODE:-}"
TARGET_PROJECT="${TARGET_PROJECT:-}"
APPIUM_PID=""

read_recorder_setting() {
    node -e '
        const fs = require("fs");
        const path = require("path");
        const root = process.argv[1];
        const key = process.argv[2];
        let value = "";
        try {
            const env = fs.readFileSync(path.join(root, ".env"), "utf8");
            const match = env.match(new RegExp("^(?:export\\\\s+)?" + key + "=(.*)$", "m"));
            if (match) value = match[1].trim().replace(/^([\"'\''])(.*)\\1$/, "$2");
        } catch {}
        try {
            const config = JSON.parse(fs.readFileSync(path.join(root, "config/workspace.json"), "utf8"));
            const configKey = key === "RECORDER_MODE" ? "mode" : "targetProject";
            if (!value && typeof config[configKey] === "string") value = config[configKey];
        } catch {}
        process.stdout.write(value);
    ' "${SCRIPT_DIR}" "$1"
}

if [[ -z "${RECORDER_MODE}" ]]; then
    RECORDER_MODE="$(read_recorder_setting RECORDER_MODE)"
fi
if [[ -z "${TARGET_PROJECT}" ]]; then
    TARGET_PROJECT="$(read_recorder_setting TARGET_PROJECT)"
fi

cleanup() {
    if [[ -n "${APPIUM_PID}" ]] && kill -0 "${APPIUM_PID}" 2>/dev/null; then
        echo "Cerrando Appium (${APPIUM_PID})..."
        kill "${APPIUM_PID}" 2>/dev/null || true
    fi
}

trap cleanup EXIT INT TERM

if [[ -z "${RECORDER_MODE}" ]]; then
    if [[ -d "${EMBEDDED_ROOT}/features/yape-features" ]] &&
       [[ -d "${EMBEDDED_ROOT}/screenobjects" ]]; then
        RECORDER_MODE="fwk-mobile"
    else
        RECORDER_MODE="standalone"
    fi
fi

if [[ -z "${TARGET_PROJECT}" ]]; then
    if [[ "${RECORDER_MODE}" == "fwk-mobile" ]]; then
        TARGET_PROJECT="${EMBEDDED_ROOT}"
    elif [[ "${RECORDER_MODE}" == "standalone" ]]; then
        TARGET_PROJECT="${SCRIPT_DIR}/workspace"
    else
        TARGET_PROJECT="${SCRIPT_DIR}/runtime/neutral-workspace"
    fi
fi

if [[ "${RECORDER_MODE}" == "fwk-mobile" ]] &&
   { [[ ! -f "${TARGET_PROJECT}/package.json" ]] ||
     [[ ! -d "${TARGET_PROJECT}/features/yape-features" ]]; }; then
    echo "TARGET_PROJECT no apunta a fwk-mobile: ${TARGET_PROJECT}" >&2
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

export RECORDER_MODE
export TARGET_PROJECT
if [[ "${RECORDER_MODE}" == "fwk-mobile" ]]; then
    export FWK_MOBILE_ROOT="${TARGET_PROJECT}"
fi
cd "${SCRIPT_DIR}"

APPIUM_HOME_ROOT="${SCRIPT_DIR}"
if [[ -x "${TARGET_PROJECT}/node_modules/.bin/appium" ]]; then
    APPIUM_HOME_ROOT="${TARGET_PROJECT}"
fi
APPIUM_CACHE_DIR="${APPIUM_HOME_ROOT}/node_modules/.cache/appium"
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
   ' "${APPIUM_EXTENSIONS}" "${APPIUM_HOME_ROOT}"; then
    echo "Regenerando caché de drivers Appium con rutas del framework actual..."
    rm -f "${APPIUM_EXTENSIONS}" "${APPIUM_PACKAGE_HASH}"
fi

echo "Modo: ${RECORDER_MODE}"
echo "Proyecto destino: ${TARGET_PROJECT}"
echo "Iniciando Appium..."

if [[ -x "${APPIUM_HOME_ROOT}/node_modules/.bin/appium" ]]; then
    "${APPIUM_HOME_ROOT}/node_modules/.bin/appium" \
        --port 4723 --log-level error --relaxed-security &
else
    appium --port 4723 --log-level error --relaxed-security &
fi
APPIUM_PID=$!

echo "Compilando e iniciando el recorder..."
npm run build
"${SCRIPT_DIR}/node_modules/.bin/electron" .
