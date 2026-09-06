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

export interface ArtifactBundleChoice {
    bundle: ArtifactBundle;
    score: number;
    reason: string;
    /** Locator JSON del bundle que este caso extiende (el de mas aciertos o el del Screen). */
    locators: string;
}

/** Cobertura minima para que un acierto de locator adopte un Screen ajeno. */
const HIT_INTENT_COVERAGE_THRESHOLD = 0.5;
const STANDALONE_INTENT_COVERAGE_THRESHOLD = 0.5;
const BUNDLE_ADOPTION_THRESHOLD = 0.45;

function artifactBasename(file: string): string {
    return path.basename(file).replace(/\.(?:screen\.ts|locator\.json|steps\.ts|ts|json)$/, '').toLowerCase();
}

/**
 * Locator JSON del bundle que recibe las claves nuevas: el que mas locators
 * reutilizados aporta; sin aciertos, el que lleva el nombre del Screen
 * (`movements.screen.ts` -> `movements.locator.json`) antes que uno compartido
 * como `home.locator.json`.
 */
export function bundleTargetLocator(bundle: ArtifactBundle, hitsByFile: Map<string, number>): string {
    const screenName = artifactBasename(bundle.screens[0] || '');
    return [...bundle.locators].sort((left, right) =>
        (hitsByFile.get(right) || 0) - (hitsByFile.get(left) || 0)
        || Number(artifactBasename(right) === screenName) - Number(artifactBasename(left) === screenName)
        || left.localeCompare(right)
    )[0];
}

/**
 * Que Screen Object existente extender, si alguno.
 *
 * La evidencia manda, no la presencia. El caso "enviar movimientos por correo"
 * (18167698) reutilizo cinco locators de `payment/movements` y uno de
 * `payment/yapear-otp` (el campo del correo se grabo como `className(EditText)`,
 * el mismo selector generico del campo del codigo OTP); con una formula de
 * presencia (`hits > 0 -> 0.85`) el OTP gano por el solapamiento de "el", "de"
 * y "boton", y el flujo de movimientos termino escrito en el Screen del OTP.
 * Aqui un bundle con aciertos puntua por la proporcion de locators
 * reutilizados que le pertenecen, por cuantas intenciones cubre su Screen y
 * por cuanto usan sus Steps esos mismos locators; un selector sin predicado
 * identificador no cuenta como acierto, y un unico acierto sin cobertura no
 * adopta un Screen ajeno. Un Screen que importa varios locators (movements +
 * home) sigue siendo candidato: recibe las claves en el locator con aciertos.
 */
