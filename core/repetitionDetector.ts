import { RecordedStep, recordedStepContext } from './models';
import { TECHNICAL_STOP_WORDS, camel, words } from './selectorNormalization';

/**
 * Detección de ciclos repetidos en una grabación.
 *
 * Un QA que prueba "todas las opciones" repite el mismo par de accionesvariando
 * un solo literal. Sin detectarlo, el Gherkin sale con las repeticiones
 * aplanadas y las opciones desaparecen; con el ciclo identificado se puede
 * proponer un Scenario Outline con Examples. La decisión no es automática:
 * cinco filas de Examples son cinco ejecuciones completas del escenario, y eso
 * solo lo sabe quien grabó el caso.
 */

export interface RepetitionCycle {
    /** Secuencia (1-based) de la primera acción del ciclo. */
    startSequence: number;
    /** Acciones por repetición. */
    length: number;
    repetitions: number;
    /** Posición dentro del ciclo cuyo literal cambia en cada vuelta. */
    varyingOffset: number;
    /** Literal observado en cada repetición, en orden. */
    values: string[];
    /** Nombre sugerido para el parámetro del Examples. */
    parameter: string;
    /** Secuencias que cubre cada repetición. */
    sequences: number[][];
}

const MIN_REPETITIONS = 3;

/** Literal entrecomillado del selector, si lo tiene. */
function selectorLiteral(selector = ''): string | undefined {
    const match = String(selector).match(/["']([^"']+)["']/);
    return match?.[1];
}

/** Selector sin su literal, para comparar acciones por forma y no por dato. */
function selectorShape(selector = ''): string {
    return String(selector).replace(/["'][^"']*["']/g, '"*"').trim();
}

function shapeOf(step: RecordedStep): string {
    return `${step.action}|${selectorShape(step.selector)}`;
}

function sequenceOf(step: RecordedStep, index: number): number {
    const explicit = Number((step as RecordedStep & { sequence?: number }).sequence);
    return Number.isInteger(explicit) && explicit > 0 ? explicit : index + 1;
}

/** Palabra con carga semántica más frecuente entre varios textos. */
function dominantWord(texts: string[]): string | undefined {
    const counts = new Map<string, number>();
    for (const text of texts) {
        for (const word of new Set(words(text))) {
            if (word.length < 3 || TECHNICAL_STOP_WORDS.has(word)) continue;
            counts.set(word, (counts.get(word) || 0) + 1);
        }
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
}

/**
 * El nombre del parámetro sale del contexto que el QA escribió: primero de las
 * acciones constantes del ciclo (`boton de filtro de movimientos` → `filtro`),
 * y si no aportan nada, de lo que comparten las variables.
 */
function parameterName(constantHints: string[], varyingHints: string[]): string {
    const fromConstant = dominantWord(constantHints);
    if (fromConstant) return camel(fromConstant, 'opcion');
    const fromVarying = dominantWord(varyingHints);
    return camel(fromVarying || 'opcion', 'opcion');
}

export function detectRepetition(actions: RecordedStep[]): RepetitionCycle | undefined {
    const shapes = actions.map(shapeOf);
    const total = actions.length;
    let best: RepetitionCycle | undefined;

    for (let length = 1; length <= Math.floor(total / MIN_REPETITIONS); length += 1) {
        for (let start = 0; start + length * MIN_REPETITIONS <= total; start += 1) {
            let repetitions = 1;
            while (
                start + length * (repetitions + 1) <= total &&
                shapes.slice(start + length * repetitions, start + length * (repetitions + 1))
                    .every((shape, offset) => shape === shapes[start + offset])
            ) {
                repetitions += 1;
            }
            if (repetitions < MIN_REPETITIONS) continue;

            const windows = Array.from({ length: repetitions }, (_, round) =>
                actions.slice(start + length * round, start + length * (round + 1)));
            // Exactamente una posición del ciclo puede variar: si cambian dos, no
            // es una tabla de datos sino flujos distintos que se parecen.
            const varying = Array.from({ length }, (_, offset) => offset).filter(offset => {
                const literals = windows.map(window => selectorLiteral(window[offset].selector) || '');
                return new Set(literals).size === windows.length && literals.every(Boolean);
            });
            const constant = Array.from({ length }, (_, offset) => offset).filter(offset => {
                const literals = windows.map(window => selectorLiteral(window[offset].selector) || '');
                return new Set(literals).size === 1;
            });
            if (varying.length !== 1 || varying.length + constant.length !== length) continue;

            const varyingOffset = varying[0];
            // Con ciclos de dos o más acciones, la posición constante ya prueba que
            // es la misma interacción repetida. Con una sola acción no hay ancla:
            // seis clicks distintos parecerían un ciclo de uno. Se exige entonces
            // que el contexto del QA nombre el mismo concepto en cada vuelta.
            if (length === 1) {
                const concepts = windows.map(window =>
                    new Set(words(recordedStepContext(window[varyingOffset]))
                        .filter(word => word.length >= 3 && !TECHNICAL_STOP_WORDS.has(word))));
                const shared = [...(concepts[0] || [])]
                    .filter(word => concepts.every(concept => concept.has(word)));
                if (!shared.length) continue;
            }
            const candidate: RepetitionCycle = {
                startSequence: sequenceOf(actions[start], start),
                length,
                repetitions,
                varyingOffset,
                values: windows.map(window => selectorLiteral(window[varyingOffset].selector) || ''),
                parameter: parameterName(
                    constant.flatMap(offset => windows.map(window => recordedStepContext(window[offset]))),
                    windows.map(window => recordedStepContext(window[varyingOffset]))
                ),
                sequences: windows.map((window, round) =>
                    window.map((_, offset) => sequenceOf(actions[start + length * round + offset], start + length * round + offset))),
            };
            // Gana el ciclo que cubre más acciones de la grabación.
            const covered = (cycle: RepetitionCycle) => cycle.length * cycle.repetitions;
            if (!best || covered(candidate) > covered(best)) best = candidate;
        }
    }
    return best;
}
