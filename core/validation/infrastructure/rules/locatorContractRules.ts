/**
 * Familia contrato de locators: el nucleo del validador.
 *
 * Comprueba que cada accion trace el locator que el plan exige (o uno que su
 * gap ofrecio), que un `create` declare una sola vez el par primary exacto
 * (TypeLocator, valor) verificado en la grabacion, que declare tambien su
 * clave en la plataforma contraria, que el screenMethod trazado consuma el
 * getter sin selectores literales, y que ningun selector propuesto sea
 * inventado.
 *
 * Con el enum mal importado toda la familia se apaga: `TypeLocator.X` deja de
 * reconocerse y las comprobaciones de tipos dispararian a la vez sin nombrar
 * la causa real.
 */
import path from 'path';
import fs from 'fs';
import {
    AutomationAgentResponse,
    GenerationPlan,
    candidateAllowlist,
    screenObjectNames,
    typeLocatorImportProblem,
} from '../../../automation/contracts';
import { frameworkContract, projectPaths } from '../../../workspace';
import {
    changedLocatorValues,
    completionTarget,
    hasLocatorKeyForPlatform,
    responseLocatorValues,
} from './locatorInspection';
import { screenLocatorTypes, screenMethodGetterUsage } from './screenInspection';
import { ResponseRuleContext, RuleReport } from './ruleContext';