export function bestArtifactBundle(
    catalog: SquadReuseCatalog,
    scenario: AutomationScenario,
    resolutions: ActionResolution[]
): ArtifactBundleChoice | undefined {
    const squadReuse = resolutions.filter(resolution =>
        resolution.resolution === 'reuse' && resolution.source?.scope === 'squad');
    const specificReuse = squadReuse.filter(resolution => !resolution.unspecificSelector);
    // Una coincidencia por selector generico es evidencia debil: solo decide
    // cuando no hay ninguna coincidencia que identifique de verdad un elemento
    // (un caso de una accion sobre el mismo XPath que ya usa un modulo).
    const evidenceReuse = specificReuse.length > 0 ? specificReuse : squadReuse;
    const weakEvidence = specificReuse.length === 0 && squadReuse.length > 0;
    const hitsByFile = new Map<string, number>();
    for (const resolution of evidenceReuse) {
        const file = resolution.source!.file;
        hitsByFile.set(file, (hitsByFile.get(file) || 0) + 1);
    }
    const totalHits = evidenceReuse.length;
    const reusedNames = new Set(evidenceReuse.map(resolution => resolution.locatorName).filter(Boolean));
    const semanticContext = [
        scenario.objective,
        scenario.acceptanceCriteria,
        ...resolutions.map(resolution => resolution.intent),
    ].join(' ');
    const businessContext = [scenario.objective, scenario.acceptanceCriteria].join(' ');
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
        const locatorFiles = [...new Set(methods.flatMap(method => method.locatorFiles || []))].sort();
        if (locatorFiles.length === 0) continue;
        standaloneBundles.push({
            steps: '',
            screens: [screen],
            locators: locatorFiles,
            stepExpressions: [],
            screenMethods: methods.map(method => method.signature),
        });
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
    // Claves de locator que cada Steps alcanza a traves de los metodos que invoca.
    const locatorKeysByMethod = new Map<string, string[]>();
    for (const method of catalog.screenMethods || []) {
        locatorKeysByMethod.set(`${method.file}#${method.name}`, method.locatorKeys || []);
    }
    const keysByStepsFile = new Map<string, Set<string>>();
    for (const definition of catalog.stepDefinitions || []) {
        const keys = keysByStepsFile.get(definition.file) || new Set<string>();
        for (const call of definition.screenMethods || []) {
            for (const key of locatorKeysByMethod.get(`${call.file}#${call.method}`) || []) keys.add(key);
        }
        keysByStepsFile.set(definition.file, keys);
    }
    const ranked = bundles.flatMap(bundle => {
        if (bundle.screens.length !== 1 || bundle.locators.length === 0) return [];
        const hitCount = bundle.locators.reduce((sum, file) => sum + (hitsByFile.get(file) || 0), 0);
        const hitShare = totalHits > 0 ? hitCount / totalHits : 0;
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
        const locators = bundleTargetLocator(bundle, hitsByFile);
        // Un acierto aislado no adopta un Screen ajeno: hace falta mas de un
        // acierto, que su Screen cubra de verdad las intenciones del caso, o
        // que ese acierto sea la mayoria de lo reutilizado y una parte
        // apreciable de la grabacion (un caso corto sobre la misma pantalla).
        const actionShare = actionable.length ? hitCount / actionable.length : 0;
        const qualifiedHits = hitCount > 0 && (
            hitCount >= 2
            || intentCoverage >= HIT_INTENT_COVERAGE_THRESHOLD
            || (hitShare >= 0.5 && actionShare >= 0.25)
        );
        if (qualifiedHits) {
            // Entre Steps del mismo Screen gana el que ya ejerce esos locators y
            // cuyo Gherkin habla del mismo objetivo de negocio.
            const stepsKeys = keysByStepsFile.get(bundle.steps);
            const stepsUsage = stepsKeys && reusedNames.size
                ? [...reusedNames].filter(name => stepsKeys.has(name as string)).length / reusedNames.size
                : 0;
            const stepsAffinity = bundle.stepExpressions.length
                ? conceptSimilarity(businessContext, bundle.stepExpressions.join(' '))
                : 0;
            const evidence = hitShare * 0.45 + intentCoverage * 0.25 + stepsUsage * 0.15 + stepsAffinity * 0.15;
            return [{
                bundle,
                locators,
                score: Number(Math.min(1, 0.85 + evidence * 0.15).toFixed(3)),
                reason: `El Screen Object existente ya consume ${hitCount} de los ${totalHits} locators ` +
                    `reutilizados por el recording${weakEvidence ? ' (coincidencia por selector sin predicado identificador)' : ''}.`,
            }];
        }
        // Un bundle parcial necesita evidencia funcional repetida, no solo un
        // basename parecido. Esto evita adoptar por accidente cualquier Screen
        // que contenga una palabra comun como `button` o `screen`.
        if (standalone && (coveredIntents < 2 || intentCoverage < STANDALONE_INTENT_COVERAGE_THRESHOLD)) return [];
        const score = Math.min(1, standalone
            ? intentCoverage * 0.55 + averageIntentScore * 0.3 + semanticScore * 0.15
            : semanticScore);
        return [{
            bundle,
            locators,
            score: Number(score.toFixed(3)),
            reason: standalone
                ? 'El Screen Object y su Locator JSON cubren las intenciones del recording aunque todavía no exista un Steps que los conecte.'
                : 'Coincidencia semántica con métodos y archivos existentes del alcance.',
        }];
    }).sort((left, right) =>
        right.score - left.score
        || left.bundle.steps.localeCompare(right.bundle.steps)
        || left.locators.localeCompare(right.locators)
    );
    return ranked[0]?.score >= BUNDLE_ADOPTION_THRESHOLD ? ranked[0] : undefined;
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
    const qaText = qaSentence(acceptanceCriteria, 'assertion');
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

