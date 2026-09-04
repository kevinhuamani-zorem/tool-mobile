/**
 * Planificación de artefactos: qué bundle existente extender (update) o crear,
 * rutas planificadas y consolidación de ciclos repetidos en data tables.
 */
import crypto from 'crypto';
import path from 'path';
import {
    ActionResolution,
    AutomationScenario,
    GenerationRequest,
    RecordedStep,
    recordedStepContext,
    detectRepetition,
} from '../../contracts';
import { ArtifactBundle, ReuseAnalyzer, SquadReuseCatalog, CodeGraph } from '../../../indexing';
import type { BaselineSnapshotPort } from '../../ports/baselineSnapshotPort';
import { similarity, words } from './naming';
import { domainAssertionText, qaSentence } from './wording';
import { conceptSimilarity } from './selectorHeuristics';


/**
 * Un metodo parecido NO habilita reutilizar: que el nombre se parezca no prueba
 * que su locator sirva para este caso. Solo se propone al QA para que decida.
 */
export const REVIEW_METHOD_THRESHOLD = 0.3;

export function bestArtifactBundle(
    catalog: SquadReuseCatalog,
    scenario: AutomationScenario,
    resolutions: ActionResolution[]
): { bundle: ArtifactBundle; score: number; reason: string } | undefined {
    const reusedFiles = new Set(resolutions
        .filter(resolution => resolution.resolution === 'reuse' && resolution.source?.scope === 'squad')
        .map(resolution => resolution.source!.file));
    const semanticContext = [
        scenario.objective,
        scenario.acceptanceCriteria,
        ...resolutions.map(resolution => resolution.intent),
    ].join(' ');
    const connectedBundles = catalog.artifactBundles || [];
    // Un Screen Object puede existir antes de que algun Steps lo importe. Ese
    // es exactamente el estado de payment/movements: el Screen ya conoce los
    // filtros y sus locators, pero al no haber una arista Steps -> Screen el
    // catalogo de casos conectados no lo exponia y el planner creaba otro
    // modulo completo. Se derivan bundles parciales desde la relacion real
    // Screen -> Locator que ya indexa ReuseAnalyzer/CodeGraph.
    const standaloneBundles: ArtifactBundle[] = [];
    const methodsByScreen = new Map<string, typeof catalog.screenMethods>();
    for (const method of catalog.screenMethods || []) {
        const methods = methodsByScreen.get(method.file) || [];
        methods.push(method);
        methodsByScreen.set(method.file, methods);
    }
    for (const [screen, methods] of methodsByScreen) {
        const locatorFiles = [...new Set(methods.flatMap(method => method.locatorFiles || []))];
        for (const locator of locatorFiles) {
            standaloneBundles.push({
                steps: '',
                screens: [screen],
                locators: [locator],
                stepExpressions: [],
                screenMethods: methods.map(method => method.signature),
            });
        }
    }
    const bundleKey = (bundle: ArtifactBundle) => [
        bundle.steps,
        ...bundle.screens,
        ...bundle.locators,
    ].join('|');
    const seen = new Set<string>();
    const bundles = [...connectedBundles, ...standaloneBundles].filter(bundle => {
        const key = bundleKey(bundle);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    const ranked = bundles.flatMap(bundle => {
        if (bundle.screens.length !== 1 || bundle.locators.length !== 1) return [];
        const exactLocatorHits = bundle.locators.filter(file => reusedFiles.has(file)).length;
        const bundleContext = [bundle.steps, ...bundle.screens, ...bundle.locators,
            ...bundle.stepExpressions, ...bundle.screenMethods].join(' ');
        const semanticScore = similarity(semanticContext, bundleContext);
        const targetMethods = (catalog.screenMethods || [])
            .filter(method => method.file === bundle.screens[0]);
        const actionable = resolutions.filter(resolution => resolution.resolution !== 'builtin');
        const intentScores = actionable.map(resolution => Math.max(0, ...targetMethods.flatMap(method => [
            conceptSimilarity(resolution.intent, method.name),
            ...(method.locatorKeys || []).map(key => conceptSimilarity(resolution.intent, key)),
        ])));
        const coveredIntents = intentScores.filter(score => score >= 0.25).length;
        const intentCoverage = intentScores.length ? coveredIntents / intentScores.length : 0;
        const averageIntentScore = intentScores.length
            ? intentScores.reduce((sum, score) => sum + score, 0) / intentScores.length
            : 0;
        const standalone = !bundle.steps;
        // Un bundle parcial necesita evidencia funcional repetida, no solo un
        // basename parecido. Esto evita adoptar por accidente cualquier Screen
        // que contenga una palabra comun como `button` o `screen`.
        if (standalone && (coveredIntents < 2 || intentCoverage < 0.5)) return [];
        const score = Math.min(1, exactLocatorHits > 0
            ? 0.85 + semanticScore * 0.15
            : standalone
                ? intentCoverage * 0.55 + averageIntentScore * 0.3 + semanticScore * 0.15
                : semanticScore);
        return [{
            bundle,
            score: Number(score.toFixed(3)),
            reason: exactLocatorHits > 0
                ? 'El Screen Object existente ya consume un locator reutilizado por el recording.'
                : standalone
                    ? 'El Screen Object y su Locator JSON cubren las intenciones del recording aunque todavía no exista un Steps que los conecte.'
                : 'Coincidencia semántica con métodos y archivos existentes del alcance.',
        }];
    }).sort((left, right) => right.score - left.score);
    return ranked[0]?.score >= 0.45 ? ranked[0] : undefined;
}

export function plannedFile(
    layer: 'feature' | 'steps' | 'screen' | 'locators',
    relativePath: string,
    operation: 'create' | 'update',
    baselineSnapshot: BaselineSnapshotPort,
) {
    const baseline = operation === 'update' ? baselineSnapshot.read(relativePath) : undefined;
    return {
        layer,
        path: relativePath,
        operation,
        ...(baseline?.exists ? { baseHash: baseline.hash } : {}),
    };
}


export function attachRepetitionDataTable(
    rows: NonNullable<GenerationRequest['scenarioRows']>,
    repetition: NonNullable<ReturnType<typeof detectRepetition>>,
): NonNullable<GenerationRequest['scenarioRows']> {
    const table = {
        headers: [repetition.parameter],
        rows: repetition.values.map(value => [String(value ?? '')]),
    };
    const targetIndex = rows.findIndex(row => {
        if (!row.actions?.length) return false;
        if (/^VERIFICAR_/.test(row.actions[0]?.action || '')) return false;
        return row.actions.some(action => action.sequence === repetition.startSequence);
    });
    if (targetIndex < 0) return rows;
    return rows.map((row, index) => index === targetIndex ? { ...row, dataTable: table } : row);
}

/**
 * Un filtro aplicado varias veces suele grabarse como
 * `abrir filtro -> elegir opción -> verificar resultado`. Separar por el tipo
 * de acción convertía cada vuelta en un When/Then distinto y terminaba
 * publicando las plantillas genéricas del resolver. Las acciones siguen siendo
 * la traza ejecutable, pero el Feature expresa una sola expectativa funcional.
 *
 * Solo se consolida cuando el detector encontró un ciclo real, el ciclo mezcla
 * interacción y verificación, todas las filas afectadas pertenecen por completo
 * al ciclo y ya existe un comportamiento previo. Así no se altera el orden de
 * ejecución ni se fusionan flujos ambiguos.
 */
export function consolidateRepeatedValidationCycle(
    rows: NonNullable<GenerationRequest['scenarioRows']>,
    repetition: NonNullable<ReturnType<typeof detectRepetition>>,
    actions: RecordedStep[],
    resolutions: ActionResolution[],
    acceptanceCriteria: string,
): NonNullable<GenerationRequest['scenarioRows']> | undefined {
    const coveredSequences = new Set(repetition.sequences.flat());
    // Recordings anteriores al versionado de trazas no persistían `sequence`
    // en la acción. El resolver siempre ha considerado el orden del arreglo
    // como la secuencia efectiva, por lo que se conserva esa compatibilidad.
    const sequencedActions = actions.map((action, index) => ({
        ...action,
        sequence: Number.isFinite(Number(action.sequence)) ? Number(action.sequence) : index + 1,
    }));
    const cycleActions = sequencedActions.filter(action => coveredSequences.has(Number(action.sequence)));
    if (!cycleActions.some(action => /^VERIFICAR_/.test(action.action))) return undefined;
    if (!cycleActions.some(action => !/^VERIFICAR_/.test(action.action))) return undefined;

    const affectedIndexes = rows.flatMap((row, index) => {
        const sequences = (row.actions || []).map(action => Number(action.sequence));
        if (!sequences.some(sequence => coveredSequences.has(sequence))) return [];
        // Una fila parcialmente cubierta contiene otro comportamiento y no se
        // puede mover sin cambiar su semántica.
        if (!sequences.length || sequences.some(sequence => !coveredSequences.has(sequence))) return [];
        return [index];
    });
    if (affectedIndexes.length < repetition.repetitions * 2) return undefined;

    const firstIndex = Math.min(...affectedIndexes);
    const affected = new Set(affectedIndexes);
    const hasPreviousBehavior = rows.slice(0, firstIndex).some(row =>
        (row.actions || []).some(action => !/^VERIFICAR_/.test(action.action))
    );
    if (!hasPreviousBehavior) return undefined;

    const actionBySequence = new Map(affectedIndexes.flatMap(index =>
        (rows[index].actions || []).map(action => [Number(action.sequence), action] as const)
    ));
    const orderedActions = sequencedActions
        .filter(action => coveredSequences.has(Number(action.sequence)))
        .map(action => actionBySequence.get(Number(action.sequence)) || action);
    const intentBySequence = new Map(resolutions.map(resolution => [resolution.sequence, resolution.intent]));
    const intents = orderedActions.map(action => intentBySequence.get(Number(action.sequence)) || recordedStepContext(action));
    const domainText = domainAssertionText(intents);
    const qaText = qaSentence(acceptanceCriteria);
    const cycleContext = orderedActions.map(recordedStepContext).join(' ');
    const parameter = /\bfiltr(?:o|ar|ado|ada|ados|adas)?\b/i.test(cycleContext)
        ? 'filtro'
        : repetition.parameter.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase() || 'variante';
    let text = domainText || qaText || 'se muestran los resultados esperados';
    if (!words(text).includes(words(parameter)[0])) text += ` al aplicar cada ${parameter}`;

    const hasPreviousAssertion = rows.slice(0, firstIndex).some(row =>
        (row.actions || []).some(action => /^VERIFICAR_/.test(action.action))
    );
    const merged = {
        keyword: (hasPreviousAssertion ? 'And' : 'Then') as 'And' | 'Then',
        text,
        status: 'missing' as const,
        wording: (domainText ? 'domain' : qaText ? 'qa' : 'domain') as 'domain' | 'qa',
        actions: orderedActions,
    };

    return rows.flatMap((row, index) => {
        if (index === firstIndex) return [merged];
        return affected.has(index) ? [] : [row];
    });
}

