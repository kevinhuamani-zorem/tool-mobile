import type { AutomationScenario, RecordedStep } from '../contracts';

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

export interface QaObservationsArtifact {
    schemaVersion: 1;
    recordingId: string;
    generatedAt: string;
    observations: QaTextQualityObservation[];
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
    const observations: QaTextQualityObservation[] = [];
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
