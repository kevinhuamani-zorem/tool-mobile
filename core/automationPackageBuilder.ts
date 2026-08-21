import fs from 'fs';
import path from 'path';
import {
    AgentGeneratedFile,
    AutomationAgentResponse,
    AutomationPackageResult,
    AutomationScenario,
    GenerationPlan,
} from './automationContracts';
import { AutomationMemory } from './automationMemory';
import { AutomationResponseValidator } from './automationResponseValidator';
import { DeterministicResolver, ResolverResult } from './deterministicResolver';
import { FwkMobileGenerator, GeneratedPreview } from './fwkMobileGenerator';
import { projectPaths } from './projectPaths';

function writeJson(file: string, value: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function relative(file: string): string {
    return path.relative(projectPaths.frameworkRoot, file).replace(/\\/g, '/');
}

function responseFromPreview(
    scenario: AutomationScenario,
    plan: GenerationPlan,
    preview: GeneratedPreview
): AutomationAgentResponse {
    const files: AgentGeneratedFile[] = [{
        layer: 'feature', path: relative(preview.featurePath), content: preview.featureContent,
    }];
    if (preview.stepPath && preview.stepContent) files.push({ layer: 'steps', path: relative(preview.stepPath), content: preview.stepContent });
    if (preview.screenPath && preview.screenContent) files.push({ layer: 'screen', path: relative(preview.screenPath), content: preview.screenContent });
    if (preview.locatorPath && preview.locatorContent) files.push({ layer: 'locators', path: relative(preview.locatorPath), content: preview.locatorContent });
    return {
        schemaVersion: 1,
        recordingId: scenario.recordingId,
        planId: plan.planId,
        resolutions: [],
        actionTrace: scenario.request.scenarioRows?.slice(1).flatMap(row =>
            (row.actions || []).map(action => ({
                sequence: action.sequence!,
                gherkinStep: `${row.keyword} ${row.text}`,
                locatorName: plan.resolutions.find(item => item.sequence === action.sequence)?.locatorName,
            }))
        ) || [],
        files,
        assumptions: ['Salida producida completamente por el resolver determinista.'],
    };
}

function responseSchema(): object {
    return {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        required: ['schemaVersion', 'recordingId', 'planId', 'resolutions', 'actionTrace', 'files'],
        properties: {
            schemaVersion: { const: 1 },
            recordingId: { type: 'string' },
            planId: { type: 'string' },
            resolutions: { type: 'array', items: { type: 'object', required: ['gapId', 'decision'] } },
            actionTrace: { type: 'array', items: { type: 'object', required: ['sequence', 'gherkinStep'] } },
            files: { type: 'array', minItems: 4, maxItems: 4 },
            assumptions: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
    };
}

function instructions(result: ResolverResult): string {
    return `# Contrato del agente de automatización\n\n` +
        `Objetivo: resolver únicamente los gaps de \`unresolved-context.json\` y escribir \`agent-response.json\`.\n\n` +
        `Reglas:\n` +
        `- Lee solo: generation-plan.json, resolved-context.json, unresolved-context.json y scenario.json.\n` +
        `- No explores el repositorio ni leas XML/capturas salvo que un gap lo pida explícitamente.\n` +
        `- Conserva exactamente recordingId, planId y las cuatro rutas del plan.\n` +
        `- Los selectores verificados y decisiones reuse/create del plan son definitivos.\n` +
        `- Steps solo orquestan; Screen Object extiende BaseScreen; un nombre lógico sirve para Android/iOS.\n` +
        `- Incluye trazabilidad para las ${result.scenario.actions.length} acciones en orden.\n` +
        `- El Feature debe tener @tag, [TC-N][Happy|Unhappy Path][AUTO-FRONT] y un Then real.\n` +
        `- Finaliza en menos de 5 minutos. No escribas fuera de esta carpeta.\n` +
        `- Ejecuta \`node verify-package.js\`. Si falla, realiza una sola reparación dirigida.\n`;
}

function verifierSource(): string {
    return `'use strict';\nconst fs=require('fs');\nconst plan=require('./generation-plan.json');\nconst scenario=require('./scenario.json');\nlet response;\ntry{response=require('./agent-response.json')}catch(e){console.error('Falta agent-response.json');process.exit(1)}\nconst errors=[];\nif(response.recordingId!==scenario.recordingId)errors.push('recordingId no coincide');\nif(response.planId!==plan.planId)errors.push('planId no coincide');\nfor(const f of plan.files){const got=(response.files||[]).find(x=>x.layer===f.layer);if(!got)errors.push('Falta '+f.layer);else if(got.path!==f.path)errors.push('Ruta inválida '+got.path)}\nfor(const id of plan.unresolvedGapIds){if(!(response.resolutions||[]).some(x=>x.gapId===id))errors.push('Gap no resuelto '+id)}\nfor(const a of scenario.actions){if(!(response.actionTrace||[]).some(x=>x.sequence===a.sequence))errors.push('Acción sin traza '+a.sequence)}\nconst feature=(response.files||[]).find(x=>x.layer==='feature')?.content||'';\nconst steps=(response.files||[]).find(x=>x.layer==='steps')?.content||'';\nconst screen=(response.files||[]).find(x=>x.layer==='screen')?.content||'';\nif(!/^\\s*@[-A-Za-z0-9_]+/m.test(feature))errors.push('Feature sin tag válido');\nif(!/Scenario(?: Outline)?: \\[TC-\\d+\\]\\[(?:Happy|Unhappy) Path\\]\\[AUTO-FRONT\\]/.test(feature))errors.push('Formato Scenario inválido');\nif(!/^\\s*Then\\s+\\S+/m.test(feature))errors.push('Scenario sin Then');\nconst defs=[...steps.matchAll(/(?:Given|When|Then)\\(\\/\\^([^\\n]+?)\\$\\//g)].map(x=>x[1]);\nif(defs.some((x,i)=>defs.indexOf(x)!==i))errors.push('Definición Gherkin duplicada');\nconst methods=[...screen.matchAll(/public\\s+async\\s+([A-Za-z_$][\\w$]*)\\s*\\(/g)].map(x=>x[1]);\nif(methods.some((x,i)=>methods.indexOf(x)!==i))errors.push('Método Screen Object duplicado');\nif(/Locators\\.[A-Za-z_$][\\w$]*-/.test(screen))errors.push('Acceso inválido a bloque locator con guiones');\nif(errors.length){console.error(errors.join('\\n'));process.exit(1)}console.log('PASS: contrato del paquete válido');\n`;
}

export class AutomationPackageBuilder {
    constructor(
        private readonly resolver = new DeterministicResolver(),
        private readonly memory = new AutomationMemory(),
        private readonly generator = new FwkMobileGenerator(),
        private readonly validator = new AutomationResponseValidator(),
    ) {}

    prepare(scenario: AutomationScenario, recordingDirectory: string): AutomationPackageResult {
        const result = this.resolver.resolve(scenario);
        const packageDirectory = path.join(recordingDirectory, 'generation', 'automation');
        fs.mkdirSync(packageDirectory, { recursive: true });
        const memoryHit = this.memory.find(result.scenario.fingerprint);
        if (memoryHit) result.plan.status = 'memory-hit';
        writeJson(path.join(packageDirectory, 'scenario.json'), result.scenario);
        writeJson(path.join(packageDirectory, 'generation-plan.json'), result.plan);
        writeJson(path.join(packageDirectory, 'resolved-context.json'), result.resolvedContext);
        writeJson(path.join(packageDirectory, 'unresolved-context.json'), result.unresolvedContext);
        writeJson(path.join(packageDirectory, 'agent-response.schema.json'), responseSchema());
        fs.writeFileSync(path.join(packageDirectory, 'instructions.md'), instructions(result));
        fs.writeFileSync(path.join(packageDirectory, 'verify-package.js'), verifierSource());
        for (const stale of ['agent-response.json', 'validation.json', 'repair-context.json']) {
            const file = path.join(packageDirectory, stale);
            if (fs.existsSync(file)) fs.unlinkSync(file);
        }

        let response: AutomationAgentResponse | undefined;
        let memoryVersion: number | undefined;
        if (memoryHit) {
            memoryVersion = memoryHit.entry.version;
            response = {
                ...memoryHit.response,
                recordingId: result.scenario.recordingId,
                planId: result.plan.planId,
            };
        } else if (!result.plan.unresolvedGapIds.length) {
            const preview = this.generator.preview(result.scenario.request, result.scenario.actions);
            response = responseFromPreview(result.scenario, result.plan, preview);
        }

        let validation;
        if (response) {
            writeJson(path.join(packageDirectory, 'agent-response.json'), response);
            validation = this.validator.validate(result.scenario, result.plan, response);
            writeJson(path.join(packageDirectory, 'validation.json'), validation);
        }
        writeJson(path.join(packageDirectory, 'status.json'), {
            recordingId: result.scenario.recordingId,
            planId: result.plan.planId,
            state: response ? (validation?.valid ? 'ready-for-review' : 'needs-repair') : 'ready-for-agent',
            preparedAt: new Date().toISOString(),
            budgets: result.plan.budgets,
        });
        const contextBytes = ['scenario.json', 'generation-plan.json', 'resolved-context.json', 'unresolved-context.json', 'instructions.md']
            .reduce((total, file) => total + fs.statSync(path.join(packageDirectory, file)).size, 0);
        if (contextBytes > result.plan.budgets.maxContextBytes) {
            throw new Error(`El contexto mínimo excede ${result.plan.budgets.maxContextBytes} bytes (${contextBytes})`);
        }
        return {
            packageDirectory,
            recordingId: result.scenario.recordingId,
            planId: result.plan.planId,
            status: result.plan.status,
            deterministicCoverage: result.plan.deterministicCoverage,
            unresolvedGaps: result.plan.unresolvedGapIds.length,
            memoryVersion,
            agentRequired: !response,
            responseAvailable: Boolean(response),
            validation,
        };
    }
}
