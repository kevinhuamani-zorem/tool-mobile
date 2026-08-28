#!/usr/bin/env bash

set -euo pipefail

REPOSITORY="${VISUAL_RECORDER_REPOSITORY:-git@github.com:kevinhuamani-zorem/tool-mobile.git}"
BRANCH="${VISUAL_RECORDER_BRANCH:-visual-recorder}"
FRAMEWORK_ROOT="${FWK_MOBILE_ROOT:-$(pwd)}"
INSTALL_DIR="${VISUAL_RECORDER_TARGET:-${FRAMEWORK_ROOT}/tools/visual-recorder}"
START_RECORDER="false"

usage() {
    cat <<'EOF'
Uso: install.sh [--start]

Instala o actualiza Appium Visual Recorder dentro de fwk-mobile-test.

Opciones:
  --start   Inicia el recorder después de instalarlo.
  --help    Muestra esta ayuda.

Variables opcionales:
  FWK_MOBILE_ROOT              Ruta absoluta de fwk-mobile-test.
  VISUAL_RECORDER_REPOSITORY   Repositorio Git del recorder.
  VISUAL_RECORDER_BRANCH       Rama del recorder (visual-recorder por defecto).
  VISUAL_RECORDER_TARGET       Directorio de instalación.
  VISUAL_RECORDER_SKIP_NPM_CI  Usa 1 únicamente en pruebas controladas.
  VISUAL_RECORDER_SKIP_INSPECTOR
                               Usa 1 para instalar sin el Appium Inspector
                               embebido. El recorder funciona, pero cae al
                               inspector XML local.
EOF
}

for argument in "$@"; do
    case "${argument}" in
        --start) START_RECORDER="true" ;;
        --help|-h) usage; exit 0 ;;
        *) echo "Opción desconocida: ${argument}" >&2; usage >&2; exit 2 ;;
    esac
done

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Falta el comando requerido: $1" >&2
        exit 1
    fi
}

require_command git
require_command node
require_command npm

FRAMEWORK_ROOT="$(cd -- "${FRAMEWORK_ROOT}" 2>/dev/null && pwd)" || {
    echo "No existe el framework indicado: ${FRAMEWORK_ROOT}" >&2
    exit 1
}

if [[ ! -f "${FRAMEWORK_ROOT}/package.json" ]] ||
   [[ ! -d "${FRAMEWORK_ROOT}/features/yape-features" ]] ||
   [[ ! -d "${FRAMEWORK_ROOT}/screenobjects" ]]; then
    echo "Ejecuta el instalador desde la raíz de fwk-mobile-test." >&2
    echo "Ruta evaluada: ${FRAMEWORK_ROOT}" >&2
    exit 1
fi

EXPECTED_DIR="${FRAMEWORK_ROOT}/tools/visual-recorder"
if [[ "${INSTALL_DIR}" != "${EXPECTED_DIR}" ]] &&
   [[ -z "${VISUAL_RECORDER_TARGET:-}" ]]; then
    echo "La instalación debe quedar en ${EXPECTED_DIR}" >&2
    exit 1
fi

mkdir -p -- "$(dirname -- "${INSTALL_DIR}")"

if [[ -e "${INSTALL_DIR}" ]]; then
    if [[ ! -d "${INSTALL_DIR}/.git" ]]; then
        echo "Ya existe ${INSTALL_DIR}, pero no es un checkout Git del recorder." >&2
        exit 1
    fi
    if [[ -n "$(git -C "${INSTALL_DIR}" status --porcelain)" ]]; then
        echo "El recorder contiene cambios locales. Guárdalos antes de actualizar." >&2
        exit 1
    fi

    echo "Actualizando Appium Visual Recorder..."
    git -C "${INSTALL_DIR}" fetch origin "${BRANCH}"
    git -C "${INSTALL_DIR}" checkout "${BRANCH}"
    git -C "${INSTALL_DIR}" merge --ff-only "origin/${BRANCH}"
else
    echo "Instalando Appium Visual Recorder..."
    git clone --depth 1 --branch "${BRANCH}" --single-branch \
        "${REPOSITORY}" "${INSTALL_DIR}"
fi

INSPECTOR_PATH="vendor/appium-inspector"
INSPECTOR_CACHE="${INSTALL_DIR}/node_modules/.cache/appium-inspector"

# El Inspector embebido no existe en todas las ramas del recorder. Se decide por
# lo que trae el checkout, no por lo que esta version del instalador espera: así
# una rama sin Inspector se instala igual en vez de fallar.
INSPECTOR_AVAILABLE="false"
if [[ "${VISUAL_RECORDER_SKIP_INSPECTOR:-0}" != "1" ]] &&
   git -C "${INSTALL_DIR}" config --file .gitmodules \
       --get "submodule.${INSPECTOR_PATH}.url" >/dev/null 2>&1 &&
   node -e 'process.exit(require(process.argv[1]).scripts?.["inspector:build"] ? 0 : 1)' \
       "${INSTALL_DIR}/package.json" >/dev/null 2>&1; then
    INSPECTOR_AVAILABLE="true"
fi

