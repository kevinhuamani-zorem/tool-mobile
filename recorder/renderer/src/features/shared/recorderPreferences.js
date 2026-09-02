const QA_ROAST_MODE_STORAGE_KEY = 'appiumRecorder.qaRoastMode.v1';

export function isQaRoastModeEnabled(storage = globalThis.localStorage) {
    try {
        return storage?.getItem(QA_ROAST_MODE_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

export function setQaRoastModeEnabled(enabled, storage = globalThis.localStorage) {
    try {
        if (enabled) storage?.setItem(QA_ROAST_MODE_STORAGE_KEY, 'true');
        else storage?.removeItem(QA_ROAST_MODE_STORAGE_KEY);
    } catch {
        // Una preferencia visual nunca debe bloquear el recorder.
    }
}

export { QA_ROAST_MODE_STORAGE_KEY };
