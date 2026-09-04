/**
 * Reutilización exacta de locators y steps existentes: identidad
 * TypeLocator+selector, steps cuyo cuerpo usa los mismos locators, colisiones
 * con steps del framework y candidatos de reutilización ordenados.
 */
import crypto from 'crypto';
import path from 'path';
import {
    ActionResolution,
    AutomationScenario,
    FrameworkReuseCandidate,
    GenerationRequest,
    SelectorCandidateStability,
} from '../../contracts';
import { FeatureScenarioInfo, LocatorInfo, SquadReuseCatalog, StepDefinitionInfo, inferredStrategy, strategyOf, strategyValue } from '../../../indexing';
import {
    canonicalStepExpression as canonicalStepExpressionShared,
    normalizeStepText as normalizeStepTextShared,
} from '../../../shared';
import { selectorAliases, titleFromSlug } from './naming';

/**
 * Reutiliza un locator existente SOLO si coinciden la estrategia TypeLocator y
 * el valor normalizado del selector. El nombre lógico propuesto por el recorder
 * no forma parte de la identidad: al reutilizar se adopta la clave existente.
 *
 * Antes comparaba cadenas normalizadas quitando el prefijo, asi que `~Tapp`
 * (accessibility id) y un valor `Tapp` declarado como XPATH colapsaban al mismo
 * alias. Que dos locators compartan el texto no prueba que el identificador
 * funcione para este caso: si el tipo difiere, es otro selector.
 *
 * Cuando ningun Screen Object declara la estrategia de una clave no se puede
 * afirmar nada, y no afirmar es no reutilizar. Ese candidato igual llega al QA
 * por el gap de duplicado.
 */
export function exactLocators(
    catalog: SquadReuseCatalog,
    selector: string
): Array<{ locator: LocatorInfo; strategy: string }> {
    const wantedStrategy = strategyOf(selector, catalog.platform);
    const wantedValue = strategyValue(selector);
    if (!wantedValue) return [];
    return catalog.locators.flatMap(locator => {
        if (locator.scope !== 'squad' && locator.scope !== 'home') return [];
        const value = catalog.platform === 'ios' ? locator.iosSelector : locator.androidSelector;
        if (strategyValue(value) !== wantedValue) return [];
        // La declaracion del getter manda; si no existe, solo vale cuando el
        // valor determina la estrategia por si mismo.
        const declared = (catalog.platform === 'ios' ? locator.iosStrategy : locator.androidStrategy)
            || inferredStrategy(value);
        if (!declared || declared !== wantedStrategy) return [];
        return [{ locator, strategy: declared }];
    });
}

export const REUSE_SCOPE_ORDER: Record<'squad' | 'home', number> = { squad: 0, home: 1 };
export const CANDIDATE_STABILITY_ORDER: Record<SelectorCandidateStability, number> = {
    stable: 0,
    contextual: 1,
    structural: 2,
    manual: 3,
};

export function normalizeStepText(value: string): string {
    return normalizeStepTextShared(value);
}

export function stepSimilarity(left: string[], right: string[]): number {
    const a = new Set(left.map(normalizeStepText).filter(Boolean));
    const b = new Set(right.map(normalizeStepText).filter(Boolean));
    if (!a.size || !b.size) return 0;
    const common = [...a].filter(step => b.has(step)).length;
    return (2 * common) / (a.size + b.size);
}

export function collidesWithFrameworkStep(
    text: string,
    definitions: SquadReuseCatalog['stepDefinitions'],
): boolean {
    const canonical = canonicalStepExpressionShared(text);
    return definitions.some(definition => {
        if (canonicalStepExpressionShared(definition.expression) === canonical) return true;
        try {
            return new RegExp(definition.expression).test(text);
        } catch {
            return false;
        }
    });
}

/** Texto literal de una expresion `^...$` sin metacaracteres; undefined si captura parametros. */
export function literalStepText(expression: string): string | undefined {
    const inner = String(expression || '').replace(/^\^/, '').replace(/\$$/, '');
    if (/[()[\]{}*+?|\\]/.test(inner)) return undefined;
    return inner.trim().replace(/\s+/g, ' ');
}

/**
 * Reutiliza un step definition existente en vez de sufijar el texto.
 *
 * Sufijar ("... en contenedor movimientos casuisticas filtro") evita la
 * colision pero deja dos definiciones que hacen lo mismo. Reutilizar solo es
 * seguro con evidencia, no por el texto: el step existente tiene que invocar
 * metodos de Screen Object cuyos locators sean exactamente los que este caso
 * ya resolvio como `reuse` para esa fila. Ni uno mas (el step haria cosas que
 * no se grabaron) ni uno menos (el step no cubriria lo grabado).
 */
