// [visual-recorder] Feature "inspector": Hierarchy Viewer (modal XML local) y
// el lanzamiento del Appium Inspector embebido, más la captura/verificación de
// selectores explícitos (inspección por click sobre la captura e interacción
// manual). Ver docs/ARCHITECTURE.md — límite Electron: solo consume
// `window.api`, nunca XML/atributos fuera de lo que el propio recorder pide.
//
// El selector capturado (`txtSelector`/`txtVarName`) y su estado de
// verificación (`state.verifiedSelector`, `state.selectorCandidateToken`) son
// contexto compartido con `recording` y `platform-completion`; esta feature
// solo lee/escribe esas propiedades, nunca las copia.

import { disableBtn, enableBtn, setLabelState } from '../shared/domHelpers.js';

/**
 * @param {object} deps
 * @param {Window['api']} deps.api
 * @param {object} deps.state
 * @param {(msg: string, color?: string) => void} deps.setStatus
 * @param {(base64: string) => void} deps.updateDeviceScreen dueño: recording.
 * @param {() => void} deps.renderAssignmentTarget dueño: platform-completion.
 * @param {() => void} deps.updateAssignmentButton dueño: platform-completion.
 * @param {() => void} deps.renderSelectedLocatorCoverage dueño: platform-completion.
 */
