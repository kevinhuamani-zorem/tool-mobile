/**
 * Artefactos con hash y handoffs verificados, caches por fingerprint, normalizaciones de salida y el contrato provisional de interfaz que permite a Zorem arrancar en paralelo.
 */
import fs from 'fs';
import path from 'path';
import {
    AgentGeneratedFile,
    AutomationAgentResponse,
    GenerationPlan,
} from '../../contracts';
import {
    GenerationAgentRole,
    LAYERED_GENERATION_AGENTS,
    LayeredAgentResult,
    LayeredGenerationHandoff,
    sha256Text,
} from '../../domain/layeredGenerationContracts';
import {
    readJsonUtf8,
    readUtf8File,
    writeJsonUtf8,
} from '../../../shared';
import { projectPaths } from '../../../workspace';
import {
    AuthorCacheTarget,
    DELEGATES,
    INPUT_FILES,
    LAYERED_CACHE_SCHEMA_VERSION,
    ROLE_OUTPUTS,
} from './roles';
import {
    integrationPrompt,
    partialPrompt,
} from './prompts';

export function artifact(file: string, root: string) {
    const content = readUtf8File(file);
    return {
        path: path.relative(root, file).replace(/\\/g, '/'),
        sha256: sha256Text(content),
        bytes: Buffer.byteLength(content, 'utf8'),
    };
}

export function filesInside(directory: string): string[] {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const candidate = path.join(directory, entry.name);
        return entry.isDirectory() ? filesInside(candidate) : entry.isFile() ? [candidate] : [];
    });
}

export function stableFingerprint(value: unknown): string {
    return sha256Text(JSON.stringify(value));
}

/**
 * Cachés de Lorem/Zorem/Sumrak: viven en la memoria del recorder, no en el
 * recording. Un resultado verificado sirve a cualquier recording cuyos inputs
 * sean los mismos una vez quitados los identificadores propios de la
 * grabación (recordingId, planId, fechas): una regrabación del mismo caso o
 * una regeneración desde otra carpeta no vuelven a pagar al agente.
 */
export function agentCacheRoot(): string {
    return path.join(projectPaths.automationMemory, 'agent-cache');
}

/**
 * Claves que cambian entre recordings sin cambiar lo que el agente tiene que
 * producir. Todo lo demas (acciones, selectores, caseId, tag, plan de
 * archivos, baselines) si forma parte de la identidad del input.
 */
const VOLATILE_KEYS = new Set([
    'recordingId', 'planId', 'fingerprint', 'revision', 'createdAt', 'updatedAt',
    'generatedAt', 'promotedAt', 'materializedAt', 'startedAt', 'finishedAt',
    'timestamp', 'runId', 'sessionId', 'sessionName',
]);

function withoutVolatileKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(withoutVolatileKeys);
    if (value && typeof value === 'object') {
        const output: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            if (VOLATILE_KEYS.has(key)) continue;
            output[key] = withoutVolatileKeys((value as Record<string, unknown>)[key]);
        }
        return output;
    }
    return value;
}

/** Identidad de un input sin los ids del recording: la clave de caché. */
export function memoryIdentity(file: string): string {
    const content = readUtf8File(file);
    if (!file.endsWith('.json')) return sha256Text(content);
    try {
        return sha256Text(JSON.stringify(withoutVolatileKeys(JSON.parse(content))));
    } catch {
        return sha256Text(content);
    }
}

/**
 * Un resultado cacheado nacio en otro recording: antes de validarlo contra el
 * plan actual se le ponen los ids de este paquete. El contenido no cambia.
 */
export function rebindCachedResult<T extends { recordingId?: string; planId?: string }>(
    value: T,
    plan: Pick<GenerationPlan, 'recordingId' | 'planId'>,
): T {
    if (!value || typeof value !== 'object') return value;
    if ('recordingId' in value) value.recordingId = plan.recordingId;
    if ('planId' in value) value.planId = plan.planId;
    return value;
}