export function existingStepFor(
    row: NonNullable<GenerationRequest['scenarioRows']>[number],
    catalog: SquadReuseCatalog,
    resolutions: ActionResolution[],
): { text: string; methodName?: string; definition: StepDefinitionInfo } | undefined {
    const actions = row.actions || [];
    if (!actions.length) return undefined;
    const canonical = canonicalStepExpressionShared(row.text);
    const rowResolutions = actions
        .map(action => resolutions.find(item => item.sequence === action.sequence))
        .filter((item): item is ActionResolution => Boolean(item));
    const withSelector = rowResolutions.filter(item => Boolean(item.selector));
    if (!withSelector.length) return undefined;
    if (withSelector.some(item => item.resolution !== 'reuse' || !item.locatorName || !item.source?.file)) {
        return undefined;
    }
    const recordedNames = new Set(withSelector.map(item => item.locatorName as string));
    const recordedFiles = new Set(withSelector.map(item => item.source!.file));
    for (const definition of catalog.stepDefinitions) {
        if (canonicalStepExpressionShared(definition.expression) !== canonical) continue;
        const text = literalStepText(definition.expression);
        if (!text || !definition.screenMethods?.length) continue;
        const methods = definition.screenMethods.map(call =>
            (catalog.screenMethods || []).find(method => method.file === call.file && method.name === call.method)
        );
        if (methods.some(method => !method)) continue;
        // El indice conoce las claves que alcanza el metodo y los modulos de
        // locators que importa; la clave no viene atada a un modulo concreto.
        const reachableNames = new Set(methods.flatMap(method => method!.locatorKeys || []));
        const reachableFiles = new Set(methods.flatMap(method => method!.locatorFiles || []));
        const sameKeys = reachableNames.size === recordedNames.size
            && [...recordedNames].every(name => reachableNames.has(name))
            && [...recordedFiles].every(file => reachableFiles.has(file));
        if (!sameKeys) continue;
        return {
            text,
            methodName: definition.screenMethods.length === 1 ? definition.screenMethods[0].method : undefined,
            definition,
        };
    }
    return undefined;
}

export function disambiguateStepText(
    baseText: string,
    usedCanonicals: Set<string>,
    definitions: SquadReuseCatalog['stepDefinitions'],
    technicalName: string,
    caseId: string,
): string {
    const trimmed = String(baseText || '').trim().replace(/\s+/g, ' ');
    const scope = titleFromSlug(technicalName).toLowerCase();
    const caseToken = String(caseId || '').toLowerCase();
    const candidates = [
        trimmed,
        `${trimmed} en ${scope}`,
        `${trimmed} para ${scope}`,
        `${trimmed} para ${caseToken}`,
        `${trimmed} en ${scope} ${caseToken}`,
    ].filter(Boolean);
    for (const candidate of candidates) {
        const canonical = canonicalStepExpressionShared(candidate);
        if (usedCanonicals.has(canonical)) continue;
        if (collidesWithFrameworkStep(candidate, definitions)) continue;
        usedCanonicals.add(canonical);
        return candidate;
    }
    for (let attempt = 2; attempt <= 12; attempt += 1) {
        const candidate = `${trimmed} en ${scope} variante ${attempt}`;
        const canonical = canonicalStepExpressionShared(candidate);
        if (usedCanonicals.has(canonical)) continue;
        if (collidesWithFrameworkStep(candidate, definitions)) continue;
        usedCanonicals.add(canonical);
        return candidate;
    }
    return trimmed;
}

export function frameworkCandidates(
    catalog: SquadReuseCatalog,
    scenario: AutomationScenario,
    resolutions: ActionResolution[]
): FrameworkReuseCandidate[] {
    const generatedSteps = (scenario.request.scenarioRows || []).map(row => row.text);
    const selectorResolutions = resolutions.filter(resolution => Boolean(resolution.selector));
    return (catalog.scenarios || []).map((candidate: FeatureScenarioInfo) => {
        const locatorsPath = candidate.artifacts?.locators;
        const matchingSelectors = selectorResolutions.filter(resolution =>
            catalog.locators.some(locator =>
                (!locatorsPath || locator.file === locatorsPath) &&
                [...selectorAliases(locator.selector, catalog.platform)]
                    .some(alias => selectorAliases(resolution.selector, catalog.platform).has(alias))
            )
        ).length;
        const selectorCoverage = selectorResolutions.length
            ? matchingSelectors / selectorResolutions.length
            : 0;
        const candidateSteps = candidate.steps.map(step => step.text);
        const semanticScore = stepSimilarity(generatedSteps, candidateSteps);
        const score = Number((semanticScore * 0.6 + selectorCoverage * 0.4).toFixed(3));
        return {
            feature: candidate.feature,
            scenario: candidate.name,
            caseId: candidate.caseId,
            file: candidate.file,
            score,
            selectorCoverage,
            matchedSteps: generatedSteps.filter(step =>
                candidateSteps.some(existing => normalizeStepText(existing) === normalizeStepText(step))
            ),
            paths: candidate.artifacts,
            relatedPaths: candidate.relatedArtifacts,
        };
    }).filter(candidate => candidate.score >= 0.35)
        .sort((left, right) => right.score - left.score || right.selectorCoverage - left.selectorCoverage)
        .slice(0, 5);
}
