import fs from 'fs';
import path from 'path';
import {
    AutomationScenario,
    QaRoastGenerationResult,
    TestDesignReview,
} from '../contracts';
import { validateQaRoastResponse, QA_ROAST_RESPONSE_SCHEMA } from '../domain/qaRoastContracts';
import { AgentProvider } from '../ports/agentProvider';
import { QaRoastGenerationService } from '../ports/qaRoastGenerationService';
import { readJsonUtf8, writeJsonUtf8 } from '../../shared';

interface QaRoastRunArtifact {
    schemaVersion: 1;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    attempts: number;
    repairAttempts: number;
    responseBytes: number;
    result: QaRoastGenerationResult['result'];
    provider: string;
    providerVersion: string | null;
    errorCode: string | null;
}

function safeText(value: unknown, maxLength = 500): string {
    return String(value || '')
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
        .replace(/\b\d{7,}\b/g, '<dato>')
        .replace(/\b(otp|pin|password|token)\s*[:=]\s*\S+/ig, '$1=<redacted>')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function diagnosticOnly(review: TestDesignReview): TestDesignReview {
    return {
        status: review.status,
        summary: safeText(review.summary),
        issues: review.issues.map(issue => ({
            ...issue,
            message: safeText(issue.message),
            recommendation: safeText(issue.recommendation),
        })),
    };
}

export class CopilotQaRoastGenerator implements QaRoastGenerationService {
    constructor(
        private readonly provider: AgentProvider,
        private readonly timeoutMs = 60_000,
        private readonly maxAttempts = 2,
    ) {}

    async generate(packageDirectory: string, review: TestDesignReview): Promise<QaRoastGenerationResult> {
        const startedAtMs = Date.now();
        const startedAt = new Date(startedAtMs).toISOString();
        const requestFile = path.join(packageDirectory, 'qa-roast-request.json');
        const schemaFile = path.join(packageDirectory, 'qa-roast-response.schema.json');
        const responseFile = path.join(packageDirectory, 'qa-roast-response.json');
        const runFile = path.join(packageDirectory, 'qa-roast-run.json');
        const scenario = readJsonUtf8<AutomationScenario>(path.join(packageDirectory, 'scenario.json'));
        const sequences = new Set(review.issues.flatMap(issue => issue.actionSequences));
        const actionFacts = scenario.actions
            .filter(action => sequences.has(action.sequence))
            .slice(0, 20)
            .map(action => ({
                sequence: action.sequence,
                action: action.action,
                description: safeText(action.contextHint || action.elementIntent || action.description, 160),
            }));
        let validationErrors: string[] = [];
        let responseBytes = 0;
        let attempts = 0;
        let providerVersion: string | null = null;
        let errorCode: string | null = null;
        let result: QaRoastGenerationResult['result'] = 'missing-output';
        let error: string | undefined;
        try {
            providerVersion = await this.provider.getVersion();
            writeJsonUtf8(schemaFile, QA_ROAST_RESPONSE_SCHEMA);
            for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
                attempts = attempt;
                if (fs.existsSync(responseFile)) fs.unlinkSync(responseFile);
                writeJsonUtf8(requestFile, {
                    schemaVersion: 1,
                    task: 'Redacta únicamente un roast corto, grosero y genuinamente gracioso a partir del diagnóstico técnico. No reevalúes el caso.',
                    review: diagnosticOnly(review),
                    actionFacts,
                    style: {
                        sentences: '2-3',
                        maxCharacters: 280,
                        intensity: 'alta: debe sonar a roast, no a retroalimentación corporativa amable',
                        structure: ['acción concreta del QA en segunda persona', 'grosería dirigida al caso o resultado', 'remate sarcástico evidente', 'orden de corrección'],
                        safety: ['critica con dureza el caso, la grabación o el resultado; nunca la identidad o capacidad de la persona', 'no inventes fallos', 'sin amenazas, discriminación ni jerga técnica'],
                        examples: [
                            'Tocaste botones durante 15 pasos y no validaste una mierda del resultado. Esto no es testing, es turismo de botones con evidencia. Vuelve y comprueba qué cambió.',
                            'Confirmaste que el botón existe y te fuiste tan tranquilo. Tremendo carajo de descubrimiento: la interfaz tiene botones. Ahora presiónalo y valida que funcione.',
                            'Grabaste clic tras clic y el resultado quedó de adorno. Joder, hasta un tutorial de YouTube comprueba más cosas. Vuelve y agrega una validación observable.',
                        ],
                    },
                    ...(validationErrors.length ? { previousValidationErrors: validationErrors } : {}),
                    output: { file: 'qa-roast-response.json', schema: 'qa-roast-response.schema.json' },
                });
                const run = await this.provider.execute({
                    cwd: packageDirectory,
                    prompt: 'Lee qa-roast-request.json y qa-roast-response.schema.json. Escribe únicamente qa-roast-response.json con la herramienta write y termina.',
                    timeoutMs: this.timeoutMs,
                    stopOnValidatedOutput: {
                        outputFile: 'qa-roast-response.json',
                        schemaFile: 'qa-roast-response.schema.json',
                        acceptOutput: output => validateQaRoastResponse(output).valid,
                    },
                });
                errorCode = run.errorCode || null;
                if (!run.success) {
                    result = 'provider-failed';
                    error = run.errorMessage || run.errorCode || 'Copilot no pudo generar el mensaje troll.';
                    break;
                }
                if (!fs.existsSync(responseFile)) {
                    result = 'missing-output';
                    error = 'Copilot terminó sin crear qa-roast-response.json.';
                    continue;
                }
                responseBytes = fs.statSync(responseFile).size;
                const parsed = validateQaRoastResponse(readJsonUtf8<unknown>(responseFile));
                if (parsed.valid && parsed.value) {
                    result = 'generated';
                    const durationMs = Date.now() - startedAtMs;
                    const generated: QaRoastGenerationResult = {
                        success: true,
                        roast: parsed.value.roast,
                        attempts,
                        repairAttempts: Math.max(0, attempts - 1),
                        durationMs,
                        responseBytes,
                        result,
                    };
                    this.writeRun(runFile, {
                        schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(), durationMs,
                        attempts, repairAttempts: generated.repairAttempts, responseBytes, result,
                        provider: this.provider.name, providerVersion, errorCode: null,
                    });
                    return generated;
                }
                validationErrors = parsed.errors;
                result = 'invalid-output';
                error = parsed.errors.join(' | ');
            }
        } catch (caught: any) {
            result = 'provider-failed';
            error = safeText(caught?.message || caught);
        }
        const durationMs = Date.now() - startedAtMs;
        this.writeRun(runFile, {
            schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(), durationMs,
            attempts, repairAttempts: Math.max(0, attempts - 1), responseBytes, result,
            provider: this.provider.name, providerVersion, errorCode,
        });
        return {
            success: false,
            attempts,
            repairAttempts: Math.max(0, attempts - 1),
            durationMs,
            responseBytes,
            result,
            ...(error ? { error } : {}),
        };
    }

    private writeRun(file: string, artifact: QaRoastRunArtifact): void {
        writeJsonUtf8(file, artifact);
    }
}
