import fs from 'fs';
import path from 'path';
import { projectPaths } from '../core/projectPaths';
import {
    AiGenerationPlan,
    generationPlanResponseSchema,
    validateGenerationPlan
} from './generationPlan';
import { AiGenerationContext } from './generationContextBuilder';
import { RecordedStep } from '../core/models';

type FetchLike = typeof fetch;

export interface GeminiClientOptions {
    apiKey?: string;
    model?: string;
    timeoutMs?: number;
    fetchImpl?: FetchLike;
}

function parseEnvFile(file: string): Record<string, string> {
    if (!fs.existsSync(file)) return {};
    return Object.fromEntries(
        fs.readFileSync(file, 'utf-8').split(/\r?\n/).flatMap(line => {
            const match = line.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
            if (!match) return [];
            const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
            return [[match[1], value]];
        })
    );
}

export function resolveGeminiConfig(): { apiKey: string; model: string } {
    const recorderEnv = parseEnvFile(path.join(projectPaths.toolRoot, '.env'));
    const apiKey = process.env.GEMINI_API_KEY || recorderEnv.GEMINI_API_KEY || '';
    const model = process.env.GEMINI_MODEL || recorderEnv.GEMINI_MODEL || 'gemini-2.5-flash';
    return { apiKey, model };
}

export class GeminiClient {
    private readonly apiKey: string;
    private readonly model: string;
    private readonly timeoutMs: number;
    private readonly fetchImpl: FetchLike;

    constructor(options: GeminiClientOptions = {}) {
        const config = resolveGeminiConfig();
        this.apiKey = options.apiKey ?? config.apiKey;
        this.model = options.model ?? config.model;
        this.timeoutMs = options.timeoutMs ?? 30_000;
        this.fetchImpl = options.fetchImpl ?? fetch;
    }

    isConfigured(): boolean {
        return Boolean(this.apiKey);
    }

    async generatePlan(
        context: AiGenerationContext,
        actions: RecordedStep[]
    ): Promise<AiGenerationPlan> {
        if (!this.apiKey) {
            throw new Error('Configura GEMINI_API_KEY en tools/visual-recorder/.env');
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetchImpl(
                `https://generativelanguage.googleapis.com/v1beta/models/` +
                `${encodeURIComponent(this.model)}:generateContent`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': this.apiKey
                    },
                    signal: controller.signal,
                    body: JSON.stringify({
                        systemInstruction: {
                            parts: [{
                                text:
                                    'Eres un especialista QA mobile. Devuelve únicamente el plan JSON ' +
                                    'solicitado. No inventes acciones ni expongas datos sensibles.'
                            }]
                        },
                        contents: [{
                            role: 'user',
                            parts: [{
                                text:
                                    'Prepara los nombres de los archivos y símbolos para las cuatro capas. ' +
                                    'Si existen approvedScenarioRows, no alteres su Gherkin ni sus enlaces. ' +
                                    `Contexto:\n${JSON.stringify(context)}`
                            }]
                        }],
                        generationConfig: {
                            temperature: 0.15,
                            responseMimeType: 'application/json',
                            responseSchema: generationPlanResponseSchema
                        }
                    })
                }
            );
            if (!response.ok) {
                const detail = await response.text();
                throw new Error(`Gemini respondió ${response.status}: ${detail.slice(0, 300)}`);
            }
            const payload = await response.json() as any;
            const text = payload?.candidates?.[0]?.content?.parts
                ?.map((part: any) => part.text || '')
                .join('');
            if (!text) throw new Error('Gemini devolvió una respuesta vacía');
            return validateGenerationPlan(JSON.parse(text), actions);
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                throw new Error(`Gemini excedió el timeout de ${this.timeoutMs} ms`);
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }
}