if [[ "${INSPECTOR_AVAILABLE}" == "true" ]]; then
    echo "Obteniendo el Appium Inspector fijado..."
    git -C "${INSTALL_DIR}" submodule sync --recursive -- "${INSPECTOR_PATH}" >/dev/null
    # Superficial primero porque el pin suele ser la punta de la rama. Si no lo
    # es, el fetch superficial no alcanza ese commit y hace falta el completo.
    if ! git -C "${INSTALL_DIR}" submodule update --init --recursive --depth 1 \
            -- "${INSPECTOR_PATH}" 2>/dev/null; then
        git -C "${INSTALL_DIR}" submodule update --init --recursive -- "${INSPECTOR_PATH}"
    fi
fi

if [[ "${VISUAL_RECORDER_SKIP_NPM_CI:-0}" != "1" ]]; then
    # `npm ci` borra node_modules entero, y ahí es donde vive el build del
    # Inspector. Sin apartarlo, cada actualización del recorder obliga a
    # recompilarlo desde cero: casi 1 GB de dependencias del submódulo para
    # volver a producir los mismos 5,9 MB.
    INSPECTOR_CACHE_BACKUP=""
    if [[ -d "${INSPECTOR_CACHE}" ]]; then
        INSPECTOR_CACHE_BACKUP="$(mktemp -d "${TMPDIR:-/tmp}/visual-recorder-inspector.XXXXXX")/appium-inspector"
        mv -- "${INSPECTOR_CACHE}" "${INSPECTOR_CACHE_BACKUP}"
    fi

    echo "Instalando dependencias reproducibles..."
    npm --prefix "${INSTALL_DIR}" ci

    if [[ -n "${INSPECTOR_CACHE_BACKUP}" ]] && [[ -d "${INSPECTOR_CACHE_BACKUP}" ]]; then
        mkdir -p -- "$(dirname -- "${INSPECTOR_CACHE}")"
        rm -rf -- "${INSPECTOR_CACHE}"
        mv -- "${INSPECTOR_CACHE_BACKUP}" "${INSPECTOR_CACHE}"
        rmdir -- "$(dirname -- "${INSPECTOR_CACHE_BACKUP}")" 2>/dev/null || true
    fi
fi

if [[ "${INSPECTOR_AVAILABLE}" == "true" ]]; then
    # El verificador compara los hashes del build contra su manifiesto: si ya
    # está compilado y coincide, no se vuelve a compilar.
    if npm --prefix "${INSTALL_DIR}" run --silent inspector:check >/dev/null 2>&1; then
        echo "Appium Inspector embebido: ya compilado y verificado."
    else
        echo "Compilando el Appium Inspector embebido..."
        echo "Solo ocurre la primera vez o cuando cambia su versión; tarda varios minutos."
        if ! npm --prefix "${INSTALL_DIR}" run inspector:build; then
            echo >&2
            echo "No se pudo compilar el Appium Inspector embebido." >&2
            echo "El recorder no puede usarlo y caería al inspector XML local sin avisar," >&2
            echo "así que la instalación se detiene aquí." >&2
            echo >&2
            echo "Reintenta con: npm --prefix \"${INSTALL_DIR}\" run inspector:build" >&2
            echo "O instala sin él: VISUAL_RECORDER_SKIP_INSPECTOR=1 ./install.sh" >&2
            exit 1
        fi
        npm --prefix "${INSTALL_DIR}" run --silent inspector:check
    fi
fi

# Mantiene limpio `git status` sin editar el .gitignore versionado del target.
# Si el framework no es un checkout Git, la instalación sigue funcionando.
FRAMEWORK_LOCAL_EXCLUDE="${FRAMEWORK_ROOT}/.git/info/exclude"
IGNORE_RULE='/tools/visual-recorder/'
if [[ -f "${FRAMEWORK_LOCAL_EXCLUDE}" ]] &&
   ! grep -Fqx "${IGNORE_RULE}" "${FRAMEWORK_LOCAL_EXCLUDE}"; then
    printf '\n# Appium Visual Recorder instalado localmente\n%s\n' "${IGNORE_RULE}" \
        >> "${FRAMEWORK_LOCAL_EXCLUDE}"
fi

echo
echo "Appium Visual Recorder está listo en: ${INSTALL_DIR}"
if [[ "${INSPECTOR_AVAILABLE}" == "true" ]]; then
    echo "Appium Inspector: incluido y verificado; se abre dentro del recorder."
elif [[ "${VISUAL_RECORDER_SKIP_INSPECTOR:-0}" == "1" ]]; then
    echo "Appium Inspector: omitido (VISUAL_RECORDER_SKIP_INSPECTOR=1)."
    echo "El recorder usará su inspector XML local."
else
    echo "Appium Inspector: esta rama del recorder no lo incluye."
    echo "El recorder usará su inspector XML local."
fi
echo "El framework no fue modificado. Para iniciarlo desde su raíz:"
echo "npm --prefix tools/visual-recorder run recorder"

if [[ "${START_RECORDER}" == "true" ]]; then
    exec "${INSTALL_DIR}/run.sh"
fi
