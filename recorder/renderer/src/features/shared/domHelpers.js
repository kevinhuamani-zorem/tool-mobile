// [visual-recorder] Helpers de DOM genéricos, reutilizados por varias features.
// No poseen estado propio; cada feature los importa en vez de duplicarlos.

/** Deshabilita un botón y guarda su texto original para restaurarlo luego. */
export function disableBtn(btn, text) {
    if (!btn) return;
    btn.disabled = true;
    btn.dataset.original = btn.textContent;
    btn.textContent = text;
}

/** Restaura un botón deshabilitado por `disableBtn`. */
export function enableBtn(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = btn.dataset.original || btn.textContent;
}

/** Actualiza la captura de pantalla del dispositivo mostrada en el recorder. */
export function updateDeviceScreen(imgDevice, devicePlaceholder, base64) {
    if (!base64 || !imgDevice) return;
    imgDevice.src = base64;
    imgDevice.style.display = 'block';
    if (devicePlaceholder) devicePlaceholder.style.display = 'none';
}

/** Escapa HTML para insertarlo de forma segura en `innerHTML`. */
export function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/** Actualiza un label de estado con mensaje + clase de tipo (ok/err/active/...). */
export function setLabelState(el, baseClass, msg, type) {
    if (!el) return;
    el.textContent = msg;
    el.className = baseClass + (type ? ' ' + type : '');
}
