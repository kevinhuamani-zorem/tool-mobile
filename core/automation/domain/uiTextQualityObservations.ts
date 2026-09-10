import type { AutomationScenario, RecordedStep } from '../contracts';
import { selectorCannotIdentifyElement, selectorIsUnspecific } from '../../shared';

export interface QaTextQualityObservation {
    id: string;
    type: 'ui-text-quality';
    severity: 'warning';
    platform: 'android' | 'ios';
    actual: string;
    expected: string;
    message: string;
    actionSequence: number;
    selector: string;
}

/**
 * Verificacion con un XPath sin predicado. Solo se avisa: el selector grabado
 * se conserva y el QA decide si lo refina o deja que el agente itere sobre el.
 */
export interface QaWeakAssertionObservation {
    id: string;
    type: 'weak-assertion';
    severity: 'warning';
    platform: 'android' | 'ios';
    message: string;
    actionSequence: number;
    selector: string;
}

/**
 * Accion sobre un elemento cuyo selector no lleva predicado identificador
 * (className, `instance(n)`, XPath o class chain sin predicado). Se conserva
 * tal cual; solo se avisa que coincidir con un locator de otra pantalla no
 * cuenta como reutilizacion.
 */
export interface QaUnspecificSelectorObservation {
    id: string;
    type: 'unspecific-selector';
    severity: 'warning';
    platform: 'android' | 'ios';
    message: string;
    actionSequence: number;
    selector: string;
}

export type QaObservation =
    | QaTextQualityObservation
    | QaWeakAssertionObservation
    | QaUnspecificSelectorObservation;

export interface QaObservationsArtifact {
    schemaVersion: 1;
    recordingId: string;
    generatedAt: string;
    observations: QaObservation[];
}

interface TextCorrectionRule {
    id: string;
    actual: string;
    expected: string;
}

// Reglas pequeñas y auditables. No corrigen el selector: solo señalan texto
// visible posiblemente defectuoso para que QA lo reporte al equipo de app.
const TEXT_CORRECTIONS: TextCorrectionRule[] = [
    { id: 'missing-l-ultimos', actual: 'Útimos', expected: 'Últimos' },
];

function visibleText(step: RecordedStep): string {
    return String(step.locatorValue || step.selector || step.value || '').trim();
}

function observedLabel(source: string, token: string): string {
    const uiSelectorText = source.match(/\.text\(["']([^"']+)["']\)/u)?.[1];
    if (uiSelectorText?.includes(token)) return uiSelectorText;
    const xpathText = source.match(/@text\s*=\s*["']([^"']+)["']/u)?.[1];
    if (xpathText?.includes(token)) return xpathText;
    return source;
}

export function analyzeUiTextQuality(
    recordingId: string,
    steps: Array<RecordedStep & { sequence?: number }>,
    generatedAt = new Date().toISOString(),
    defaultPlatform: 'android' | 'ios' = 'android',
): QaObservationsArtifact {
    const observations: QaObservation[] = [];
    steps.forEach((step, index) => {
        const selector = visibleText(step);
        if (!selector) return;
        for (const rule of TEXT_CORRECTIONS) {
            if (!selector.includes(rule.actual)) continue;
            const actual = observedLabel(selector, rule.actual);
            const expected = actual.split(rule.actual).join(rule.expected);
            const actionSequence = Number(step.sequence || index + 1);
            observations.push({
                id: `${rule.id}-${actionSequence}`,
                type: 'ui-text-quality',
                severity: 'warning',
                platform: step.platform || defaultPlatform,
                actual,
                expected,
                message: 'Posible error ortográfico en el texto visible de la aplicación.',
                actionSequence,
                selector,
            });
        }
    });
    steps.forEach((step, index) => {
        if (!/^VERIFICAR_/.test(String(step.action || ''))) return;
        const selector = String(step.selector || '');
        if (!selectorCannotIdentifyElement(selector)) return;
        const actionSequence = Number(step.sequence || index + 1);
        observations.push({
            id: `weak-assertion-${actionSequence}`,
            type: 'weak-assertion',
            severity: 'warning',
            platform: step.platform || defaultPlatform,
            message: `La verificación usa "${selector}", un XPath sin predicado que engancha el primer nodo de ese tipo. ` +
                'Se conserva tal cual; el QA debe verificar el elemento en el dispositivo y corregir el selector o volver a grabar la comprobación.',
            actionSequence,
            selector,
        });
    });
    steps.forEach((step, index) => {
        if (/^VERIFICAR_/.test(String(step.action || ''))) return; // ya lo cubre weak-assertion
        const selector = String(step.selector || '');
        if (!selector || step.selectorVerified === false || !selectorIsUnspecific(selector)) return;
        const actionSequence = Number(step.sequence || index + 1);
        observations.push({
            id: `unspecific-selector-${actionSequence}`,
            type: 'unspecific-selector',
            severity: 'warning',
            platform: step.platform || defaultPlatform,
            message: `La acción usa "${selector}", un selector sin predicado identificador (tipo o posición, ` +
                'sin texto, descripción ni resource-id). Se conserva tal cual; un locator de otra pantalla con el ' +
                'mismo selector no se da por el mismo elemento, así que solo se reutiliza dentro del módulo del caso.',
            actionSequence,
            selector,
        });
    });
    return { schemaVersion: 1, recordingId, generatedAt, observations };
}

export function analyzeScenarioUiTextQuality(scenario: AutomationScenario): QaObservationsArtifact {
    return analyzeUiTextQuality(
        scenario.recordingId,
        scenario.actions,
        scenario.createdAt,
        scenario.platform,
    );
}
