// [visual-recorder] Feature "generation": preview/generación determinista
// heredada (cuatro capas sin agente) y el "code review workspace" compartido
// con la revisión de una propuesta de automatización. Ver
// docs/ARCHITECTURE.md y docs/GENERATION_CONTRACT.md.
//
// Dueña de `state.previewDocuments`, `state.lastPreviewToken` y
// `state.activePreviewDocumentIndex`: la feature `review` los consume a
// través de la API expuesta aquí (`showPreviewDocuments`, `getReviewedContents`,
// `invalidatePreview`) en vez de duplicarlos.

import { disableBtn, enableBtn, escapeHtml } from '../shared/domHelpers.js';

/**
 * @param {object} deps
 * @param {Window['api']} deps.api
 * @param {object} deps.state
 * @param {(msg: string, color?: string) => void} deps.setStatus
 * @param {() => Promise<void>} deps.reloadSquadCatalogAfterGenerate refresca catálogos tras generar (dueño: configuration/platform-completion).
 * @param {() => boolean} deps.isAutomationWorkflow true cuando el preview activo viene del pipeline con agente (dueño: review).
 * @param {() => boolean} deps.hasInvalidAutomationDraft dueño: review.
 * @param {() => Promise<any>} deps.revalidateReviewedAutomation dueño: review.
 * @param {(preserveReviewed: boolean) => Promise<any>} deps.importAutomationResponse dueño: review.
 */
