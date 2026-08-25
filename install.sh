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

if [[ "${VISUAL_RECORDER_SKIP_NPM_CI:-0}" != "1" ]]; then
    echo "Instalando dependencias reproducibles..."
    npm --prefix "${INSTALL_DIR}" ci
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
echo "El framework no fue modificado. Para iniciarlo desde su raíz:"
echo "npm --prefix tools/visual-recorder run recorder"

if [[ "${START_RECORDER}" == "true" ]]; then
    exec "${INSTALL_DIR}/run.sh"
fi
