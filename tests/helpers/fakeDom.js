// [visual-recorder] Fabrica mínima de DOM para probar composición de
// features del renderer sin depender de jsdom (no está entre las
// dependencias del proyecto). Solo implementa lo que `mount()`/`unmount()` y
// la inicialización síncrona de `initializeRecorder()` tocan: no es un DOM
// completo ni sustituye pruebas manuales en Electron real.
'use strict';

function createClassList() {
    const set = new Set();
    return {
        add: (...classes) => classes.forEach(c => set.add(c)),
        remove: (...classes) => classes.forEach(c => set.delete(c)),
        toggle(cls, force) {
            const next = force === undefined ? !set.has(cls) : force;
            if (next) set.add(cls); else set.delete(cls);
            return next;
        },
        contains: cls => set.has(cls),
    };
}

function createEventTargetMixin() {
    const listeners = new Map();
    return {
        addEventListener(type, handler, options) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push({ handler, options });
        },
        removeEventListener(type, handler) {
            const list = listeners.get(type);
            if (!list) return;
            const index = list.findIndex(entry => entry.handler === handler);
            if (index >= 0) list.splice(index, 1);
        },
        listenerCount(type) {
            if (type) return (listeners.get(type) || []).length;
            let total = 0;
            for (const list of listeners.values()) total += list.length;
            return total;
        },
    };
}

function createElementStub() {
    const attrs = {};
    const element = {
        ...createEventTargetMixin(),
        style: {},
        classList: createClassList(),
        dataset: {},
        options: [],
        children: [],
        innerHTML: '',
        textContent: '',
        value: '',
        title: '',
        id: '',
        selectedIndex: -1,
        disabled: false,
        checked: false,
        readOnly: false,
        open: false,
        appendChild(child) { this.children.push(child); return child; },
        append(...nodes) { this.children.push(...nodes); },
        insertAdjacentElement() { return createElementStub(); },
        remove() {},
        closest() { return createElementStub(); },
        querySelector() { return createElementStub(); },
        querySelectorAll() { return []; },
        getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
        setAttribute(name, value) { attrs[name] = value; },
        focus() {},
        click() {},
        scrollIntoView() {},
        getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
        getContext() {
            return { clearRect() {}, fillRect() {}, strokeRect() {}, drawImage() {} };
        },
        setPointerCapture() {},
    };
    return element;
}

/** Documento mínimo: cada id auto-genera y memoriza el mismo stub de elemento. */
function createDocumentStub() {
    const byId = new Map();
    const document = {
        ...createEventTargetMixin(),
        getElementById(id) {
            if (!byId.has(id)) {
                const element = createElementStub();
                element.id = id;
                byId.set(id, element);
            }
            return byId.get(id);
        },
        createElement() { return createElementStub(); },
        querySelector() { return createElementStub(); },
        querySelectorAll() { return []; },
        elementsById: byId,
    };
    return document;
}

/** `window.api` con cada canal resuelto de forma segura (sin éxito) para que
 * la carga inicial de `initializeRecorder()` retorne temprano sin construir
 * DOM adicional. Los tests pueden sobreescribir entradas puntuales. */
function createApiStub(overrides = {}) {
    const noopUnsubscribe = () => () => {};
    return {
        scanFramework: async () => ({ success: false, error: 'stub' }),
        getSquadCatalog: async () => ({ success: false, error: 'stub' }),
        getExistingScenarios: async () => ({ success: false, error: 'stub' }),
        getDevices: async () => ({ devices: [] }),
        bsLoadCredentials: async () => ({}),
        onInspectorConnected: noopUnsubscribe,
        onInspectorError: noopUnsubscribe,
        onInspectorElementUsed: noopUnsubscribe,
        onAutomationProgress: noopUnsubscribe,
        ...overrides,
    };
}

function installFakeBrowserGlobals(overrides = {}) {
    const document = createDocumentStub();
    const api = createApiStub(overrides.api);
    const window = { api, confirm: () => true };
    const descriptor = name => Object.getOwnPropertyDescriptor(global, name);
    const previous = {
        document: descriptor('document'),
        window: descriptor('window'),
        navigator: descriptor('navigator'),
        localStorage: descriptor('localStorage'),
    };
    const define = (name, value) => Object.defineProperty(global, name, {
        value, configurable: true, writable: true, enumerable: true,
    });
    define('document', document);
    define('window', window);
    define('navigator', { clipboard: { writeText: async () => {} } });
    define('localStorage', {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
    });
    return {
        document,
        window,
        restore() {
            for (const [name, desc] of Object.entries(previous)) {
                if (desc) Object.defineProperty(global, name, desc);
                else delete global[name];
            }
        },
    };
}

module.exports = { installFakeBrowserGlobals, createElementStub, createDocumentStub };