export function createGenerationFeature(deps) {
    const {
        api, state, setStatus, reloadSquadCatalogAfterGenerate,
        isAutomationWorkflow, revalidateReviewedAutomation, importAutomationResponse,
    } = deps;

    const cmbFrameworkSquad = document.getElementById('cmbFrameworkSquad');
    const cmbFrameworkFeatureScope = document.getElementById('cmbFrameworkFeatureScope');
    const txtFeature      = document.getElementById('txtFeature');
    const txtScenario     = document.getElementById('txtScenario');
    const txtCaseId       = document.getElementById('txtCaseId');
    const cmbPathType     = document.getElementById('cmbPathType');
    const txtFeatureTag   = document.getElementById('txtFeatureTag');
    const txtFeatureFile  = document.getElementById('txtFeatureFile');
    const txtLocatorModule = document.getElementById('txtLocatorModule');
    const txtDataName     = document.getElementById('txtDataName');
    const btnPreview      = document.getElementById('btnPreview');
    const btnGenerate     = document.getElementById('btnGenerate');
    const lblGenerate     = document.getElementById('lblGenerateResult');
    const txtGherkin      = document.getElementById('txtGherkin');
    const cmbPreviewFile  = document.getElementById('cmbPreviewFile');
    const codeReviewWorkspace = document.getElementById('codeReviewWorkspace');
    const codeFileTree = document.getElementById('codeFileTree');
    const lblCodeFileName = document.getElementById('lblCodeFileName');
    const lblCodeFilePath = document.getElementById('lblCodeFilePath');
    const lblCodeFileState = document.getElementById('lblCodeFileState');
    const lblCodeValidation = document.getElementById('lblCodeValidation');
    const btnCopyCode = document.getElementById('btnCopyCode');
    const btnCopyCodePath = document.getElementById('btnCopyCodePath');
    const btnResetCode = document.getElementById('btnResetCode');
    const lblGenerationFileCount = document.getElementById('lblGenerationFileCount');

    const GENERATED_FILES_STORAGE_KEY = 'appiumVisualRecorder.generatedFiles.v1';

    const bound = [];
    function on(target, type, handler, options) {
        if (!target) return;
        target.addEventListener(type, handler, options);
        bound.push({ target, type, handler, options });
    }

    function setGenerate(msg, type) {
        if (!lblGenerate) return;
        lblGenerate.textContent = msg;
        lblGenerate.className = 'generate-result review-generation-result' + (type ? ' ' + type : '');
    }

    function rememberGeneratedFiles(files) {
        let history = [];
        try {
            const stored = JSON.parse(localStorage.getItem(GENERATED_FILES_STORAGE_KEY) || '[]');
            if (Array.isArray(stored)) history = stored;
        } catch {
            history = [];
        }
        history.unshift({
            generatedAt: new Date().toISOString(),
            squad: cmbFrameworkSquad.value || 'payment',
            files
        });
        localStorage.setItem(GENERATED_FILES_STORAGE_KEY, JSON.stringify(history.slice(0, 20)));
    }

    function buildGenerationRequest() {
        return {
            squad: cmbFrameworkSquad.value,
            featureScope: cmbFrameworkFeatureScope?.value || '',
            featureName: txtFeature.value.trim(),
            scenarioName: txtScenario.value.trim(),
            fileName: txtFeatureFile.value.trim(),
            locatorModule: txtLocatorModule.value.trim(),
            caseId: txtCaseId.value.trim(),
            pathType: cmbPathType.value,
            tag: txtFeatureTag.value.trim(),
            dataName: txtDataName.value.trim()
        };
    }

    function buildPreparedGenerationRequest() {
        const request = buildGenerationRequest();
        if (state.linkedScenarioData) {
            request.examples = state.linkedScenarioData.examples || {};
            request.scenarioRows = state.linkedScenarioData.stepRows.map(row => ({
                ...row,
                status: row.status || 'missing',
                actions: state.linkedScenarioData.linked[row.text] || []
            }));
        }
        return request;
    }

    function invalidatePreview() {
        state.lastPreviewToken = '';
        state.previewDocuments = [];
        state.activePreviewDocumentIndex = -1;
        if (cmbPreviewFile) cmbPreviewFile.style.display = 'none';
        if (codeReviewWorkspace) codeReviewWorkspace.style.display = 'none';
        if (codeFileTree) codeFileTree.innerHTML = '';
    }

    function previewLayer(document) {
        const file = document.path.split(/[\\/]/).pop() || document.path;
        if (file.endsWith('.feature')) return { key: 'feature', label: '🥒 Feature' };
        if (file.endsWith('.steps.ts')) return { key: 'steps', label: '🔗 Steps' };
        if (file.endsWith('.screen.ts')) return { key: 'screen', label: '📱 Screen Object' };
        if (file.endsWith('.locator.json')) return { key: 'locators', label: '🎯 Locators' };
        if (file.endsWith('.json')) return { key: 'data', label: '🗃 JSON' };
        return { key: 'other', label: '📄 Otros' };
    }

    function validatePreviewDocument(document) {
        const file = document.path.toLowerCase();
        const content = document.content;
        if (!content.trim()) return { valid: false, message: '✕ El archivo está vacío' };
        if (file.endsWith('.json')) {
            try {
                JSON.parse(content);
                return { valid: true, message: '✓ JSON válido' };
            } catch (error) {
                return { valid: false, message: `✕ JSON inválido: ${error.message}` };
            }
        }
        if (file.endsWith('.feature')) {
            if (!/^Feature:\s+\S+/m.test(content)) {
                return { valid: false, message: '✕ Falta la declaración Feature' };
            }
            if (!/Scenario(?: Outline)?:\s+\[TC-\d+\]/.test(content)) {
                return { valid: false, message: '✕ Scenario sin identificador TC válido' };
            }
            return { valid: true, message: '✓ Estructura Gherkin válida' };
        }
        if (file.endsWith('.ts')) {
            const pairs = [['{', '}'], ['(', ')'], ['[', ']']];
            const unbalanced = pairs.some(([open, close]) =>
                [...content].filter(char => char === open).length !==
                [...content].filter(char => char === close).length
            );
            return unbalanced
                ? { valid: false, message: '✕ TypeScript contiene delimitadores incompletos' }
                : { valid: true, message: '✓ TypeScript listo para validación final' };
        }
        return { valid: true, message: '✓ Contenido disponible' };
    }

    function updatePreviewDocumentState() {
        const document = state.previewDocuments[state.activePreviewDocumentIndex];
        if (!document) return;
        const modified = document.content !== document.originalContent;
        const validation = validatePreviewDocument(document);
        lblCodeFileState.textContent = modified
            ? '✎ Editado'
            : document.generated ? '✓ Generado' : '● Nuevo';
        lblCodeFileState.className =
            `code-file-state${modified ? ' edited' : document.generated ? ' generated' : ''}`;
        lblCodeValidation.textContent = validation.message;
        lblCodeValidation.className = validation.valid ? 'ok' : 'err';
        const button = codeFileTree?.querySelector(
            `[data-preview-index="${state.activePreviewDocumentIndex}"]`
        );
        if (button) {
            button.classList.toggle('modified', modified);
            button.classList.toggle('invalid', !validation.valid);
            const stateIcon = button.querySelector('.code-file-item-state');
            if (stateIcon) {
                stateIcon.textContent = !validation.valid
                    ? '✕'
                    : modified ? '✎' : document.generated ? '✓' : '●';
            }
        }
    }

    function renderPreviewFileTree() {
        if (!codeFileTree) return;
        codeFileTree.innerHTML = '';
        const groups = new Map();
        state.previewDocuments.forEach((document, index) => {
            const layer = previewLayer(document);
            if (!groups.has(layer.key)) groups.set(layer.key, { ...layer, documents: [] });
            groups.get(layer.key).documents.push({ document, index });
        });
        groups.forEach(group => {
            const section = document.createElement('section');
            section.className = 'code-file-group';
            const title = document.createElement('div');
            title.className = 'code-file-group-title';
            title.textContent = group.label;
            section.appendChild(title);
            group.documents.forEach(({ document: previewDocument, index }) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'code-file-item';
                button.dataset.previewIndex = String(index);
                const fileName = previewDocument.path.split(/[\\/]/).pop();
                button.innerHTML =
                    `<span class="code-file-item-state">●</span>` +
                    `<span><strong>${escapeHtml(fileName)}</strong>` +
                    `<small>${escapeHtml(previewDocument.path)}</small></span>`;
                button.addEventListener('click', () => showPreviewDocument(index));
                section.appendChild(button);
            });
            codeFileTree.appendChild(section);
        });
    }

    function showPreviewDocument(index) {
        const document = state.previewDocuments[index];
        if (!document || !txtGherkin) return;
        state.activePreviewDocumentIndex = index;
        cmbPreviewFile.value = String(index);
        txtGherkin.value = document.content;
        lblCodeFileName.textContent = document.path.split(/[\\/]/).pop() || document.path;
        lblCodeFilePath.textContent = document.path;
        lblCodeFilePath.title = document.path;
        codeFileTree?.querySelectorAll('.code-file-item').forEach(item =>
            item.classList.toggle('active', Number(item.dataset.previewIndex) === index)
        );
        updatePreviewDocumentState();
    }

    async function refreshGenerationPreview(preserveReviewed = false) {
        const reviewedByPath = preserveReviewed
            ? new Map(state.previewDocuments.map(document => [document.path, document.content]))
            : new Map();
        const r = await api.previewFwkFiles(buildPreparedGenerationRequest());
        if (r.success && txtGherkin) {
            state.lastPreviewToken = r.previewToken;
            const proposedDocuments = [
                { path: r.preview.featurePath, content: r.preview.featureContent },
                ...(r.preview.locatorPath
                    ? [{ path: r.preview.locatorPath, content: r.preview.locatorContent }]
                    : []),
                ...(r.preview.stepPath
                    ? [{ path: r.preview.stepPath, content: r.preview.stepContent }]
                    : []),
                ...(r.preview.screenPath
                    ? [{ path: r.preview.screenPath, content: r.preview.screenContent }]
                    : [])
            ];
            state.previewDocuments = proposedDocuments.map(document => ({
                ...document,
                originalContent: document.content,
                content: reviewedByPath.has(document.path)
                    ? reviewedByPath.get(document.path)
                    : document.content
            }));
            cmbPreviewFile.innerHTML = '';
            state.previewDocuments.forEach((previewDocument, index) => {
                const option = document.createElement('option');
                option.value = String(index);
                option.textContent = previewDocument.path;
                cmbPreviewFile.appendChild(option);
            });
            cmbPreviewFile.style.display = 'none';
            codeReviewWorkspace.style.display = 'grid';
            renderPreviewFileTree();
            showPreviewDocument(0);
            if (lblGenerationFileCount) {
                const edited = state.previewDocuments.filter(document =>
                    document.content !== document.originalContent
                ).length;
                lblGenerationFileCount.textContent =
                    `${state.previewDocuments.length} archivo(s) revisados` +
                    `${edited ? ` · ${edited} editado(s)` : ''}.`;
            }

            const problems = [
                ...r.validation.errors,
                ...r.validation.conflicts.map(file => `Conflicto: ${file}`)
            ];
            if (problems.length > 0) {
                setGenerate('✗ ' + problems.join(' | '), 'err');
            } else {
                const warnings = r.validation.warnings.length
                    ? ` · ${r.validation.warnings.join(' | ')}`
                    : '';
                const updates = r.managedUpdates
                    ? ` · ${r.managedUpdates} archivo(s) administrado(s) se actualizarán`
                    : '';
                setGenerate(`✓ Revisar ${r.preview.files.length} archivo(s)${updates}${warnings}`, 'ok');
            }
        } else {
            setGenerate('✗ ' + r.error, 'err');
        }
        return r;
    }

    /** Muestra un preview producido por el pipeline con agente (dueño: review). */
    function showPreviewDocuments(result, preserveReviewed = false, valid = true) {
        const reviewedByPath = preserveReviewed
            ? new Map(state.previewDocuments.map(document => [document.path, document.content]))
            : new Map();
        state.lastPreviewToken = result.previewToken || '';
        const proposedDocuments = [
            { path: result.preview.featurePath, content: result.preview.featureContent },
            ...(result.preview.locatorPath ? [{ path: result.preview.locatorPath, content: result.preview.locatorContent }] : []),
            ...(result.preview.stepPath ? [{ path: result.preview.stepPath, content: result.preview.stepContent }] : []),
            ...(result.preview.screenPath ? [{ path: result.preview.screenPath, content: result.preview.screenContent }] : [])
        ];
        state.previewDocuments = proposedDocuments.map(document => ({
            ...document,
            originalContent: document.content,
            content: reviewedByPath.get(document.path) ?? document.content
        }));
        cmbPreviewFile.innerHTML = '';
        state.previewDocuments.forEach((previewDocument, index) => {
            const option = document.createElement('option');
            option.value = String(index);
            option.textContent = previewDocument.path;
            cmbPreviewFile.appendChild(option);
        });
        codeReviewWorkspace.style.display = 'grid';
        renderPreviewFileTree();
        showPreviewDocument(0);
        if (valid) {
            enableBtn(btnGenerate);
            lblGenerationFileCount.textContent = `${state.previewDocuments.length} archivo(s) validados al 100%.`;
            setGenerate(`✓ Propuesta válida · ${state.previewDocuments.length} capas · lista para revisión`, 'ok');
        } else {
            btnGenerate.disabled = true;
            lblGenerationFileCount.textContent =
                `${state.previewDocuments.length} archivo(s) recuperados · edítalos y pulsa Revalidar.`;
            setGenerate('✗ La propuesta anterior debe revalidarse antes de aplicar.', 'err');
        }
    }

    function getReviewedContents() {
        return Object.fromEntries(
            state.previewDocuments.map(document => [document.path, document.content])
        );
    }

    function mount() {
        [
            txtFeature, txtScenario, txtCaseId, cmbPathType,
            txtFeatureTag, txtFeatureFile, txtLocatorModule, txtDataName
        ].filter(Boolean).forEach(field => {
            on(field, 'input', invalidatePreview);
            on(field, 'change', invalidatePreview);
        });

        on(cmbPreviewFile, 'change', () => {
            showPreviewDocument(Number(cmbPreviewFile.value));
        });

        on(txtGherkin, 'input', () => {
            const document = state.previewDocuments[state.activePreviewDocumentIndex];
            if (!document) return;
            document.content = txtGherkin.value;
            updatePreviewDocumentState();
        });

        on(btnCopyCode, 'click', async () => {
            const document = state.previewDocuments[state.activePreviewDocumentIndex];
            if (!document) return;
            await navigator.clipboard.writeText(document.content);
            lblCodeValidation.textContent = '✓ Contenido copiado';
            lblCodeValidation.className = 'ok';
        });

        on(btnCopyCodePath, 'click', async () => {
            const document = state.previewDocuments[state.activePreviewDocumentIndex];
            if (!document) return;
            await navigator.clipboard.writeText(document.path);
            lblCodeValidation.textContent = '✓ Ruta copiada';
            lblCodeValidation.className = 'ok';
        });

        on(btnResetCode, 'click', () => {
            const document = state.previewDocuments[state.activePreviewDocumentIndex];
            if (!document) return;
            document.content = document.originalContent;
            txtGherkin.value = document.content;
            updatePreviewDocumentState();
        });

        on(btnPreview, 'click', async () => {
            if (isAutomationWorkflow() && deps.hasInvalidAutomationDraft()) await revalidateReviewedAutomation();
            else if (isAutomationWorkflow()) await importAutomationResponse(false);
            else await refreshGenerationPreview();
        });

        on(btnGenerate, 'click', async () => {
            disableBtn(btnGenerate, '⏳ Generando...');
            if (isAutomationWorkflow()) {
                const invalidDocuments = state.previewDocuments
                    .map(document => ({ document, validation: validatePreviewDocument(document) }))
                    .filter(item => !item.validation.valid);
                if (invalidDocuments.length) {
                    setGenerate('✕ Corrige los archivos inválidos antes de generar.', 'err');
                    enableBtn(btnGenerate);
                    return;
                }
                const reviewedContents = getReviewedContents();
                const result = await api.generateAutomationResponse(state.lastPreviewToken, reviewedContents);
                enableBtn(btnGenerate);
                if (!result.success) {
                    setGenerate('✗ ' + result.error, 'err');
                    return;
                }
                rememberGeneratedFiles(result.generated.files);
                setGenerate(
                    `✓ ${result.generated.files.length} archivos generados · memoria v${result.memoryVersion} validada al 100%`,
                    'ok'
                );
                state.previewDocuments.forEach(document => {
                    document.originalContent = document.content;
                    document.generated = true;
                });
                renderPreviewFileTree();
                return;
            }
            // El estado del filesystem puede cambiar después de abrir la revisión.
            // Reconstruye el preview para no conservar conflictos de archivos ya eliminados.
            const currentPreview = await refreshGenerationPreview(true);
            if (
                !currentPreview.success ||
                currentPreview.validation.errors.length > 0 ||
                currentPreview.validation.conflicts.length > 0
            ) {
                enableBtn(btnGenerate);
                return;
            }
            const invalidDocuments = state.previewDocuments
                .map(document => ({ document, validation: validatePreviewDocument(document) }))
                .filter(item => !item.validation.valid);
            if (invalidDocuments.length > 0) {
                setGenerate(
                    '✕ Corrige los archivos inválidos: ' +
                    invalidDocuments.map(item => item.document.path.split(/[\\/]/).pop()).join(', '),
                    'err'
                );
                enableBtn(btnGenerate);
                return;
            }

            const request = buildPreparedGenerationRequest();
            const reviewedContents = getReviewedContents();
            const r = await api.generateFwkFiles(request, state.lastPreviewToken, reviewedContents);
            enableBtn(btnGenerate);
            if (r.success) {
                const paths = r.generated.files.join(' | ');
                rememberGeneratedFiles(r.generated.files);
                setGenerate('✓ ' + paths, 'ok');
                state.linkedScenarioData = null;
                state.previewDocuments.forEach(document => {
                    document.originalContent = document.content;
                    document.generated = true;
                });
                renderPreviewFileTree();
                showPreviewDocument(Math.max(0, state.activePreviewDocumentIndex));
                lblCodeFileState.textContent = '✓ Generado';
                lblCodeFileState.className = 'code-file-state generated';
                if (lblGenerationFileCount) {
                    lblGenerationFileCount.textContent =
                        `✓ ${state.previewDocuments.length} archivo(s) generados. ` +
                        'Puedes seleccionarlos y copiar su contenido.';
                }
                await reloadSquadCatalogAfterGenerate();
                setStatus('✓ Archivos generados · catálogos de Steps y locators actualizados', '#00CC00');
            } else {
                setGenerate('✗ ' + r.error, 'err');
            }
        });
    }

    function unmount() {
        bound.forEach(({ target, type, handler, options }) => target?.removeEventListener?.(type, handler, options));
        bound.length = 0;
    }

    return {
        mount,
        unmount,
        invalidatePreview,
        buildGenerationRequest,
        buildPreparedGenerationRequest,
        refreshGenerationPreview,
        showPreviewDocuments,
        getReviewedContents,
        validatePreviewDocument,
        setGenerate,
    };
}