export function locatorContractRules(context: ResponseRuleContext, report: RuleReport): void {
    const { scenario, plan, response, relaxedContract } = context;
    const { errors, warnings } = report;
    // Con el enum mal importado, `TypeLocator.X` deja de reconocerse y todas
    // las comprobaciones de tipos disparan a la vez sin nombrar la causa. El
    // agente tiene un solo intento de reparacion: se le da el error real y
    // no cuatro consecuencias.
    const enumImportBroken = Boolean(typeLocatorImportProblem(
        response.files.find(file => file.layer === 'screen')?.content || '',
        {
            typeLocatorSymbol: frameworkContract(projectPaths.frameworkRoot).typeLocatorSymbol,
            typeLocatorImport: frameworkContract(projectPaths.frameworkRoot).typeLocatorImport,
        }
    ));

    const locatorFile = response.files.find(file => file.layer === 'locators');
    if (locatorFile && !enumImportBroken) {
        const locatorPlan = plan.files.find(file => file.layer === 'locators');
        let baseline: string | undefined;
        if (locatorPlan?.operation === 'update') {
            const absolute = path.join(projectPaths.frameworkRoot, locatorPlan.path);
            if (fs.existsSync(absolute)) baseline = fs.readFileSync(absolute, 'utf-8');
        }
        const actionBySequence = new Map(scenario.actions.map(action => [action.sequence, action]));
        const completionBySequence = new Map<number, NonNullable<AutomationAgentResponse['completions']>[number]>();
        for (const completion of response.completions || []) {
            if (!completionTarget(plan, completion)) continue;
            if (completionBySequence.has(completion.sequence)) {
                errors.push({
                    code: 'completion-duplicate',
                    message: `La acción ${completion.sequence} declara más de un completion.`,
                });
                continue;
            }
            completionBySequence.set(completion.sequence, completion);
        }
        // El gap de duplicado invita a reutilizar un locator existente en vez
        // de crear el del plan. Adoptar uno de los que el gap OFRECIO esta
        // autorizado —cualquier otro nombre, no—; sin esto el validador
        // rechazaba al agente por obedecer al gap.
        const adoptedBySequence = new Map<number, string>();
        response.actionTrace.forEach(trace => {
            if (!trace.locatorName) return;
            const planned = plan.resolutions.find(item => item.sequence === trace.sequence);
            if (!planned || planned.locatorName === trace.locatorName) return;
            const offered = (planned.reuseCandidates || [])
                .find(candidate => candidate.name === trace.locatorName);
            if (offered) adoptedBySequence.set(trace.sequence, offered.name);
        });

        const primaryByLocator = new Map<string, Set<string>>();
        const addPrimary = (name: string | undefined, sequence: number): void => {
            if (!name) return;
            const action = actionBySequence.get(sequence);
            if (!action) return;
            const resolution = plan.resolutions.find(item => item.sequence === sequence);
            // Adoptar un candidato existente deja de ser un `create`: el par
            // (TypeLocator, valor) es el del locator que ya vive en el
            // framework, no el que la grabacion habria escrito.
            if (adoptedBySequence.has(sequence)) return;
            if (resolution?.resolution !== 'create' || completionBySequence.has(sequence)) return;
            const allowed = primaryByLocator.get(name) || new Set<string>();
            candidateAllowlist(action, scenario.platform)
                .filter(candidate => candidate.primary)
                .forEach(candidate =>
                    allowed.add(`${candidate.locatorType}\u0000${candidate.locatorValue}`)
                );
            primaryByLocator.set(name, allowed);
        };
        plan.resolutions.forEach(resolution => addPrimary(resolution.locatorName, resolution.sequence));
        const traceLocatorMismatches: Array<{
            sequence: number;
            expectedName: string;
            actualName: string;
            planned?: GenerationPlan['resolutions'][number];
        }> = [];
        response.actionTrace.forEach(trace => {
            const planned = plan.resolutions.find(resolution => resolution.sequence === trace.sequence);
            const expectedName = adoptedBySequence.get(trace.sequence)
                || completionBySequence.get(trace.sequence)?.name
                || planned?.locatorName;
            if (expectedName && trace.locatorName !== expectedName) {
                traceLocatorMismatches.push({
                    sequence: trace.sequence,
                    expectedName,
                    actualName: trace.locatorName || '',
                    planned,
                });
                return;
            }
            addPrimary(trace.locatorName, trace.sequence);
        });
        const contract = frameworkContract(projectPaths.frameworkRoot);
        const screenFile = response.files.find(file => file.layer === 'screen');
        const screenContent = screenFile?.content || '';
        const referencedTypes = screenLocatorTypes(
            screenContent,
            contract,
            screenFile ? screenObjectNames(screenFile.path).className : '',
        );
        const methodUsage = screenMethodGetterUsage(
            screenContent,
            screenFile ? screenObjectNames(screenFile.path).className : '',
        );
        const currentLocators = responseLocatorValues(locatorFile.content);
        const locatorTypesFor = (
            getterName: string,
            blockName: string,
            locatorName: string
        ): Set<string> => {
            const key =
                `${getterName}\u0000${scenario.platform}\u0000${locatorFile.path}\u0000` +
                `${blockName}\u0000${locatorName}`;
            return referencedTypes.get(key) || new Set<string>();
        };
        const acceptedTraceAliases = new Set<string>();
        const expectedGetterByAlias = new Map<string, string>();
        for (const mismatch of traceLocatorMismatches) {
            const expectedPairs = primaryByLocator.get(mismatch.expectedName) || new Set<string>();
            const candidates = currentLocators.filter(entry =>
                entry.name === mismatch.actualName
                && entry.blockName.toLowerCase().endsWith(scenario.platform)
            );
            const semanticMatch = candidates.some(entry => {
                const candidateTypes = new Set<string>([
                    ...locatorTypesFor(entry.name, entry.blockName, entry.name),
                    ...locatorTypesFor(mismatch.expectedName, entry.blockName, entry.name),
                ]);
                return candidateTypes.size === 1
                    && expectedPairs.has(`${[...candidateTypes][0]}\u0000${entry.selector.trim()}`);
            });
            if (semanticMatch) {
                acceptedTraceAliases.add(mismatch.actualName);
                expectedGetterByAlias.set(mismatch.actualName, mismatch.expectedName);
                if (expectedPairs.size) primaryByLocator.set(mismatch.actualName, new Set(expectedPairs));
                warnings.push(
                    `trace-locator relajado: la acción ${mismatch.sequence} traza ` +
                    `${mismatch.actualName} en vez de ${mismatch.expectedName}, ` +
                    'pero conserva el selector primary verificado.'
                );
                continue;
            }
            errors.push({
                code: 'trace-locator',
                message:
                    `La acción ${mismatch.sequence} traza ${mismatch.actualName}, pero el plan exige ` +
                    `${mismatch.expectedName}` +
                    ((mismatch.planned?.reuseCandidates || []).length
                        ? `. Solo puedes adoptar uno de los locators que ofrece su gap: ` +
                          `${mismatch.planned!.reuseCandidates!.map(candidate => candidate.name).join(', ')}.`
                        : '.'),
                file: locatorFile.path,
            });
        }
        const tracedGettersByMethod = new Map<string, Set<string>>();
        response.actionTrace.forEach(trace => {
            if (!trace.screenMethod) return;
            const resolution = plan.resolutions.find(item => item.sequence === trace.sequence);
            const expectedName = adoptedBySequence.get(trace.sequence)
                || completionBySequence.get(trace.sequence)?.name
                || resolution?.locatorName;
            if (!expectedName || trace.locatorName !== expectedName) return;
            const getters = tracedGettersByMethod.get(trace.screenMethod) || new Set<string>();
            getters.add(expectedName);
            tracedGettersByMethod.set(trace.screenMethod, getters);
        });
        // Una accion que adopto un candidato del gap ya no crea nada: su par
        // (TypeLocator, valor) es el del locator que ya vive en el
        // framework. Exigirle el par de la grabacion era pedirle que
        // deshiciera la reutilizacion que el propio gap le pidio.
        const createNames = new Set(plan.resolutions
            .filter(resolution =>
                resolution.resolution === 'create'
                && resolution.locatorName
                && !completionBySequence.has(resolution.sequence)
                && !adoptedBySequence.has(resolution.sequence)
            )
            .map(resolution => resolution.locatorName!));
        for (const name of createNames) {
            const pairs = primaryByLocator.get(name) || new Set<string>();
            const entries = currentLocators.filter(entry =>
                entry.name === name
                && entry.blockName.toLowerCase().endsWith(scenario.platform)
            );
            const exact = entries.filter(entry => {
                const key =
                    `${name}\u0000${scenario.platform}\u0000${locatorFile.path}\u0000` +
                    `${entry.blockName}\u0000${name}`;
                const types = referencedTypes.get(key) || new Set<string>();
                return types.size === 1
                    && pairs.has(`${[...types][0]}\u0000${entry.selector.trim()}`);
            });
            if (!relaxedContract && (exact.length !== 1 || entries.length !== 1)) {
                errors.push({
                    code: 'create-locator-contract',
                    message:
                        `El create de ${name} debe declarar una sola vez el par primary exacto ` +
                        '(TypeLocator, valor) en el getter homónimo y bloque de la plataforma grabada.',
                    file: locatorFile.path,
                });
            }
            const oppositePlatform = scenario.platform === 'android' ? 'ios' : 'android';
            if (!hasLocatorKeyForPlatform(locatorFile.content, name, oppositePlatform)) {
                errors.push({
                    code: 'platform-coverage',
                    message:
                        `El locator ${name} debe declarar tambien su clave en ${oppositePlatform.toUpperCase()} `
                        + "aunque quede vacia (''). No uses literales vacios dentro de getElement.",
                    file: locatorFile.path,
                });
            }
        }
        for (const resolution of plan.resolutions.filter(item =>
            item.resolution === 'create' && item.locatorName
        )) {
            const traces = response.actionTrace.filter(trace => trace.sequence === resolution.sequence);
            const trace = traces.length === 1 ? traces[0] : undefined;
            const completion = completionBySequence.get(resolution.sequence);
            const adopted = adoptedBySequence.get(resolution.sequence);
            const expectedGetter = adopted || completion?.name || resolution.locatorName!;
            const reusesIndexedMethod = Boolean(
                adopted
                && resolution.existingMethod
                && trace?.screenMethod === resolution.existingMethod.name
                && resolution.existingMethod.locatorKeys.includes(adopted)
            );
            const usage = trace?.screenMethod
                ? methodUsage.get(trace.screenMethod)
                : undefined;
            const tracedGetters = trace?.screenMethod
                ? tracedGettersByMethod.get(trace.screenMethod)
                : undefined;
            const action = actionBySequence.get(resolution.sequence);
            const candidates = action ? candidateAllowlist(action, scenario.platform) : [];
            const candidateLiterals = candidates
                .flatMap(candidate => [candidate.selector, candidate.locatorValue]);
            const primary = candidates.find(candidate => candidate.primary);
            // El locator adoptado trae su propio valor del framework: los
            // literales de la grabacion no aplican.
            const literals = adopted ? [] : candidateLiterals;
            const completionMappingValid = !completion || Boolean(
                primary
                && (() => {
                    const target = completionTarget(plan, completion);
                    if (!target) return false;
                    const key =
                        `${expectedGetter}\u0000${scenario.platform}\u0000${target.file}\u0000` +
                        `${target.block}\u0000${target.name}`;
                    const types = referencedTypes.get(key) || new Set<string>();
                    return types.size === 1 && types.has(primary.locatorType);
                })()
            );
            if (!relaxedContract && !reusesIndexedMethod && (
                !trace?.screenMethod
                || !usage
                || usage.hardcodedSelector
                || literals.some(value => usage.literals.has(value))
                || !completionMappingValid
                || !usage.getters.has(expectedGetter)
                || [...usage.getters].some(getter => !tracedGetters?.has(getter))
            )) {
                errors.push({
                    code: 'trace-screen-method',
                    message:
                        `La acción ${resolution.sequence} debe trazar un único screenMethod que consuma ` +
                        `el getter ${expectedGetter} sin selectores literales ni rutas alternativas.`,
                    file: screenFile?.path,
                });
            }
        }
        if (relaxedContract) {
            warnings.push(
                'Modo experimental activo: se omitieron create-locator-contract y trace-screen-method.'
            );
        }
        for (const proposed of changedLocatorValues(locatorFile.content, baseline)) {
            const recordedPlatformBlock = proposed.blockName.toLowerCase().endsWith(scenario.platform);
            const types = new Set<string>([
                ...locatorTypesFor(proposed.name, proposed.blockName, proposed.name),
                ...(expectedGetterByAlias.has(proposed.name)
                    ? [...locatorTypesFor(
                        expectedGetterByAlias.get(proposed.name)!,
                        proposed.blockName,
                        proposed.name
                    )]
                    : []),
            ]);
            const pairs = primaryByLocator.get(proposed.name) || new Set<string>();
            const exactTypes = [...types].filter(type =>
                pairs.has(`${type}\u0000${proposed.selector.trim()}`)
            );
            if (
                createNames.has(proposed.name)
                && recordedPlatformBlock
                && exactTypes.length === 1
                && types.size === 1
            ) continue;
            if (
                acceptedTraceAliases.has(proposed.name)
                && recordedPlatformBlock
                && exactTypes.length === 1
                && types.size === 1
            ) continue;
            if (
                recordedPlatformBlock
                && [...pairs].some(pair => pair.endsWith(`\u0000${proposed.selector.trim()}`))
                && (types.size !== 1 || exactTypes.length !== 1)
            ) {
                errors.push({
                    code: 'locator-type-mismatch',
                    message:
                        `El getter de ${proposed.blockName}.${proposed.name} debe usar el TypeLocator ` +
                        `del candidato primary para "${proposed.selector}".`,
                    file: locatorFile.path,
                });
            } else {
                errors.push({
                    code: 'invented-selector',
                    message:
                        `El locator ${proposed.blockName}.${proposed.name} no usa el par primary ` +
                        `(TypeLocator, valor) verificado para create: "${proposed.selector}".`,
                    file: locatorFile.path,
                });
            }
        }
    }
}