export function createInspectorFeature(deps) {
    const { api, state, setStatus, updateDeviceScreen, renderAssignmentTarget, updateAssignmentButton, renderSelectedLocatorCoverage } = deps;

    const imgDevice = document.getElementById('imgDevice');
    const btnInspect = document.getElementById('btnInspect');
    const btnInteract = document.getElementById('btnInteract');
    const lblInspect = document.getElementById('lblInspectStatus');
    const txtSelector = document.getElementById('txtSelector');
    const txtVarName = document.getElementById('txtVarName');
    const txtElementContext = document.getElementById('txtElementContext');
    const btnCopy = document.getElementById('btnCopy');
    const btnVerify = document.getElementById('btnVerify');
    const lblVerify = document.getElementById('lblVerifyResult');
    const btnXmlInspector = document.getElementById('btnXmlInspector');

    // ─── Hierarchy Viewer (modal XML local) ────────────────────────────────
    const xmlModal = document.getElementById('xmlModal');
    const hierImg = document.getElementById('hierImg');
    const hierCanvas = document.getElementById('hierCanvas');
    const hierScreenWrap = document.getElementById('hierScreenWrap');
    const hierTree = document.getElementById('hierTree');
    const hierAttrs = document.getElementById('hierAttrs');
    const hierXpathSug = document.getElementById('hierXpathSuggestions');
    const lblHierarchyMode = document.getElementById('lblHierarchyMode');
    const cmbLocatorStrategy = document.getElementById('cmbLocatorStrategy');
    const txtLocatorValue = document.getElementById('txtLocatorValue');
    const btnVerifyXpathM = document.getElementById('btnVerifyXpathManual');
    const btnUseXpath = document.getElementById('btnUseXpath');
    const lblXmlVerify = document.getElementById('lblXmlVerify');
    const btnCopyXml = document.getElementById('btnCopyXml');
    const btnCopyTree = document.getElementById('btnCopyTree');
    const btnCopyHierarchy = document.getElementById('btnCopyHierarchy');
    const btnRefreshXml = document.getElementById('btnRefreshXml');
    const btnCloseXml = document.getElementById('btnCloseXml');

    let currentXml = '';
    let parsedElements = [];
    let selectedHierarchyElement = null;
    let hierarchyMode = 'tree';
    let hierarchyRoots = [];
    let hierarchyNodeByElement = new Map();
    let activeIosAlert = null;
    let activeAndroidPermissionButtons = [];
    let xmlExpandedNodes = new Map();

    let inspectorActive = false;
    let inspectorClickFn = null;
    let inspectorElems = [];
    let inspectorDimW = 0;
    let inspectorDimH = 0;
    let interactionActive = false;
    let interactionBusy = false;
    let interactionDownFn = null;
    let interactionUpFn = null;
    let interactionCancelFn = null;
    let interactionStart = null;

    const bound = [];
    const ipcUnsubscribers = [];
    function on(target, type, handler, options) {
        if (!target) return;
        target.addEventListener(type, handler, options);
        bound.push({ target, type, handler, options });
    }

    function setVerify(msg, type) { setLabelState(lblVerify, 'verify-result', msg, type); }
    function setInspect(msg, type) { setLabelState(lblInspect, 'inspect-status', msg, type); }

    function clearSelectorCandidateBackups() {
        state.selectorCandidateToken = '';
        // Sin backups alternos: el recorder conserva solo el selector elegido por QA.
    }

    function clearInspectorCandidates() {
        clearSelectorCandidateBackups();
    }

    function clearSelectorChips() {
        document.getElementById('selectorChips')?.remove();
    }

    /** Limpia la captura activa (selector + chips + candidatos). Usada por otras features. */
    function clearSelectorCapture() {
        clearSelectorChips();
        clearSelectorCandidateBackups();
    }

    function renderSelectorChips(candidates, suggested) {
        let chipsWrap = document.getElementById('selectorChips');
        if (!chipsWrap) {
            chipsWrap = document.createElement('div');
            chipsWrap.id = 'selectorChips';
            chipsWrap.style.cssText =
                'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;padding:4px 0';
            const selectorRow = txtSelector.closest('.input-row');
            selectorRow.insertAdjacentElement('afterend', chipsWrap);
        }
        chipsWrap.innerHTML = '';

        candidates.forEach((c, idx) => {
            const chip = document.createElement('div');
            chip.style.cssText =
                'display:inline-flex;flex-direction:column;gap:2px;padding:5px 9px;' +
                'border-radius:5px;border:1.5px solid ' + (idx === 0 ? '#7030A0' : '#444') + ';' +
                'cursor:pointer;background:' + (idx === 0 ? '#3a2a4e' : '#2a2a3e') + ';' +
                'max-width:320px;';

            const priorityColors = ['#3a9a3a','#4a80d9','#c09040','#888','#666','#555'];
            const labelEl = document.createElement('span');
            labelEl.style.cssText = 'font-size:9px;font-weight:700;color:' +
                (priorityColors[idx] || '#888');
            labelEl.textContent = (idx === 0 ? '⭐ ' : '') + c.label;

            const valEl = document.createElement('span');
            valEl.style.cssText =
                'font-family:monospace;font-size:9.5px;color:' +
                (idx === 0 ? '#e0b0ff' : '#ccc') +
                ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px';
            valEl.textContent = c.selector;
            valEl.title = c.selector;

            chip.appendChild(labelEl);
            chip.appendChild(valEl);

            chip.addEventListener('click', () => {
                // Actualizar selector y variable name
                clearSelectorCandidateBackups();
                txtSelector.value = c.selector;
                state.verifiedSelector = '';
                const patterns = [
                    /^id=[^/]+\/(.+)$/,
                    /^id=(.+)$/,
                    /^~(.+)$/,
                    /@resource-id="[^"]*\/([^"]+)"/,
                    /@resource-id="([^"]+)"/,
                    /@content-desc="([^"]+)"/,
                    /@text="([^"]+)"/,
                ];
                if (!state.currentAssignment) {
                    for (const re of patterns) {
                        const m = c.selector.match(re);
                        if (m) {
                            txtVarName.value = m[1].toLowerCase()
                                .replace(/[^a-z0-9]/g, '_')
                                .replace(/_+/g, '_')
                                .replace(/^_|_$/g, '');
                            break;
                        }
                    }
                }
                updateAssignmentButton();
                // Resaltar chip activo
                chipsWrap.querySelectorAll('div').forEach(ch => {
                    ch.style.borderColor = '#444';
                    ch.style.background  = '#2a2a3e';
                    ch.querySelector('span').style.color = '#888';
                });
                chip.style.borderColor = '#7030A0';
                chip.style.background  = '#3a2a4e';
                labelEl.style.color    = priorityColors[idx] || '#888';
            });

            chipsWrap.appendChild(chip);
        });
    }

    function getAttrVal(attrs, name) {
        const m = attrs.match(new RegExp('\\b' + name + '="([^"]*)"'));
        return m ? m[1] : '';
    }

    /** Genera candidatos explícitos de Appium a partir de un elemento parseado. */
    function buildCandidatesFromEl(el) {
        const IGNORED = ['android:id/content','android:id/navigationBarBackground','android:id/statusBarBackground'];
        const cands = [];
        let p = 1;

        // Android
        if (el.resourceId && !IGNORED.includes(el.resourceId)) {
            const isComposeId = !el.resourceId.includes('/') && !el.resourceId.includes(':');
            cands.push({
                label: isComposeId ? 'Compose resource-id' : 'ID',
                selector: isComposeId
                    ? '//*[@resource-id="' + el.resourceId + '"]'
                    : 'id=' + el.resourceId,
                priority: p++
            });
            const idPart = el.resourceId.split('/')[1];
            if (idPart) cands.push({ label: 'resource-id contains', selector: '//*[contains(@resource-id,"' + idPart + '")]', priority: p++ });
        }
        if (el.contentDesc && el.contentDesc.length > 0 && el.contentDesc.length < 80)
            cands.push({ label: 'Accessibility ID', selector: '~' + el.contentDesc, priority: p++ });
        if (el.text && el.text.length > 0 && el.text.length < 80) {
            cands.push({ label: 'text', selector: '//*[@text="' + el.text + '"]', priority: p++ });
            if (el.text.length > 10)
                cands.push({ label: 'text contains', selector: '//*[contains(@text,"' + el.text.slice(0,20) + '")]', priority: p++ });
        }

        // iOS (XCUITest)
        const iosName  = getAttrVal(el.attrs, 'name');
        const iosLabel = getAttrVal(el.attrs, 'label');
        const iosValue = getAttrVal(el.attrs, 'value');
        if (iosName  && iosName.length  > 0 && iosName.length  < 80 && !el.resourceId) {
            cands.push({ label: 'Accessibility ID', selector: '~' + iosName, priority: p++ });
            cands.push({ label: 'iOS Predicate', selector: "iosPredicate=name == '" + iosName.replace(/'/g, "\\'") + "'", priority: p++ });
        }
        if (iosLabel && iosLabel.length > 0 && iosLabel.length < 80 && !el.contentDesc) {
            cands.push({ label: 'iOS Predicate label', selector: "iosPredicate=label == '" + iosLabel.replace(/'/g, "\\'") + "'", priority: p++ });
            cands.push({ label: 'XPath label', selector: '//*[@label="' + iosLabel + '"]', priority: p++ });
        }
        if (iosValue && iosValue.length > 0 && iosValue.length < 80 && !el.text)
            cands.push({ label: 'iOS Predicate value', selector: "iosPredicate=value == '" + iosValue.replace(/'/g, "\\'") + "'", priority: p++ });
        if (
            /XCUIElementType(TextField|SecureTextField)/.test(el.tag) &&
            !iosName && !iosLabel && el.iosAncestorName
        ) {
            cands.push({
                label: 'iOS campo por contenedor accesible',
                selector: '//' + (el.iosAncestorTag || 'XCUIElementTypeOther') +
                    '[@name="' + el.iosAncestorName.replace(/"/g, '\\"') + '"]//' + el.tag,
                priority: p++
            });
            cands.push({
                label: 'iOS Class Chain editable',
                selector: 'iosClassChain=**/' + el.tag,
                priority: p++
            });
        }

        // Fallback XPath por clase
        const tagName = el.className || el.tag;
        if (tagName && tagName !== 'hierarchy' && tagName !== 'AppiumAUT')
            cands.push({ label: 'xpath', selector: '//' + tagName, priority: p });

        return cands;
    }

    /** Sugiere nombre de variable desde un selector explícito. */
    function inferVarName(selector, tag) {
        const patterns = [
            /^id=[^/]+\/(.+)$/,
            /^id=(.+)$/,
            /^~(.+)$/,
            /@resource-id="[^"]*\/([^"]+)"/,
            /@resource-id="([^"]+)"/,
            /@content-desc="([^"]+)"/,
            /@text="([^"]+)"/,
            /@name="([^"]+)"/,
            /@label="([^"]+)"/,
        ];
        const shortTag = (tag || 'element').split('.').pop().toLowerCase()
            .replace('xcuielementtype','');
        for (const re of patterns) {
            const m = selector.match(re);
            if (m) {
                const name = m[1].toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
                return shortTag + '_' + name;
            }
        }
        return shortTag + '_' + (Date.now() % 1000);
    }

    function exitInspectorMode() {
        inspectorActive = false;
        imgDevice.style.cursor = '';
        imgDevice.style.outline = '';
        if (inspectorClickFn) {
            imgDevice.removeEventListener('click', inspectorClickFn);
            inspectorClickFn = null;
        }
        btnInspect.textContent = '🔍 Inspeccionar';
        btnInspect.disabled    = false;
    }

    function exitInteractionMode() {
        interactionActive = false;
        interactionBusy = false;
        imgDevice.classList.remove('manual-interaction', 'busy');
        btnInteract.classList.remove('mode-active');
        btnInteract.textContent = '👆 Interactuar';
        btnInspect.disabled = false;
        interactionStart = null;
        if (interactionDownFn) imgDevice.removeEventListener('pointerdown', interactionDownFn);
        if (interactionUpFn) imgDevice.removeEventListener('pointerup', interactionUpFn);
        if (interactionCancelFn) imgDevice.removeEventListener('pointercancel', interactionCancelFn);
        interactionDownFn = null;
        interactionUpFn = null;
        interactionCancelFn = null;
    }

    async function loadDeviceCoordinateSpace() {
        const xmlR = await api.getPageSource();
        if (!xmlR.success) throw new Error(xmlR.error || 'No se pudo obtener el XML');

        const elements = parseElements(xmlR.xml);
        const coordinateElements = elements.filter(el =>
            Number.isFinite(el.x2) && Number.isFinite(el.y2) && el.x2 > 0 && el.y2 > 0
        );
        const wm = xmlR.xml.match(/width="(\d+)"/);
        const hm = xmlR.xml.match(/height="(\d+)"/);
        inspectorDimW = wm
            ? parseInt(wm[1])
            : Math.max(...coordinateElements.map(el => el.x2), state.deviceW || 1);
        inspectorDimH = hm
            ? parseInt(hm[1])
            : Math.max(...coordinateElements.map(el => el.y2), state.deviceH || 1);

        if (!inspectorDimW || !inspectorDimH) {
            throw new Error('No se pudieron determinar las dimensiones del dispositivo');
        }
    }

    // ─── HIERARCHY VIEWER ────────────────────────────────────────────────────
    function parseElements(xml) {
        const elements = [];
        const re = /<([\w.]+)\s([^>]*?)(?:\/>|>)/g;
        let m;
        while ((m = re.exec(xml)) !== null) {
            const tag   = m[1];
            const attrs = m[2];
            let x1, y1, x2, y2;

            // Formato Android: bounds="[x1,y1][x2,y2]"
            const bounds = getAttrVal(attrs, 'bounds');
            if (bounds) {
                const bm = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
                if (bm) {
                    x1 = parseInt(bm[1]); y1 = parseInt(bm[2]);
                    x2 = parseInt(bm[3]); y2 = parseInt(bm[4]);
                }
            }

            // Formato iOS: x="0" y="0" width="120" height="44"
            if (x1 === undefined) {
                const xA = getAttrVal(attrs, 'x');
                const yA = getAttrVal(attrs, 'y');
                const wA = getAttrVal(attrs, 'width');
                const hA = getAttrVal(attrs, 'height');
                if (xA !== '' && yA !== '' && wA !== '' && hA !== '') {
                    x1 = parseInt(xA); y1 = parseInt(yA);
                    x2 = x1 + parseInt(wA); y2 = y1 + parseInt(hA);
                }
            }

            if (x1 === undefined || x2 === undefined) continue;
            if (x2 <= x1 || y2 <= y1) continue;

            const iosName = getAttrVal(attrs, 'name');
            const iosLabel = getAttrVal(attrs, 'label');
            const iosValue = getAttrVal(attrs, 'value');
            const visible = getAttrVal(attrs, 'visible');
            const displayed = getAttrVal(attrs, 'displayed');
            elements.push({
                tag, attrs,
                resourceId:  getAttrVal(attrs, 'resource-id'),
                text:        getAttrVal(attrs, 'text'),
                contentDesc: getAttrVal(attrs, 'content-desc'),
                clickable:   getAttrVal(attrs, 'clickable'),
                focusable:   getAttrVal(attrs, 'focusable'),
                focused:     getAttrVal(attrs, 'focused'),
                enabled:     getAttrVal(attrs, 'enabled'),
                displayed:   getAttrVal(attrs, 'displayed'),
                className:   getAttrVal(attrs, 'class'),
                iosName, iosLabel, iosValue,
                isIos: tag.startsWith('XCUIElementType'),
                isVisible: visible !== 'false' && displayed !== 'false',
                x1, y1, x2, y2
            });
        }
        // Algunos TextField de iOS no exponen name/label propios. Conservamos el
        // identificador del ancestro accesible para poder construir un selector estable.
        try {
            const documentXml = new DOMParser().parseFromString(xml, 'application/xml');
            documentXml.querySelectorAll('XCUIElementTypeTextField, XCUIElementTypeSecureTextField')
                .forEach(node => {
                    const x = Number(node.getAttribute('x'));
                    const y = Number(node.getAttribute('y'));
                    const width = Number(node.getAttribute('width'));
                    const height = Number(node.getAttribute('height'));
                    const element = elements.find(candidate =>
                        candidate.tag === node.tagName &&
                        candidate.x1 === x && candidate.y1 === y &&
                        candidate.x2 === x + width && candidate.y2 === y + height
                    );
                    if (!element) return;
                    let ancestor = node.parentElement;
                    while (ancestor && ancestor !== documentXml.documentElement) {
                        const identifier = ancestor.getAttribute('name') || ancestor.getAttribute('label');
                        if (identifier) {
                            element.iosAncestorName = identifier;
                            element.iosAncestorTag = ancestor.tagName;
                            break;
                        }
                        ancestor = ancestor.parentElement;
                    }
                });
        } catch {
            // El parser principal seguirá ofreciendo selectores por clase.
        }
        return elements;
    }

    function findElementAt(px, py) {
        const candidates = parsedElements.filter(el =>
            el.isVisible && px >= el.x1 && px <= el.x2 && py >= el.y1 && py <= el.y2
        );
        // iOS expone muchos XCUIElementTypeOther superpuestos. Preferimos controles
        // que Appium puede accionar, como los botones del permiso del sistema.
        const actionable = candidates.filter(el => el.isIos
            ? (/XCUIElementType(Button|Link|Switch|TextField|SecureTextField)/.test(el.tag) ||
                getAttrVal(el.attrs, 'accessible') === 'true')
            : el.clickable === 'true'
        );
        let pool = actionable.length ? actionable : candidates;
        if (!actionable.length && candidates.some(el => el.isIos)) {
            const containers = [...candidates].sort((a, b) =>
                ((a.x2-a.x1) * (a.y2-a.y1)) - ((b.x2-b.x1) * (b.y2-b.y1))
            );
            const nearbyEditable = parsedElements.filter(el =>
                el.isIos && el.isVisible &&
                /XCUIElementType(TextField|SecureTextField)/.test(el.tag) &&
                containers.some(container =>
                    el.x1 >= container.x1 && el.x2 <= container.x2 &&
                    el.y1 >= container.y1 && el.y2 <= container.y2
                )
            ).sort((a, b) => {
                const distance = el => {
                    const dx = px < el.x1 ? el.x1-px : px > el.x2 ? px-el.x2 : 0;
                    const dy = py < el.y1 ? el.y1-py : py > el.y2 ? py-el.y2 : 0;
                    return Math.hypot(dx, dy);
                };
                return distance(a) - distance(b);
            });
            if (nearbyEditable.length && (() => {
                const field = nearbyEditable[0];
                const dx = px < field.x1 ? field.x1-px : px > field.x2 ? px-field.x2 : 0;
                const dy = py < field.y1 ? field.y1-py : py > field.y2 ? py-field.y2 : 0;
                return Math.hypot(dx, dy) <= 48;
            })()) {
                pool = [nearbyEditable[0]];
            }
        }
        let best = null, bestArea = Infinity;
        pool.forEach(el => {
            const area = (el.x2-el.x1) * (el.y2-el.y1);
            if (area < bestArea) { bestArea = area; best = el; }
        });
        return best;
    }

    function drawRect(el, color, fill, lineWidth) {
        const ctx = hierCanvas.getContext('2d');
        const w   = hierCanvas.width;
        const h   = hierCanvas.height;
        const sx  = w / state.deviceW;
        const sy  = h / state.deviceH;
        ctx.strokeStyle = color;
        ctx.lineWidth   = lineWidth || 2;
        ctx.fillStyle   = fill;
        ctx.fillRect  (el.x1*sx, el.y1*sy, (el.x2-el.x1)*sx, (el.y2-el.y1)*sy);
        ctx.strokeRect(el.x1*sx, el.y1*sy, (el.x2-el.x1)*sx, (el.y2-el.y1)*sy);
    }

    function syncCanvas() {
        // El canvas debe medir exactamente lo mismo que la captura. El panel puede
        // tener espacio libre debajo de la imagen y no forma parte del dispositivo.
        const width = hierImg.offsetWidth;
        const height = hierImg.offsetHeight;
        hierCanvas.width  = width;
        hierCanvas.height = height;
        hierCanvas.style.width  = width + 'px';
        hierCanvas.style.height = height + 'px';
    }

    function showAttrs(el) {
        if (!el) { hierAttrs.innerHTML = '<span class="hier-hint">Sin elemento</span>'; return; }
        const KEYS = el.isIos
            ? ['type','name','label','value','enabled','visible','accessible','x','y','width','height','index','traits']
            : ['class','resource-id','text','content-desc','clickable','focusable','focused','enabled','displayed','bounds'];
        let html = '';
        KEYS.forEach(k => {
            const v = getAttrVal(el.attrs, k);
            if (!v) return;
            let vc = 'hier-attr-val';
            if (k==='clickable' && v==='true') vc += ' clickable-true';
            if (k==='focused'   && v==='true') vc += ' focused-true';
            html += '<div class="hier-attr-row">' +
                    '<span class="hier-attr-key">' + k + '</span>' +
                    '<span class="' + vc + '">' + v + '</span></div>';
        });
        hierAttrs.innerHTML = html || '<span class="hier-hint">Sin atributos</span>';
    }

    function nodeLabel(el) {
        const short = (el.className || el.tag).split('.').pop();
        const info  = el.iosName ? el.iosName.slice(0, 28)
                    : el.iosLabel ? el.iosLabel.slice(0, 28)
                    : el.iosValue ? el.iosValue.slice(0, 28)
                    : el.resourceId ? (el.resourceId.split('/')[1] || el.resourceId)
                    : el.text       ? el.text.slice(0, 28)
                    : el.contentDesc? el.contentDesc.slice(0, 28) : '';
        return { short, info };
    }

    function showNodeInTree(el) {
        const model = hierarchyNodeByElement.get(el);
        if (!model) return;
        // Al elegir desde la captura, abrir toda la ruta hasta el nodo concreto.
        for (let node = model; node; node = node.parent) {
            if (hierarchyMode === 'xml') xmlExpandedNodes.set(node.id, true);
            else node.expanded = true;
        }
        if (hierarchyMode === 'xml') renderXmlRows();
        else renderTreeRows();
        requestAnimationFrame(() => {
            const row = hierTree.querySelector(`[data-tree-id="${model.id}"]`);
            if (row) row.scrollIntoView({ block: 'nearest' });
        });
    }

    function renderHierarchyTree(xml) {
        hierarchyRoots = [];
        hierarchyNodeByElement = new Map();
        xmlExpandedNodes = new Map();
        let nextElementIndex = 0;
        let documentXml;
        try {
            documentXml = new DOMParser().parseFromString(xml, 'application/xml');
            if (documentXml.querySelector('parsererror')) throw new Error('XML inválido');
        } catch {
            hierTree.innerHTML = '<span class="hier-hint">No se pudo interpretar el árbol XML.</span>';
            return;
        }

        const locateElement = (xmlNode) => {
            const bounds = xmlNode.getAttribute('bounds');
            const isIosNode = xmlNode.tagName.startsWith('XCUIElementType');
            const className = xmlNode.getAttribute('class') || '';
            for (let index = nextElementIndex; index < parsedElements.length; index++) {
                const el = parsedElements[index];
                const androidMatch = bounds && getAttrVal(el.attrs, 'bounds') === bounds &&
                    (!className || el.className === className);
                const iosMatch = isIosNode && el.isIos && el.tag === xmlNode.tagName &&
                    getAttrVal(el.attrs, 'x') === (xmlNode.getAttribute('x') || '') &&
                    getAttrVal(el.attrs, 'y') === (xmlNode.getAttribute('y') || '') &&
                    getAttrVal(el.attrs, 'width') === (xmlNode.getAttribute('width') || '') &&
                    getAttrVal(el.attrs, 'height') === (xmlNode.getAttribute('height') || '');
                if (androidMatch || iosMatch) {
                    nextElementIndex = index + 1;
                    return el;
                }
            }
            return null;
        };

        let treeId = 0;
        const buildNode = (xmlNode, parent = null, depth = 0) => {
            if (xmlNode.nodeType !== Node.ELEMENT_NODE) return;
            // iOS puede marcar un contenedor como oculto aunque su TextField hijo sea visible.
            // Omitimos el contenedor, pero conservamos sus descendientes seleccionables.
            if (xmlNode.getAttribute('visible') === 'false') {
                Array.from(xmlNode.children).forEach(child => buildNode(child, parent, depth));
                return;
            }
            const el = locateElement(xmlNode);
            const node = { id: ++treeId, xmlNode, el, parent, depth, children: [], expanded: depth < 3 };
            xmlExpandedNodes.set(node.id, depth < 3);
            if (parent) parent.children.push(node); else hierarchyRoots.push(node);
            if (el) hierarchyNodeByElement.set(el, node);
            Array.from(xmlNode.children).forEach(child => buildNode(child, node, depth + 1));
        };

        activeIosAlert = parsedElements.find(el => el.isIos && el.isVisible && el.tag === 'XCUIElementTypeAlert') || null;
        activeAndroidPermissionButtons = parsedElements.filter(el =>
            !el.isIos && el.isVisible &&
            /^com\.android\.permissioncontroller:id\/permission_(allow|deny)_button$/.test(el.resourceId)
        );
        buildNode(documentXml.documentElement);
        renderTreeRows();
        if (!hierarchyRoots.length) {
            hierTree.innerHTML = '<span class="hier-hint">El XML no contiene nodos visualizables.</span>';
        }
    }

    function renderTreeRows() {
        hierTree.innerHTML = '';
        appendPermissionActions(hierTree);
        if (activeIosAlert) {
            const alertRow = document.createElement('div');
            alertRow.className = 'hier-alert-node';
            alertRow.textContent = `⚠ Alerta iOS activa: ${nodeLabel(activeIosAlert).info || 'sin título'}`;
            alertRow.addEventListener('click', () => selectHierarchyElement(activeIosAlert));
            hierTree.appendChild(alertRow);
        }
        const append = node => {
            const row = document.createElement('div');
            row.className = 'hier-node' + (node.el ? '' : ' hier-node-container') +
                (node.el === selectedHierarchyElement ? ' selected' : '');
            row.dataset.treeId = String(node.id);
            row.style.paddingLeft = (4 + Math.min(node.depth, 8) * 13) + 'px';
            const label = node.el ? nodeLabel(node.el) : {
                short: (node.xmlNode.getAttribute('class') || node.xmlNode.tagName).split('.').pop(), info: ''
            };
            const toggle = document.createElement('button');
            toggle.className = 'hier-toggle';
            toggle.textContent = node.children.length ? (node.expanded ? '▾' : '▸') : '·';
            toggle.disabled = !node.children.length;
            toggle.addEventListener('click', event => {
                event.stopPropagation();
                node.expanded = !node.expanded;
                renderTreeRows();
            });
            const tag = document.createElement('span');
            tag.className = 'node-tag';
            tag.textContent = `<${label.short}>`;
            row.append(toggle, tag);
            if (label.info) {
                const info = document.createElement('span');
                info.className = 'node-id';
                info.textContent = ` ${label.info}`;
                row.appendChild(info);
            }
            if (node.el) {
                row.title = 'Seleccionar y resaltar este elemento';
                row.addEventListener('click', () => selectHierarchyElement(node.el));
            }
            hierTree.appendChild(row);
            if (node.expanded) node.children.forEach(append);
        };
        hierarchyRoots.forEach(append);
    }

    function appendPermissionActions(container) {
        if (!activeAndroidPermissionButtons.length) return;
        const panel = document.createElement('div');
        panel.className = 'hier-permission-actions';
        const title = document.createElement('div');
        title.textContent = '⚠ Permiso Android activo — selecciona una opción';
        panel.appendChild(title);
        activeAndroidPermissionButtons.forEach(buttonEl => {
            const button = document.createElement('button');
            button.className = 'permission-select-btn';
            button.textContent = buttonEl.text || buttonEl.resourceId.split('/').pop();
            button.title = buttonEl.resourceId;
            button.addEventListener('click', () => selectHierarchyElement(buttonEl));
            panel.appendChild(button);
        });
        container.appendChild(panel);
    }

    function xmlNodeText(node, closing = false) {
        if (closing) return `</${node.xmlNode.tagName}>`;
        const attributes = Array.from(node.xmlNode.attributes)
            .map(attr => `${attr.name}="${attr.value}"`).join(' ');
        return `<${node.xmlNode.tagName}${attributes ? ' ' + attributes : ''}${node.children.length ? '>' : '/>'}`;
    }

    function renderXmlRows() {
        hierTree.innerHTML = '';
        appendPermissionActions(hierTree);
        const append = node => {
            const expanded = xmlExpandedNodes.get(node.id) === true;
            // Conserva la semántica XML aunque los nodos invisibles estén ocultos en la vista.
            const hasChildren = node.xmlNode.children.length > 0;
            const row = document.createElement('div');
            row.className = 'hier-xml-row' + (node.el === selectedHierarchyElement ? ' selected' : '');
            row.dataset.treeId = String(node.id);
            row.style.paddingLeft = (4 + Math.min(node.depth, 8) * 13) + 'px';
            const toggle = document.createElement('button');
            toggle.className = 'hier-toggle';
            toggle.textContent = hasChildren ? (expanded ? '▾' : '▸') : '·';
            toggle.disabled = !hasChildren;
            toggle.addEventListener('click', event => {
                event.stopPropagation();
                xmlExpandedNodes.set(node.id, !expanded);
                renderXmlRows();
            });
            const opening = document.createElement('span');
            opening.className = 'xml-tag';
            opening.textContent = xmlNodeText(node);
            opening.title = opening.textContent;
            row.append(toggle, opening);
            if (node.el) row.addEventListener('click', () => selectHierarchyElement(node.el));
            hierTree.appendChild(row);

            if (!hasChildren) return;
            if (!expanded) {
                const collapsed = document.createElement('span');
                collapsed.className = 'xml-collapsed';
                collapsed.textContent = ` … </${node.xmlNode.tagName}>`;
                row.appendChild(collapsed);
                return;
            }
            node.children.forEach(append);
            const closing = document.createElement('div');
            closing.className = 'hier-xml-row xml-close';
            closing.style.paddingLeft = (4 + Math.min(node.depth, 8) * 13 + 18) + 'px';
            closing.textContent = xmlNodeText(node, true);
            hierTree.appendChild(closing);
        };
        hierarchyRoots.forEach(append);
    }

    function hierarchyAsText() {
        if (!currentXml) return '';
        try {
            const documentXml = new DOMParser().parseFromString(currentXml, 'application/xml');
            if (documentXml.querySelector('parsererror')) return '';
            const lines = [];
            const visit = (node, depth) => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                const className = node.getAttribute('class') || node.tagName;
                const label = node.getAttribute('resource-id') ||
                    node.getAttribute('content-desc') || node.getAttribute('text') || '';
                const bounds = node.getAttribute('bounds') || '';
                lines.push(`${'  '.repeat(depth)}<${className}>${label ? ` ${label}` : ''}${bounds ? ` ${bounds}` : ''}`);
                Array.from(node.children).forEach(child => visit(child, depth + 1));
            };
            visit(documentXml.documentElement, 0);
            return lines.join('\n');
        } catch {
            return '';
        }
    }

    function formatXml(xml) {
        try {
            const documentXml = new DOMParser().parseFromString(xml, 'application/xml');
            if (documentXml.querySelector('parsererror')) return xml;
            const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
            const visit = (node, depth) => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                const attributes = Array.from(node.attributes)
                    .map(attr => `${attr.name}="${attr.value.replace(/"/g, '&quot;')}"`).join(' ');
                const opening = `<${node.tagName}${attributes ? ' ' + attributes : ''}`;
                const children = Array.from(node.children);
                if (!children.length) {
                    lines.push(`${'  '.repeat(depth)}${opening}/>`);
                    return;
                }
                lines.push(`${'  '.repeat(depth)}${opening}>`);
                children.forEach(child => visit(child, depth + 1));
                lines.push(`${'  '.repeat(depth)}</${node.tagName}>`);
            };
            visit(documentXml.documentElement, 0);
            return lines.join('\n');
        } catch {
            return xml;
        }
    }

    function renderHierarchyMode() {
        if (hierarchyMode === 'xml') {
            lblHierarchyMode.textContent = '📋 XML source';
            if (!currentXml) {
                hierTree.innerHTML = '<span class="hier-hint">No hay XML cargado.</span>';
                return;
            }
            renderXmlRows();
            return;
        }
        lblHierarchyMode.textContent = '🌳 Hierarchy';
        renderHierarchyTree(currentXml);
        if (!parsedElements.length) {
            hierTree.innerHTML = '<span class="hier-hint">No se encontraron elementos con bounds.</span>';
        }
    }

    function setLocator(strategy, value) {
        cmbLocatorStrategy.value = strategy;
        txtLocatorValue.value = value;
    }

    function selectedLocator() {
        const value = txtLocatorValue.value.trim();
        const strategy = cmbLocatorStrategy.value;
        if (!value) return '';
        const prefixes = {
            accessibility: '~', id: 'id=', class: 'class=', xpath: '', android: 'android=',
            iosPredicate: 'iosPredicate=', iosClassChain: 'iosClassChain='
        };
        return prefixes[strategy] + value;
    }

    function setLocatorFromExplicit(selector) {
        if (selector.startsWith('~')) return setLocator('accessibility', selector.slice(1));
        if (selector.startsWith('id=')) return setLocator('id', selector.slice(3));
        if (selector.startsWith('class=')) return setLocator('class', selector.slice(6));
        if (selector.startsWith('android=')) return setLocator('android', selector.slice(8));
        if (selector.startsWith('iosPredicate=')) return setLocator('iosPredicate', selector.slice(13));
        if (selector.startsWith('iosClassChain=')) return setLocator('iosClassChain', selector.slice(14));
        setLocator('xpath', selector);
    }

    async function copyHierarchyContent(text, label) {
        if (!text) {
            lblXmlVerify.textContent = '— Primero carga el inspector';
            lblXmlVerify.className = 'verify-result err';
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            lblXmlVerify.textContent = `✓ ${label} copiado al portapapeles`;
            lblXmlVerify.className = 'verify-result ok';
        } catch {
            lblXmlVerify.textContent = `✗ No se pudo copiar el ${label.toLowerCase()}`;
            lblXmlVerify.className = 'verify-result err';
        }
    }

    function selectHierarchyElement(el) {
        if (!el) return;
        if (el.isIos && el.tag === 'XCUIElementTypeCell') {
            const childControls = parsedElements.filter(candidate =>
                candidate.isIos && candidate.isVisible &&
                /XCUIElementType(Button|Link|Switch|TextField|SecureTextField)/.test(candidate.tag) &&
                candidate.x1 >= el.x1 && candidate.x2 <= el.x2 &&
                candidate.y1 >= el.y1 && candidate.y2 <= el.y2
            ).sort((a, b) =>
                ((a.x2-a.x1) * (a.y2-a.y1)) - ((b.x2-b.x1) * (b.y2-b.y1))
            );
            if (childControls.length > 0) el = childControls[0];
        }
        selectedHierarchyElement = el;
        syncCanvas();
        const ctx = hierCanvas.getContext('2d');
        ctx.clearRect(0, 0, hierCanvas.width, hierCanvas.height);
        drawRect(el, '#FF6600', 'rgba(255,102,0,0.15)', 2.5);
        showAttrs(el);
        showNodeInTree(el);
        showXpathSuggestions(el);
        lblXmlVerify.textContent = '— Verifica antes de usar';
        lblXmlVerify.className   = 'verify-result';
    }

    function showXpathSuggestions(el) {
        hierXpathSug.innerHTML = '';
        if (!el) return;
        const IGNORED = ['android:id/content','android:id/navigationBarBackground'];
        const suggestions = [];

        if (el.isIos) {
            const name = el.iosName || '';
            const label = el.iosLabel || '';
            const value = el.iosValue || '';
            const identifier = name || label || value;
            const escaped = identifier.replace(/'/g, "\\'");
            const escapedChain = identifier.replace(/"/g, '\\"');
            const editable = /XCUIElementType(TextField|SecureTextField)/.test(el.tag);
            if (editable && !identifier && el.iosAncestorName) {
                const ancestorName = el.iosAncestorName.replace(/"/g, '\\"');
                suggestions.push({
                    label: 'XPath campo por contenedor accesible',
                    selector: '//' + (el.iosAncestorTag || 'XCUIElementTypeOther') +
                        '[@name="' + ancestorName + '"]//' + el.tag
                });
            }
            if (identifier && identifier.trim()) {
                suggestions.push({ label: 'Accessibility ID', selector: '~' + identifier });
                suggestions.push({ label: 'iOS Predicate String', selector: "iosPredicate=name == '" + escaped + "'" });
                suggestions.push({ label: 'iOS Class Chain', selector: 'iosClassChain=**/' + el.tag + '[`name == "' + escapedChain + '"`]' });
                suggestions.push({ label: 'XPath name', selector: '//' + el.tag + '[@name="' + identifier + '"]' });
            }
            if (label && label !== identifier) {
                suggestions.push({ label: 'iOS Predicate label', selector: "iosPredicate=label == '" + label.replace(/'/g, "\\'") + "'" });
            }
            if (editable) {
                suggestions.push({ label: 'iOS Class Chain editable', selector: 'iosClassChain=**/' + el.tag });
            }
            suggestions.push({ label: 'Class Name', selector: 'class=' + el.tag });
            suggestions.push({ label: 'XPath class', selector: '//' + el.tag });
        } else if (el.resourceId && !IGNORED.includes(el.resourceId)) {
            const isComposeId = !el.resourceId.includes('/') && !el.resourceId.includes(':');
            suggestions.push({
                label: isComposeId ? 'Compose resource-id' : 'ID',
                selector: isComposeId
                    ? '//*[@resource-id="' + el.resourceId + '"]'
                    : 'id=' + el.resourceId
            });
            const idOnly = el.resourceId.split('/')[1];
            if (idOnly) suggestions.push({ label: 'XPath id contains', selector: '//*[contains(@resource-id,"' + idOnly + '")]' });
        }
        if (!el.isIos && el.contentDesc) {
            suggestions.push({ label: 'Accessibility ID', selector: '~' + el.contentDesc });
        }
        if (!el.isIos && el.text && el.text.length > 0 && el.text.length < 60) {
            suggestions.push({ label: 'Android UIAutomator text', selector: 'android=new UiSelector().text("' + el.text + '")' });
            suggestions.push({ label: 'XPath text', selector: '//*[@text="' + el.text + '"]' });
            if (el.text.length > 4)
                suggestions.push({ label: 'XPath text contains', selector: '//*[contains(@text,"' + el.text.slice(0,20) + '")]' });
        }
        if (!el.isIos && el.className) {
            suggestions.push({ label: 'Class Name', selector: 'class=' + el.className });
            suggestions.push({ label: 'XPath class', selector: '//' + el.className });
        }

        suggestions.forEach(s => {
            const chip = document.createElement('div');
            chip.className = 'xpath-chip';
            chip.innerHTML = '<span class="chip-label">' + s.label + '</span>' +
                             '<span></span>';
            chip.lastElementChild.textContent = s.selector;
            chip.addEventListener('click', () => {
                setLocatorFromExplicit(s.selector);
                document.querySelectorAll('.xpath-chip').forEach(c => c.style.borderColor = '');
                chip.style.borderColor = '#7030A0';
            });
            hierXpathSug.appendChild(chip);
        });

        if (suggestions.length > 0) setLocatorFromExplicit(suggestions[0].selector);
    }

    async function openLegacyHierarchyInspector(warning) {
        if (inspectorActive) exitInspectorMode();
        if (interactionActive) exitInteractionMode();
        clearSelectorChips();
        clearSelectorCandidateBackups();
        state.selectedCatalogLocator = null;
        renderSelectedLocatorCoverage();
        xmlModal.style.display = 'flex';
        await refreshHierarchy();
        if (warning) {
            setInspect('⚠ ' + warning + ' Se abrió el inspector XML local.', 'err');
            setStatus('⚠ Appium Inspector no disponible; usando inspector XML local', '#CC7A00');
        }
    }

    async function openAppiumInspector() {
        const inspectorLaunch = await api.openInspector();
        if (!inspectorLaunch.success) {
            setInspect('✗ ' + (inspectorLaunch.error || 'No se pudo abrir Appium Inspector'), 'err');
            setStatus('✗ Error de Appium Inspector', '#CC0000');
            return;
        }
        if (inspectorLaunch.mode === 'legacy') {
            await openLegacyHierarchyInspector(
                inspectorLaunch.warning || 'Appium Inspector resolvió al modo legacy.'
            );
            return;
        }
        if (inspectorActive) exitInspectorMode();
        if (interactionActive) exitInteractionMode();
        setInspect('⏳ Usa “Usar en Recorder” para importar el selector confirmado', 'active');
        setStatus('🔍 Appium Inspector abierto', '#2E75B6');
    }

    async function refreshHierarchy() {
        hierTree.innerHTML    = '<span class="hier-hint">Cargando...</span>';
        hierAttrs.innerHTML   = '<span class="hier-hint">...</span>';
        hierXpathSug.innerHTML = '';
        selectedHierarchyElement = null;

        const [screenshotR, xmlR] = await Promise.all([
            api.getScreenshot(),
            api.getPageSource()
        ]);

        if (screenshotR.success) {
            hierImg.onload = () => syncCanvas();
            hierImg.src = screenshotR.screenshot;
        }

        if (xmlR.success) {
            currentXml     = xmlR.xml;
            parsedElements = parseElements(currentXml);

            // En iOS hay overlays visibles que reportan bounds fuera del viewport.
            // La aplicación visible es la referencia estable de la captura (393×852 en este caso).
            const visibleElements = parsedElements.filter(el => el.isVisible);
            const iosViewport = visibleElements.find(el =>
                el.isIos && el.tag === 'XCUIElementTypeApplication' && el.x1 === 0 && el.y1 === 0
            );
            const xmlDocument = new DOMParser().parseFromString(currentXml, 'application/xml');
            const hierarchyRoot = xmlDocument.documentElement?.tagName === 'hierarchy'
                ? xmlDocument.documentElement : null;
            const androidWidth = Number(hierarchyRoot?.getAttribute('width'));
            const androidHeight = Number(hierarchyRoot?.getAttribute('height'));
            // UiAutomator declara el viewport completo en <hierarchy>, incluyendo
            // las barras del sistema que aparecen en la captura.
            if (androidWidth > 0 && androidHeight > 0) {
                state.deviceW = androidWidth;
                state.deviceH = androidHeight;
            } else {
                state.deviceW = iosViewport ? iosViewport.x2 : Math.max(...visibleElements.map(el => el.x2), 1);
                state.deviceH = iosViewport ? iosViewport.y2 : Math.max(...visibleElements.map(el => el.y2), 1);
            }
            renderHierarchyMode();
        } else {
            hierTree.innerHTML = '<span style="color:#CC0000">Error cargando XML: ' + (xmlR.error || 'desconocido') + '</span>';
        }
    }

    function mount() {
        on(btnInteract, 'click', async () => {
            if (interactionActive) {
                exitInteractionMode();
                setInspect('— Interacción manual desactivada', '');
                setStatus('—', '#888AAA');
                return;
            }

            if (inspectorActive) exitInspectorMode();
            interactionActive = true;
            btnInteract.disabled = true;
            btnInteract.textContent = '⏳ Cargando...';
            setInspect('⏳ Preparando interacción manual...', 'active');

            try {
                await loadDeviceCoordinateSpace();
                if (!interactionActive) return;
                btnInteract.disabled = false;
                btnInteract.textContent = '✕ Salir';
                btnInteract.classList.add('mode-active');
                btnInspect.disabled = true;
                imgDevice.classList.add('manual-interaction');
                setInspect('👆 Clic para tap · arrastra para scroll o swipe', 'ok');
                setStatus('👆 Interacción manual activa', '#21B14B');

                const toDevicePoint = event => {
                    const rect = imgDevice.getBoundingClientRect();
                    return {
                        x: Math.round(((event.clientX - rect.left) / rect.width) * inspectorDimW),
                        y: Math.round(((event.clientY - rect.top) / rect.height) * inspectorDimH),
                    };
                };

                interactionDownFn = event => {
                    if (!interactionActive || interactionBusy) return;
                    event.preventDefault();
                    interactionStart = toDevicePoint(event);
                    imgDevice.setPointerCapture?.(event.pointerId);
                };

                interactionUpFn = async event => {
                    if (!interactionActive || interactionBusy || !interactionStart) return;
                    event.preventDefault();
                    const start = interactionStart;
                    const end = toDevicePoint(event);
                    interactionStart = null;
                    interactionBusy = true;
                    imgDevice.classList.add('busy');

                    const dx = end.x - start.x;
                    const dy = end.y - start.y;
                    const distance = Math.hypot(dx, dy);
                    const isDrag = distance >= Math.max(20, Math.min(inspectorDimW, inspectorDimH) * 0.025);
                    const gestureName = Math.abs(dy) >= Math.abs(dx) ? 'scroll' : 'swipe';
                    setInspect(
                        isDrag
                            ? '⏳ Ejecutando ' + gestureName + '...'
                            : '⏳ Tocando (' + end.x + ', ' + end.y + ')...',
                        'active'
                    );

                    const result = isDrag
                        ? await api.swipeFromTo(start.x, start.y, end.x, end.y)
                        : await api.tapAt(end.x, end.y);
                    if (!interactionActive) return;
                    if (result.success) {
                        if (result.screenshot) updateDeviceScreen(result.screenshot);
                        const completed = isDrag
                            ? (gestureName === 'scroll' ? 'Scroll' : 'Swipe')
                            : 'Tap';
                        setInspect('✓ ' + completed + ' ejecutado — puedes seguir interactuando', 'ok');
                        setStatus('✓ ' + completed + ' manual ejecutado', '#00CC00');
                    } else {
                        setInspect('✗ No se pudo ejecutar el gesto: ' + (result.error || 'Error desconocido'), 'err');
                        setStatus('✗ Error en gesto manual', '#CC0000');
                    }
                    interactionBusy = false;
                    imgDevice.classList.remove('busy');
                };
                interactionCancelFn = () => { interactionStart = null; };
                imgDevice.addEventListener('pointerdown', interactionDownFn);
                imgDevice.addEventListener('pointerup', interactionUpFn);
                imgDevice.addEventListener('pointercancel', interactionCancelFn);
            } catch (error) {
                exitInteractionMode();
                btnInteract.disabled = false;
                setInspect('✗ ' + error.message, 'err');
                setStatus('✗ No se pudo activar la interacción', '#CC0000');
            }
        });

        on(btnInspect, 'click', async () => {
            // Si ya está activo → cancelar
            if (inspectorActive) {
                exitInspectorMode();
                setInspect('— Inspección cancelada', '');
                setStatus('—', '#888AAA');
                return;
            }

            // Activar modo inspección
            if (interactionActive) exitInteractionMode();
            clearSelectorChips();
            clearSelectorCandidateBackups();
            state.selectedCatalogLocator = null;
            renderSelectedLocatorCoverage();
            txtSelector.value = '';
            txtVarName.value = state.currentAssignment?.name || '';
            if (txtElementContext) txtElementContext.value = '';
            state.verifiedSelector = '';
            setVerify('— Selecciona y verifica un elemento');
            updateAssignmentButton();
            inspectorActive        = true;
            btnInspect.textContent = '✕ Cancelar';
            setInspect('⏳ Cargando pantalla...', 'active');
            setStatus('📡 Obteniendo XML de la app...', '#FF6600');

            // Obtener screenshot + XML simultáneamente
            const [scrR, xmlR] = await Promise.all([
                api.getScreenshot(),
                api.getPageSource()
            ]);

            if (!inspectorActive) return; // fue cancelado durante el await

            if (!xmlR.success) {
                exitInspectorMode();
                setInspect('✗ Error al obtener XML: ' + (xmlR.error || 'desconocido'), 'err');
                setStatus('✗ Error', '#CC0000');
                return;
            }

            if (scrR.success) updateDeviceScreen(scrR.screenshot);

            // Parsear elementos y dimensiones del dispositivo
            inspectorElems = parseElements(xmlR.xml);
            const wm = xmlR.xml.match(/width="(\d+)"/);
            const hm = xmlR.xml.match(/height="(\d+)"/);
            inspectorDimW = wm ? parseInt(wm[1]) : (state.deviceW || 1080);
            inspectorDimH = hm ? parseInt(hm[1]) : (state.deviceH || 2340);

            if (inspectorElems.length === 0) {
                exitInspectorMode();
                setInspect('⚠ No se encontraron elementos con bounds en el XML', 'err');
                setStatus('⚠ Sin elementos', '#FF9900');
                return;
            }

            // Indicador visual: cursor crosshair + borde naranja
            imgDevice.style.cursor  = 'crosshair';
            imgDevice.style.outline = '2px solid #FF9900';
            setInspect('🎯 Haz click en el elemento que quieres inspeccionar (' + inspectorElems.length + ' elementos detectados)', 'active');
            setStatus('🎯 Modo inspección — click en la imagen', '#FF9900');

            // Handler de clic sobre la imagen del dispositivo
            inspectorClickFn = (e) => {
                if (!inspectorActive) return;

                const rect = imgDevice.getBoundingClientRect();
                const px   = Math.round(((e.clientX - rect.left) / rect.width)  * inspectorDimW);
                const py   = Math.round(((e.clientY - rect.top)  / rect.height) * inspectorDimH);

                // Elemento más pequeño que contiene el punto clickeado
                let best = null, bestArea = Infinity;
                inspectorElems.forEach(el => {
                    if (px >= el.x1 && px <= el.x2 && py >= el.y1 && py <= el.y2) {
                        const area = (el.x2 - el.x1) * (el.y2 - el.y1);
                        if (area < bestArea) { bestArea = area; best = el; }
                    }
                });

                exitInspectorMode();

                if (!best) {
                    setInspect('⚠ Sin elemento en esa zona — intenta en otra área', 'err');
                    setStatus('⚠ Sin elemento', '#FF9900');
                    return;
                }

                const candidates = buildCandidatesFromEl(best);
                clearSelectorChips();
                if (candidates.length === 0) {
                    setInspect('⚠ Elemento sin identificadores útiles — elige otro', 'err');
                    setStatus('⚠ Sin identificadores', '#FF9900');
                    return;
                }

                txtSelector.value = candidates[0].selector;
                clearInspectorCandidates();
                txtVarName.value  = state.currentAssignment?.name || '';
                state.verifiedSelector = '';
                if (candidates.length > 1) renderSelectorChips(candidates, txtVarName.value);
                renderAssignmentTarget();
                updateAssignmentButton();

                setInspect('✓ ' + candidates.length + ' identificador(es) — elige el mejor', 'ok');
                setStatus('✓ Elemento capturado', '#00CC00');
            };

            imgDevice.addEventListener('click', inspectorClickFn);
        });

        on(btnCopy, 'click', () => {
            navigator.clipboard.writeText(txtSelector.value);
            setStatus('📋 Copiado', '#2E75B6');
        });

        on(btnVerify, 'click', async () => {
            const selector = txtSelector.value.trim();
            if (!selector) { setVerify('⚠ Ingresa un selector', 'err'); return; }
            disableBtn(btnVerify, '⏳ Verificando...');
            const result = await api.verifySelector(selector);
            enableBtn(btnVerify);
            if (result.success) {
                if (result.screenshot) updateDeviceScreen(result.screenshot);
                state.verifiedSelector = selector;
                setVerify(result.summary, 'ok');
                setStatus('✓ Verificado', '#00CC00');
            } else {
                state.verifiedSelector = '';
                setVerify(result.summary, 'err');
                setStatus('✗ No encontrado', '#CC0000');
            }
            updateAssignmentButton();
        });

        on(txtSelector, 'input', () => {
            state.verifiedSelector = '';
            clearSelectorCandidateBackups();
            updateAssignmentButton();
        });

        ipcUnsubscribers.push(api.onInspectorConnected(() => {
            setInspect('✓ Inspector embebido conectado a la sesión', 'ok');
            setStatus('✓ Inspector listo', '#00CC00');
        }));

        ipcUnsubscribers.push(api.onInspectorError(message => {
            setInspect('✗ Inspector embebido: ' + message, 'err');
            setStatus('✗ Error del Inspector', '#CC0000');
        }));

        ipcUnsubscribers.push(api.onInspectorElementUsed(elementUsed => {
            if (inspectorActive) exitInspectorMode();
            clearSelectorChips();
            state.selectedCatalogLocator = null;
            renderSelectedLocatorCoverage();
            txtSelector.value = elementUsed.selector;
            txtVarName.value = state.currentAssignment?.name || txtVarName.value;
            state.verifiedSelector = elementUsed.selector;
            state.selectorCandidateToken = elementUsed.selectorCandidateToken || '';
            renderAssignmentTarget();
            updateAssignmentButton();
            setVerify('✓ Selector y backups revalidados contra la sesión activa', 'ok');
            setInspect(
                elementUsed.validationWarnings.length
                    ? `✓ Selector importado; ${elementUsed.validationWarnings.length} alternativa(s) omitida(s)`
                    : '✓ Selector usado explícitamente desde Appium Inspector',
                'ok'
            );
            setStatus('✓ Selector importado desde Appium Inspector', '#00CC00');
        }));

        on(btnXmlInspector, 'click', openAppiumInspector);

        on(btnRefreshXml, 'click', refreshHierarchy);
        on(btnCopyXml, 'click', () => { hierarchyMode = 'xml'; renderHierarchyMode(); });
        on(btnCopyTree, 'click', () => { hierarchyMode = 'tree'; renderHierarchyMode(); });
        on(btnCopyHierarchy, 'click', () => copyHierarchyContent(
            hierarchyMode === 'xml' ? currentXml : hierarchyAsText(),
            hierarchyMode === 'xml' ? 'XML completo' : 'árbol'
        ));

        on(btnCloseXml, 'click', () => {
            xmlModal.style.display = 'none';
            syncCanvas();
            hierCanvas.getContext('2d').clearRect(0, 0, hierCanvas.width, hierCanvas.height);
        });

        on(btnVerifyXpathM, 'click', async () => {
            const locator = selectedLocator();
            if (!locator) return;
            lblXmlVerify.textContent = '⏳ Verificando...';
            lblXmlVerify.className   = 'verify-result';
            const r = await api.verifySelector(locator);
            if (r.success) {
                lblXmlVerify.textContent = r.summary;
                lblXmlVerify.className   = 'verify-result ok';
            } else {
                lblXmlVerify.textContent = r.summary;
                lblXmlVerify.className   = 'verify-result err';
            }
        });

        on(btnUseXpath, 'click', () => {
            const locator = selectedLocator();
            if (!locator) return;
            clearSelectorChips();
            state.selectedCatalogLocator = null;
            renderSelectedLocatorCoverage();
            txtSelector.value = locator;
            const patterns = [
                /^id=[^/]+\/(.+)$/,
                /^id=(.+)$/,
                /^~(.+)$/,
                /@resource-id="[^"]*\/([^"]+)"/,
                /@resource-id="([^"]+)"/,
                /@content-desc="([^"]+)"/,
                /@text="([^"]+)"/
            ];
            for (const re of patterns) {
                const m = locator.match(re);
                if (m) {
                    txtVarName.value = m[1].toLowerCase()
                        .replace(/[^a-z0-9]/g, '_')
                        .replace(/_+/g, '_')
                        .replace(/^_|_$/g, '');
                    break;
                }
            }
            txtVarName.value = state.currentAssignment?.name || txtVarName.value;
            state.verifiedSelector = '';
            renderAssignmentTarget();
            updateAssignmentButton();
            xmlModal.style.display = 'none';
            setStatus('✓ Selector cargado desde Hierarchy Viewer', '#00CC00');
        });

        on(hierScreenWrap, 'click', e => {
            if (!parsedElements.length) return;
            const rect = hierImg.getBoundingClientRect();
            const px   = Math.round(((e.clientX - rect.left) / rect.width)  * state.deviceW);
            const py   = Math.round(((e.clientY - rect.top)  / rect.height) * state.deviceH);
            const el   = findElementAt(px, py);
            if (!el) return;

            selectHierarchyElement(el);
        });

        on(hierScreenWrap, 'mousemove', e => {
            if (!parsedElements.length) return;
            const rect = hierImg.getBoundingClientRect();
            const px   = Math.round(((e.clientX - rect.left) / rect.width)  * state.deviceW);
            const py   = Math.round(((e.clientY - rect.top)  / rect.height) * state.deviceH);
            const el   = findElementAt(px, py);

            syncCanvas();
            const ctx = hierCanvas.getContext('2d');
            ctx.clearRect(0, 0, hierCanvas.width, hierCanvas.height);
            if (el) drawRect(el, 'rgba(0,200,255,0.9)', 'rgba(0,200,255,0.06)', 1.5);
        });

        on(hierScreenWrap, 'mouseleave', () => {
            syncCanvas();
            const ctx = hierCanvas.getContext('2d');
            ctx.clearRect(0, 0, hierCanvas.width, hierCanvas.height);
            if (selectedHierarchyElement) {
                drawRect(selectedHierarchyElement, '#FF6600', 'rgba(255,102,0,0.15)', 2.5);
            }
        });
    }

    function unmount() {
        bound.forEach(({ target, type, handler, options }) => target?.removeEventListener?.(type, handler, options));
        bound.length = 0;
        ipcUnsubscribers.forEach(unsubscribe => unsubscribe?.());
        ipcUnsubscribers.length = 0;
        if (inspectorClickFn) imgDevice.removeEventListener('click', inspectorClickFn);
        if (interactionDownFn) imgDevice.removeEventListener('pointerdown', interactionDownFn);
        if (interactionUpFn) imgDevice.removeEventListener('pointerup', interactionUpFn);
        if (interactionCancelFn) imgDevice.removeEventListener('pointercancel', interactionCancelFn);
    }

    return {
        mount,
        unmount,
        openAppiumInspector,
        exitInspectorMode,
        exitInteractionMode,
        clearSelectorCapture,
        buildCandidatesFromEl,
        inferVarName,
        setVerify,
        setInspect,
    };
}
