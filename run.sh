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
   [[ ! -d "${FRAMEWORK_ROOT}/features/yape-features" ]] ||
   [[ ! -d "${FRAMEWORK_ROOT}/screenobjects" ]]; then
    echo "El recorder debe estar instalado en fwk-mobile-test/tools/visual-recorder." >&2
    echo "Framework evaluado: ${FRAMEWORK_ROOT}" >&2
    exit 1
fi

if [[ ! -x "${SCRIPT_DIR}/node_modules/.bin/electron" ]]; then
    echo "Faltan las dependencias del recorder." >&2
    echo "Ejecuta: cd \"${SCRIPT_DIR}\" && npm ci" >&2
    exit 1
fi

FRAMEWORK_APPIUM_BIN="${FRAMEWORK_ROOT}/node_modules/.bin/appium"
if [[ ! -x "${FRAMEWORK_APPIUM_BIN}" ]]; then
    echo "Falta Appium en las dependencias de fwk-mobile-test." >&2
    echo "Ejecuta npm ci desde la raíz: ${FRAMEWORK_ROOT}" >&2
    exit 1
fi

# El recorder está acoplado al framework y comparte su servidor y drivers.
# La validación evita iniciar una sesión cuando un override del framework dejó
# @appium/base-driver en una versión incompatible con Appium o sus drivers.
if ! node - "${FRAMEWORK_ROOT}" <<'NODE'
const path = require('node:path');
const { createRequire } = require('node:module');

const frameworkRoot = process.argv[2];
const frameworkRequire = createRequire(path.join(frameworkRoot, 'package.json'));
const requiredPackages = [
    'appium',
    'appium-uiautomator2-driver',
    'appium-xcuitest-driver',
];

try {
    const versions = Object.fromEntries(requiredPackages.map(packageName => [
        packageName,
        frameworkRequire(`${packageName}/package.json`).version,
    ]));
    const baseDriverPackage = frameworkRequire('@appium/base-driver/package.json');
    const baseDriver = frameworkRequire('@appium/base-driver');

    if (typeof baseDriver.AppiumIpc !== 'function') {
        throw new Error(
            `@appium/base-driver ${baseDriverPackage.version} no expone AppiumIpc`,
        );
    }

    process.stdout.write(
        `Runtime Appium del framework: ${versions.appium}; ` +
        `UiAutomator2: ${versions['appium-uiautomator2-driver']}; ` +
        `XCUITest: ${versions['appium-xcuitest-driver']}\n`,
    );
} catch (error) {
    process.stderr.write(`Runtime Appium incompatible en fwk-mobile-test: ${error.message}\n`);
    process.exit(1);
}
NODE
then
    echo "Corrige las versiones/overrides de Appium en fwk-mobile-test y ejecuta npm ci en su raíz." >&2
    exit 1
fi

if lsof -ti :4723 >/dev/null 2>&1; then
    echo "El puerto 4723 ya está ocupado. Cierra la sesión Appium existente." >&2
    exit 1
fi

cd "${SCRIPT_DIR}"

APPIUM_HOME_ROOT="${FRAMEWORK_ROOT}"
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

echo "Proyecto destino: ${FRAMEWORK_ROOT}"
echo "Iniciando Appium..."

"${FRAMEWORK_APPIUM_BIN}" \
    --port 4723 --log-level error --relaxed-security &
APPIUM_PID=$!

echo "Compilando e iniciando el recorder..."
npm run build
"${SCRIPT_DIR}/node_modules/.bin/electron" .
