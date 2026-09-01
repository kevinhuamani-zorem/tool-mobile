import fs from 'fs';
import path from 'path';
import {
    AgentContextQueryResults,
    AutomationScenario,
    GapResolution,
    GenerationPlan,
    ResolvedContext,
} from '../../automation/contracts';

export interface ReuseSelection {
    file: string;
    module: string;
    name: string;
}

function normalizeFile(value: string): string {
    return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function moduleFromLocatorFile(file: string): string {
    return normalizeFile(file)
        .replace(/^resources\/locators\//, '')
        .replace(/\.locator\.json$/i, '');
}

function sameCandidate(left: ReuseSelection, right: ReuseSelection): boolean {
    // `module` es una proyección derivada de `file` y distintos productores
    // históricos usan aliases como `home` y `home/home`. La autorización real
    // es la ruta exacta del artefacto más la clave; al materializar siempre se
    // conserva el candidato canónico ofrecido por el plan/query layer.
    return normalizeFile(left.file) === normalizeFile(right.file)
        && left.name === right.name;
}

function queryCandidates(
    queryResults: AgentContextQueryResults | undefined,
    gapId: string,
): ReuseSelection[] {
    const candidates: ReuseSelection[] = [];
    for (const result of queryResults?.results || []) {
        if (result.gapId !== gapId || result.status !== 'resolved') continue;
        const items = Array.isArray(result.data?.items) ? result.data!.items as Array<Record<string, unknown>> : [];
        for (const item of items) {
            if (item.type !== 'locator') continue;
            const file = normalizeFile(String(item.path || ''));
            const name = String(item.symbol || item.name || '').trim();
            const module = moduleFromLocatorFile(file);
            if (file && module && name) candidates.push({ file, module, name });
        }
    }
    return candidates;
}

function legacySelection(
    resolution: GapResolution,
    candidates: ReuseSelection[],
): ReuseSelection | undefined {
    const symbol = String(resolution.symbol || '').trim();
    if (!symbol) return undefined;
    const evidence = [symbol, ...(resolution.evidence || [])].join(' ');
    return candidates.find(candidate =>
        evidence.includes(candidate.name)
        && (
            evidence.includes(candidate.file)
            || evidence.includes(path.posix.basename(candidate.file))
            || evidence.includes(candidate.module)
        )
    );
}

function selectionFromExistingMethod(
    resolution: GapResolution,
    action: GenerationPlan['resolutions'][number],
    candidates: ReuseSelection[],
): ReuseSelection | undefined {
    const selected = resolution.selectedCandidate;
    const method = action.existingMethod;
    if (!selected || !method) return undefined;
    if (
        normalizeFile(selected.file) !== normalizeFile(method.file)
        || selected.name !== method.name
    ) return undefined;
    const backedByMethod = candidates.filter(candidate => method.locatorKeys.includes(candidate.name));
    // Solo se traduce automáticamente cuando el grafo deja una opción única.
    // Con más de una seguiría haciendo falta que el agente elija el locator.
    return backedByMethod.length === 1 ? backedByMethod[0] : undefined;
}

function adoptReuse(
    action: GenerationPlan['resolutions'][number],
    selected: ReuseSelection,
    reason?: string,
): void {
    action.resolution = 'reuse';
    action.locatorName = selected.name;
    action.source = {
        file: normalizeFile(selected.file),
        module: selected.module,
        scope: selected.module === 'home' || selected.module.startsWith('home/')
            ? 'home'
            : 'squad',
    };
    action.reason = reason || `Reutiliza ${selected.module}.${selected.name}`;
}

function normalizeIdentityValue(value: unknown): string {
    return String(value || '').normalize('NFC').trim();
}

function exactRecordedIdentity(
    packageDirectory: string,
    action: GenerationPlan['resolutions'][number],
    selected: ReuseSelection,
): boolean {
    const scenarioFile = path.join(packageDirectory, 'scenario.json');
    const contextFile = path.join(packageDirectory, 'resolved-context.json');
    if (!fs.existsSync(scenarioFile) || !fs.existsSync(contextFile)) return false;
    const scenario = JSON.parse(fs.readFileSync(scenarioFile, 'utf-8')) as AutomationScenario;
    const context = JSON.parse(fs.readFileSync(contextFile, 'utf-8')) as ResolvedContext;
    const declarations = (context.elementDeclarations || []) as Array<{
        module: string;
        elements: Array<{
            name: string;
            locators: Partial<Record<'android' | 'ios', { type?: string; value?: string }>>;
        }>;
    }>;
    const recorded = scenario.actions.find(item => item.sequence === action.sequence);
    const declaration = declarations
        .find(group => group.module === selected.module)
        ?.elements.find(element => element.name === selected.name)
        ?.locators[scenario.platform];
    if (!recorded || !declaration) return false;
    return normalizeIdentityValue(recorded.locatorType) === normalizeIdentityValue(declaration.type)
        && normalizeIdentityValue(recorded.locatorValue) === normalizeIdentityValue(declaration.value);
}

function weakAssertionOverride(gapId: string): boolean {
    return gapId.startsWith('gap-weak-assertion-');
}

function sameRecordingCreate(
    packageDirectory: string,
    plan: GenerationPlan,
    action: GenerationPlan['resolutions'][number],
    selected: ReuseSelection,
): boolean {
    const ownLocatorFile = plan.files.find(file => file.layer === 'locators')?.path;
    if (!ownLocatorFile
        || normalizeFile(selected.file) !== normalizeFile(ownLocatorFile)) return false;
    const source = plan.resolutions.find(item =>
        item.sequence !== action.sequence
        && item.resolution === 'create'
        && item.locatorName === selected.name
    );
    if (!source) return false;
    const scenarioFile = path.join(packageDirectory, 'scenario.json');
    if (!fs.existsSync(scenarioFile)) return false;
    const scenario = JSON.parse(fs.readFileSync(scenarioFile, 'utf-8')) as AutomationScenario;
    const currentAction = scenario.actions.find(item => item.sequence === action.sequence);
    const sourceAction = scenario.actions.find(item => item.sequence === source.sequence);
    return Boolean(currentAction && sourceAction
        && normalizeIdentityValue(currentAction.locatorType) === normalizeIdentityValue(sourceAction.locatorType)
        && normalizeIdentityValue(currentAction.locatorValue) === normalizeIdentityValue(sourceAction.locatorValue));
}

function readQueryResults(packageDirectory: string): AgentContextQueryResults | undefined {
    const file = path.join(packageDirectory, 'query-results.json');
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as AgentContextQueryResults;
}

function gapSequence(packageDirectory: string, gapId: string): number | undefined {
    const file = path.join(packageDirectory, 'gaps.json');
    if (fs.existsSync(file)) {
        const document = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
            gaps?: Array<{ id?: string; sequence?: number }>;
        };
        const sequence = document.gaps?.find(gap => gap.id === gapId)?.sequence;
        if (Number.isInteger(sequence)) return sequence;
    }
    // Compatibilidad con paquetes/fixtures anteriores a gaps.json proyectado.
    const suffix = gapId.match(/-(\d+)$/)?.[1];
    return suffix ? Number(suffix) : undefined;
}

/**
 * Aplica decisiones semánticas sobre una copia del plan inmutable.
 *
 * El LLM no genera código: elige un candidato estructurado. Solo candidatos
 * previamente ofrecidos por el resolver o devueltos por una consulta aceptada
 * pueden alterar el plan. Así el generador y el validador comparten una única
 * decisión efectiva en vez de reinterpretar `symbol` de forma independiente.
 */
export function effectiveGenerationPlan(
    packageDirectory: string,
    plan: GenerationPlan,
    gapResolutions: GapResolution[],
): GenerationPlan {
    const queryResults = readQueryResults(packageDirectory);
    const effective: GenerationPlan = JSON.parse(JSON.stringify(plan));
    for (const gapResolution of gapResolutions) {
        const sequence = gapSequence(packageDirectory, gapResolution.gapId);
        const action = effective.resolutions.find(item =>
            item.gapId === gapResolution.gapId
            || (sequence !== undefined && item.sequence === sequence)
        );
        if (gapResolution.decision === 'create' && weakAssertionOverride(gapResolution.gapId) && action) {
            const offered = action.reuseCandidates || [];
            const methodCandidates = action.existingMethod
                ? offered.filter(candidate => action.existingMethod!.locatorKeys.includes(candidate.name))
                : [];
            // Un selector débil no se duplica: si el grafo demuestra un único
            // resultado observable, se adopta para evitar crear un XPath
            // genérico que solo satisfaga formalmente el Then.
            if (methodCandidates.length === 1) {
                adoptReuse(
                    action,
                    methodCandidates[0],
                    `Aserción fortalecida con ${methodCandidates[0].module}.${methodCandidates[0].name}.`,
                );
            }
            continue;
        }
        if (gapResolution.decision === 'replace-existing') {
            if (!action) {
                throw new Error(
                    `Reemplazo inválido: ${gapResolution.gapId} no está asociado a una acción del plan.`,
                );
            }
            const selected = gapResolution.selectedCandidate;
            const replacement = gapResolution.replacement;
            if (!selected || !replacement) {
                throw new Error(
                    `Reemplazo inválido para ${gapResolution.gapId}: faltan selectedCandidate o replacement.`,
                );
            }
            const offered = [
                ...(action.reuseCandidates || []),
                ...queryCandidates(queryResults, gapResolution.gapId),
            ];
            const authorized = offered.find(candidate => sameCandidate(candidate, selected));
            if (!authorized) {
                throw new Error(
                    `Reemplazo inválido para ${gapResolution.gapId}: `
                    + `${selected.file}#${selected.name} no fue ofrecido por el plan ni por findLocator.`,
                );
            }
            const scenarioFile = path.join(packageDirectory, 'scenario.json');
            if (!fs.existsSync(scenarioFile)) {
                throw new Error('Reemplazo inválido: falta scenario.json con la evidencia del recording.');
            }
            const scenario = JSON.parse(fs.readFileSync(scenarioFile, 'utf-8')) as AutomationScenario;
            const recorded = scenario.actions.find(item => item.sequence === replacement.sequence);
            if (!recorded
                || replacement.sequence !== action.sequence
                || replacement.platform !== scenario.platform) {
                throw new Error(
                    `Reemplazo inválido para ${gapResolution.gapId}: platform/sequence no corresponde `
                    + 'a la acción grabada.',
                );
            }
            if (!recorded.locatorType || !recorded.locatorValue) {
                throw new Error(
                    `Reemplazo inválido para ${gapResolution.gapId}: la acción no contiene `
                    + 'TypeLocator y valor verificados.',
                );
            }
            const ownLocatorFile = effective.files.find(file => file.layer === 'locators')?.path;
            if (!ownLocatorFile || normalizeFile(ownLocatorFile) !== normalizeFile(authorized.file)) {
                throw new Error(
                    `Reemplazo inválido para ${gapResolution.gapId}: ${authorized.file} no es `
                    + 'el archivo de locators update planificado para este caso.',
                );
            }
            // Se materializa como create sobre la clave existente: así el
            // generador usa exclusivamente selector/estrategia del recording,
            // mientras locatorReplacement autoriza reemplazar getter y JSON.
            action.resolution = 'create';
            action.locatorName = authorized.name;
            delete action.source;
            action.locatorReplacement = {
                file: normalizeFile(authorized.file),
                module: authorized.module,
                name: authorized.name,
                platform: replacement.platform,
                sequence: replacement.sequence,
            };
            action.reason = gapResolution.reason
                || `QA autorizó reemplazar ${authorized.module}.${authorized.name} con la evidencia grabada.`;
            continue;
        }
        if (gapResolution.decision !== 'reuse') continue;
        if (!action) {
            throw new Error(`Reuse inválido: ${gapResolution.gapId} no está asociado a una acción del plan.`);
        }
        const offered = [
            ...(action.reuseCandidates || []),
            ...queryCandidates(queryResults, gapResolution.gapId),
        ];
        const selected = selectionFromExistingMethod(gapResolution, action, offered)
            || gapResolution.selectedCandidate
            || legacySelection(gapResolution, offered);
        if (!selected) {
            throw new Error(
                `Reuse inválido para ${gapResolution.gapId}: falta selectedCandidate estructurado.`,
            );
        }
        if (sameRecordingCreate(packageDirectory, effective, action, selected)) {
            action.locatorName = selected.name;
            action.reason = `Reutiliza la nueva clave ${selected.name} creada una sola vez dentro del recording.`;
            continue;
        }
        const authorized = offered.find(candidate => sameCandidate(candidate, selected));
        if (!authorized) {
            throw new Error(
                `Reuse inválido para ${gapResolution.gapId}: `
                + `${selected.file}#${selected.name} no fue ofrecido por el plan ni por findLocator.`,
            );
        }
        const alreadyAdopted = action.resolution === 'reuse'
            && action.source
            && action.locatorName === authorized.name
            && normalizeFile(action.source.file) === normalizeFile(authorized.file);
        if (!alreadyAdopted
            && !weakAssertionOverride(gapResolution.gapId)
            && !exactRecordedIdentity(packageDirectory, action, authorized)) {
            action.reason =
                `No se reutiliza ${authorized.module}.${authorized.name}: el par `
                + '(TypeLocator, valor normalizado) difiere del locator verificado por el recorder.';
            continue;
        }
        adoptReuse(action, authorized, gapResolution.reason);
    }
    return effective;
}
