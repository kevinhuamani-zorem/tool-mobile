const INHERIT_DESIGN_REVIEW_STORAGE_KEY = 'appiumRecorder.inheritDesignReview.v1';

// Heredar la revisión de diseño de los casos de origen cuando todo el caso
// viene de memoria. Es una decisión explícita del QA: por defecto Lorem
// revisa el diseño de cada caso aunque no tenga nada que redactar.
export function isInheritDesignReviewEnabled(storage = globalThis.localStorage) {
    try {
        return storage?.getItem(INHERIT_DESIGN_REVIEW_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

export function setInheritDesignReviewEnabled(enabled, storage = globalThis.localStorage) {
    try {
        if (enabled) storage?.setItem(INHERIT_DESIGN_REVIEW_STORAGE_KEY, 'true');
        else storage?.removeItem(INHERIT_DESIGN_REVIEW_STORAGE_KEY);
    } catch {
        // Una preferencia nunca debe bloquear el recorder.
    }
}

export { INHERIT_DESIGN_REVIEW_STORAGE_KEY };