export function normalizeCucumberStepDefinitions(content: string): string {
    let previousKeyword: 'Given' | 'When' | 'Then' = 'Then';
    return content.split('\n').map(line => {
        let normalized = line.replace(
            /import\s*\{([^}]*)\}\s*from\s*(['"])(@cucumber\/cucumber|@wdio\/cucumber-framework)\2;?/g,
            (_match, names: string, quote: string, source: string) => {
                const supported = names
                    .split(',')
                    .map(item => item.trim())
                    .filter(Boolean)
                    .filter(item => !/^(?:And|But)(?:\s+as\s+\w+)?$/.test(item));
                return `import { ${supported.join(', ')} } from ${quote}${source}${quote};`;
            },
        );
        const declaration = normalized.match(/^(\s*)(Given|When|Then|And|But)(\s*\()/);
        if (!declaration) return normalized;
        const keyword = declaration[2];
        if (keyword === 'Given' || keyword === 'When' || keyword === 'Then') {
            previousKeyword = keyword;
            return normalized;
        }
        normalized = normalized.replace(
            /^(\s*)(?:And|But)(\s*\()/,
            `$1${previousKeyword}$2`,
        );
        return normalized;
    }).join('\n');
}

export function normalizeBehaviorResult(result: LayeredAgentResult): boolean {
    if (result.role !== 'behavior-author') return false;
    let changed = false;
    for (const file of result.files) {
        if (file.layer !== 'steps') continue;
        const normalized = normalizeCucumberStepDefinitions(file.content);
        if (normalized !== file.content) {
            file.content = normalized;
            changed = true;
        }
    }
    return changed;
}

export function normalizeAutomationResponse(response: AutomationAgentResponse): boolean {
    let changed = false;
    for (const file of response.files || []) {
        if (file.layer !== 'steps') continue;
        const normalized = normalizeCucumberStepDefinitions(file.content);
        if (normalized !== file.content) {
            file.content = normalized;
            changed = true;
        }
    }
    return changed;
}

export function actionInterfaceFingerprint(resultFile: string): string {
    return interfaceFingerprint(readJsonUtf8<LayeredAgentResult>(resultFile).actionTrace);
}

export function pipelineFingerprint(packageDirectory: string, model: string): string {
    const files = [
        ...INPUT_FILES.map(file => path.join(packageDirectory, file)),
        ...filesInside(path.join(packageDirectory, 'baselines')),
    ]
        .filter(file => fs.existsSync(file) && fs.statSync(file).isFile())
        .sort()
        .map(file => ({
            path: path.relative(packageDirectory, file).replace(/\\/g, '/'),
            sha256: memoryIdentity(file),
        }));
    return stableFingerprint({
        schemaVersion: LAYERED_CACHE_SCHEMA_VERSION,
        model,
        files,
        prompts: {
            behavior: partialPrompt('behavior-author', ROLE_OUTPUTS['behavior-author'], false),
            interaction: partialPrompt('interaction-author', ROLE_OUTPUTS['interaction-author'], false),
            integration: integrationPrompt(false),
        },
    });
}

export function pipelineCacheFile(fingerprint: string): string {
    return path.join(agentCacheRoot(), 'pipeline', `${fingerprint}.json`);
}

export function promoteAuthorCache(outputFile: string, target: AuthorCacheTarget): void {
    if (!target.file) return;
    fs.mkdirSync(path.dirname(target.file), { recursive: true });
    fs.copyFileSync(outputFile, target.file);
}

export function writeHandoff(
    file: string,
    input: Omit<LayeredGenerationHandoff, 'schemaVersion' | 'createdAt'>,
): void {
    writeJsonUtf8(file, {
        schemaVersion: 1,
        ...input,
        createdAt: new Date().toISOString(),
    });
}

export function interfaceFingerprint(actionTrace: LayeredAgentResult['actionTrace'] | undefined): string {
    return stableFingerprint((actionTrace || []).map(trace => ({
        sequence: trace.sequence,
        screenMethod: trace.screenMethod || '',
        locatorName: trace.locatorName || '',
    })));
}

/**
 * Contrato provisional de interfaz para que Zorem arranque sin esperar a
 * Lorem: el `actionTrace` del borrador determinista con la misma forma que un
 * `behavior-result.json`. Derek lo publica con handoff verificado; si Lorem
 * entrega otra interfaz, Zorem se relanza con la real.
 */
export function writeDraftBehaviorContract(
    packageDirectory: string,
    agentsRoot: string,
    plan: GenerationPlan,
): string | undefined {
    const draftFile = path.join(packageDirectory, 'deterministic-draft.json');
    if (!fs.existsSync(draftFile)) return undefined;
    const draft = readJsonUtf8<{ files?: AgentGeneratedFile[]; actionTrace?: LayeredAgentResult['actionTrace'] }>(draftFile);
    if (!Array.isArray(draft.actionTrace) || !draft.actionTrace.length) return undefined;
    const ownerDirectory = path.join(agentsRoot, LAYERED_GENERATION_AGENTS.owner.directory);
    fs.mkdirSync(ownerDirectory, { recursive: true });
    const contractFile = path.join(ownerDirectory, 'behavior-result.json');
    const contract: LayeredAgentResult = {
        schemaVersion: 1,
        role: 'behavior-author',
        recordingId: plan.recordingId,
        planId: plan.planId,
        files: (draft.files || []).filter(file => file.layer === 'feature' || file.layer === 'steps'),
        actionTrace: draft.actionTrace,
        assumptions: [
            'Contrato provisional de Derek derivado del borrador determinista: Lorem puede ajustar la redacción, no la interfaz screenMethod/locatorName.',
        ],
    };
    writeJsonUtf8(contractFile, contract);
    writeHandoff(path.join(ownerDirectory, 'output-handoff.json'), {
        from: 'recorder',
        to: 'interaction-author',
        fromAgent: LAYERED_GENERATION_AGENTS.owner.name,
        toAgent: LAYERED_GENERATION_AGENTS['interaction-author'].name,
        recordingId: plan.recordingId,
        planId: plan.planId,
        stage: 'draft-contract',
        status: 'completed',
        artifacts: [artifact(contractFile, ownerDirectory)],
        instructions: ['Interfaz provisional del borrador determinista; Lorem redacta en paralelo.'],
    });
    return contractFile;
}

export function sessionName(recordingId: string, role: GenerationAgentRole, attempt = 0): string {
    const base = `${LAYERED_GENERATION_AGENTS.owner.name}/${recordingId}/${LAYERED_GENERATION_AGENTS[role].name}`;
    return attempt > 0 ? `${base}/repair-${attempt}` : base;
}

export function writeOwnerManifest(
    agentsRoot: string,
    plan: GenerationPlan,
    state: 'running' | 'completed' | 'failed',
): void {
    const ownerDirectory = path.join(agentsRoot, LAYERED_GENERATION_AGENTS.owner.directory);
    fs.mkdirSync(ownerDirectory, { recursive: true });
    writeJsonUtf8(path.join(ownerDirectory, 'orchestration.json'), {
        schemaVersion: 1,
        owner: LAYERED_GENERATION_AGENTS.owner,
        recordingId: plan.recordingId,
        planId: plan.planId,
        state,
        delegates: DELEGATES,
        sequence: DELEGATES.map(delegate => delegate.name),
        updatedAt: new Date().toISOString(),
    });
}

export function verifyOutputHandoff(outputFile: string): void {
    const handoffFile = path.join(path.dirname(outputFile), 'output-handoff.json');
    const handoff = readJsonUtf8<LayeredGenerationHandoff>(handoffFile);
    const expected = handoff.artifacts.find(entry => entry.path === path.basename(outputFile));
    if (!expected) throw new Error(`Handoff sin referencia a ${path.basename(outputFile)}.`);
    const actual = artifact(outputFile, path.dirname(outputFile));
    if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) {
        throw new Error(`El resultado ${path.basename(outputFile)} cambió después de su handoff.`);
    }
}
