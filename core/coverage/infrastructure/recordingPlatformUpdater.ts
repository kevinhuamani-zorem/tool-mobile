import fs from 'fs';
import path from 'path';
import {
    AutomationAgentResponse,
    AutomationScenario,
    GenerationPlan,
    MobilePlatform,
} from '../../automation/contracts';
import { projectPaths } from '../../workspace';
import { roundTrip } from '../../indexing';
export interface PlatformLocatorUpdate {
    recordingId: string;
    squad: string;
    file: string;
    name: string;
    selector: string;
    platform: MobilePlatform;
    androidBlock?: string;
    iosBlock?: string;
}

export interface PlatformLocatorUpdateResult {
    platform: MobilePlatform;
    block: string;
    previous: string;
    selector: string;
    strategy: string;
    updatedFiles: string[];
}

interface NormalizedSelector {
    value: string;
    strategy: 'ID' | 'XPATH' | 'ANDROID' | 'PREDICATESTRING' | 'CLASSCHAIN' | 'CLASSNAME';
}

function readJson<T>(file: string): T {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}

function escaped(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Completa la plataforma faltante de una grabación ya generada. El recording
 * continúa siendo la fuente de verdad y el framework recibe exactamente la
 * misma actualización revisada por el QA.
 */
export class RecordingPlatformUpdater {
    constructor(
        private readonly recordingsRoot = projectPaths.recordings,
        private readonly frameworkRoot = projectPaths.frameworkRoot,
        private readonly locatorsRoot = projectPaths.locators,
        private readonly screenobjectsRoot = projectPaths.screenobjects,
        private readonly featuresRoot = projectPaths.features
    ) {}

    update(request: PlatformLocatorUpdate): PlatformLocatorUpdateResult {
        const recordingDirectory = this.findRecording(request.recordingId, request.squad);
        const packageDirectory = path.join(recordingDirectory, 'generation', 'automation');
        const plan = readJson<GenerationPlan>(path.join(packageDirectory, 'generation-plan.json'));
        const responseFile = path.join(packageDirectory, 'agent-response.json');
        const response = fs.existsSync(responseFile)
            ? readJson<AutomationAgentResponse>(responseFile)
            : undefined;
        const relativeFile = this.safeRelativeLocator(request.file);
        const resolution = plan.resolutions.find(item =>
            item.locatorName === request.name &&
            (item.source?.file === relativeFile ||
                plan.files.some(file => file.layer === 'locators' && file.path === relativeFile))
        );
        if (!resolution) {
            throw new Error(`El locator ${request.name} no pertenece al plan de la grabación`);
        }

        const normalized = this.normalizeSelector(request.selector, request.platform);
        const locatorFile = path.resolve(this.frameworkRoot, relativeFile);
        const proposedLocator = response?.files.find(file =>
            file.layer === 'locators' && file.path === relativeFile
        );
        if (!fs.existsSync(locatorFile) && !proposedLocator) {
            throw new Error(`No existe el locator generado: ${relativeFile}`);
        }
        const locatorDocument = fs.existsSync(locatorFile)
            ? readJson<Record<string, any>>(locatorFile)
            : JSON.parse(proposedLocator!.content) as Record<string, any>;
        const block = this.resolveBlock(locatorDocument, request);
        const previous = typeof locatorDocument[block][request.name] === 'string'
            ? locatorDocument[block][request.name]
            : '';
        locatorDocument[block][request.name] = normalized.value;

        const writes = new Map<string, string>();
        const updatedFrameworkFiles = new Set<string>([locatorFile]);
        writes.set(locatorFile, JSON.stringify(locatorDocument, null, 4) + '\n');

        const screenPlan = plan.files.find(file => file.layer === 'screen');
        if (screenPlan) {
            const screenFile = this.safeFrameworkFile(screenPlan.path, this.screenobjectsRoot);
            const proposedScreen = response?.files.find(file =>
                file.layer === 'screen' && file.path === screenPlan.path
            );
            if (fs.existsSync(screenFile)) {
                const current = fs.readFileSync(screenFile, 'utf-8');
                writes.set(screenFile, this.synchronizeStrategy(
                    current, block, request.name, normalized.strategy
                ));
                updatedFrameworkFiles.add(screenFile);
            } else if (proposedScreen) {
                writes.set(screenFile, this.synchronizeStrategy(
                    proposedScreen.content, block, request.name, normalized.strategy
                ));
                updatedFrameworkFiles.add(screenFile);
            } else {
                throw new Error(`No existe el Screen Object generado: ${screenPlan.path}`);
            }
        }

        if (response) {
            response.files = response.files.map(file => {
                if (file.layer === 'locators' && file.path === relativeFile) {
                    const document = JSON.parse(file.content) as Record<string, any>;
                    const responseBlock = this.resolveBlock(document, request);
                    document[responseBlock][request.name] = normalized.value;
                    return { ...file, content: JSON.stringify(document, null, 4) + '\n' };
                }
                if (file.layer === 'screen' && file.path === screenPlan?.path) {
                    return {
                        ...file,
                        content: this.synchronizeStrategy(
                            file.content, block, request.name, normalized.strategy
                        ),
                    };
                }
                return file;
            });
            writes.set(responseFile, JSON.stringify(response, null, 2) + '\n');
        }

        const statusFile = path.join(packageDirectory, 'status.json');
        const status = fs.existsSync(statusFile) ? readJson<Record<string, any>>(statusFile) : {};
        writes.set(statusFile, JSON.stringify({
            ...status,
            platformCompletion: {
                ...(status.platformCompletion || {}),
                [request.platform]: {
                    state: 'in-progress',
                    lastLocator: request.name,
                    updatedAt: new Date().toISOString(),
                },
            },
            updatedAt: new Date().toISOString(),
        }, null, 2) + '\n');

        this.writeTransaction(writes);
        return {
            platform: request.platform,
            block,
            previous,
            selector: normalized.value,
            strategy: normalized.strategy,
            updatedFiles: [...updatedFrameworkFiles]
                .map(file => path.relative(this.frameworkRoot, file).replace(/\\/g, '/')),
        };
    }

    markComplete(recordingId: string, squad: string, platform: MobilePlatform): string[] {
        const directory = this.findRecording(recordingId, squad);
        const packageDirectory = path.join(directory, 'generation', 'automation');
        const statusFile = path.join(packageDirectory, 'status.json');
        const plan = readJson<GenerationPlan>(path.join(packageDirectory, 'generation-plan.json'));
        const responseFile = path.join(packageDirectory, 'agent-response.json');
        const response = fs.existsSync(responseFile)
            ? readJson<AutomationAgentResponse>(responseFile)
            : undefined;
        const status = fs.existsSync(statusFile) ? readJson<Record<string, any>>(statusFile) : {};
        const writes = new Map<string, string>();
        const updatedFiles: string[] = [];
        const featurePlan = plan.files.find(file => file.layer === 'feature');
        if (!featurePlan) throw new Error('El plan no contiene un Feature para actualizar');
        const featureFile = this.safeFrameworkFile(featurePlan.path, this.featuresRoot);
        const proposedFeature = response?.files.find(file =>
            file.layer === 'feature' && file.path === featurePlan.path
        );
        if (!fs.existsSync(featureFile) && !proposedFeature) {
            throw new Error(`No existe el Feature generado: ${featurePlan.path}`);
        }
        const featureContent = fs.existsSync(featureFile)
            ? fs.readFileSync(featureFile, 'utf-8')
            : proposedFeature!.content;
        writes.set(featureFile, this.synchronizePlatformTag(featureContent, platform));
        updatedFiles.push(featurePlan.path);

        if (response) {
            response.files = response.files.map(file => file.layer === 'feature' && file.path === featurePlan.path
                ? { ...file, content: this.synchronizePlatformTag(file.content, platform) }
                : file
            );
            writes.set(responseFile, JSON.stringify(response, null, 2) + '\n');
        }
        writes.set(statusFile, JSON.stringify({
            ...status,
            platformCompletion: {
                ...(status.platformCompletion || {}),
                [platform]: {
                    state: 'complete',
                    completedAt: new Date().toISOString(),
                },
            },
            updatedAt: new Date().toISOString(),
        }, null, 2) + '\n');
        this.writeTransaction(writes);
        return updatedFiles;
    }

    private findRecording(recordingId: string, squad: string): string {
        if (!recordingId || !fs.existsSync(this.recordingsRoot)) {
            throw new Error('Grabación no encontrada');
        }
        for (const entry of fs.readdirSync(this.recordingsRoot, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const directory = path.join(this.recordingsRoot, entry.name);
            const candidates = [
                path.join(directory, 'generation', 'automation', 'scenario.json'),
                path.join(directory, 'scenario.json'),
            ];
            for (const candidate of candidates) {
                if (!fs.existsSync(candidate)) continue;
                try {
                    const scenario = readJson<AutomationScenario>(candidate);
                    if (scenario.recordingId === recordingId && scenario.squad === squad) {
                        return directory;
                    }
                } catch {
                    // Continúa con la siguiente fuente del recording.
                }
            }
        }
        throw new Error(`No se encontró la grabación ${recordingId} para ${squad}`);
    }

    private safeRelativeLocator(file: string): string {
        const relative = String(file || '').replace(/\\/g, '/');
        if (!relative.startsWith('resources/locators/') || !relative.endsWith('.locator.json')) {
            throw new Error('El archivo no pertenece a resources/locators');
        }
        this.safeFrameworkFile(relative, this.locatorsRoot);
        return relative;
    }

    private safeFrameworkFile(relative: string, allowedRoot: string): string {
        if (path.isAbsolute(relative) || relative.split('/').includes('..')) {
            throw new Error(`Ruta no permitida: ${relative}`);
        }
        const resolved = path.resolve(this.frameworkRoot, relative);
        const root = path.resolve(allowedRoot) + path.sep;
        if (!resolved.startsWith(root)) throw new Error(`Ruta fuera del workspace: ${relative}`);
        return resolved;
    }

    /**
     * Esta es la puerta por la que el QA completa a mano el locator que falta
     * en la otra plataforma, asi que escribe directo en el JSON del framework.
     * El par (estrategia, valor) sale de `locatorStrategy` — antes habia aqui
     * una tercera copia del recorte de prefijos, y arrastraba el mismo fallo:
     * `id=com.yape.qa:id/btn` se guardaba como ID, o sea `~com.yape.qa:id/btn`,
     * que es accesibilidad y no encuentra nada.
     */
    private normalizeSelector(selector: string, platform: MobilePlatform): NormalizedSelector {
        const value = String(selector || '').trim();
        if (!value) throw new Error('El selector no puede estar vacío');
        if (value.startsWith('android=') && platform !== 'android') {
            throw new Error('Una estrategia Android no puede asignarse a iOS');
        }
        if ((value.startsWith('iosPredicate=') || value.startsWith('iosClassChain=')) && platform !== 'ios') {
            throw new Error('Una estrategia iOS no puede asignarse a Android');
        }
        const check = roundTrip(value, platform);
        if (!check.ok) throw new Error(check.reason);
        return { value: check.value, strategy: check.type };
    }

    private resolveBlock(document: Record<string, any>, request: PlatformLocatorUpdate): string {
        const requested = request.platform === 'android' ? request.androidBlock : request.iosBlock;
        let block = requested && document[requested] && typeof document[requested] === 'object'
            ? requested
            : Object.keys(document).find(key => key.toLowerCase().endsWith(request.platform));
        if (!block) {
            const counterpart = request.platform === 'android' ? request.iosBlock : request.androidBlock;
            block = counterpart
                ? counterpart.replace(/(android|ios)$/i, request.platform === 'android' ? 'Android' : 'Ios')
                : undefined;
        }
        if (!block) throw new Error(`No se pudo resolver el bloque ${request.platform}`);
        if (!document[block]) document[block] = {};
        if (typeof document[block] !== 'object' || Array.isArray(document[block])) {
            throw new Error(`El bloque ${block} no es válido`);
        }
        return block;
    }

    private synchronizeStrategy(
        content: string,
        block: string,
        locatorName: string,
        strategy: NormalizedSelector['strategy']
    ): string {
        const blockName = escaped(block);
        const access = `Locators(?:\\["${blockName}"\\]|\\['${blockName}'\\]|\\.${blockName})\\.${escaped(locatorName)}`;
        const pattern = new RegExp(`TypeLocator\\.[A-Z]+(\\s*,\\s*${access})`);
        if (!pattern.test(content)) {
            throw new Error(`El Screen Object no referencia ${block}.${locatorName}`);
        }
        return content.replace(pattern, `TypeLocator.${strategy}$1`);
    }

    private synchronizePlatformTag(content: string, platform: MobilePlatform): string {
        const tag = `@${platform}`;
        if (new RegExp(`^\\s*@[^\\n]*${escaped(tag)}(?:\\s|$)`, 'mi').test(content)) {
            return content;
        }
        const hadFinalNewline = /\r?\n$/.test(content);
        const lines = content.replace(/\r\n/g, '\n').split('\n');
        const scenarioIndex = lines.findIndex(line => /^\s*Scenario(?: Outline)?:/i.test(line));
        if (scenarioIndex < 0) throw new Error('El Feature no contiene un Scenario válido');
        let tagIndex = scenarioIndex - 1;
        while (tagIndex >= 0 && !lines[tagIndex].trim()) tagIndex -= 1;
        if (tagIndex >= 0 && /^\s*@/.test(lines[tagIndex])) {
            lines[tagIndex] = `${lines[tagIndex].trimEnd()} ${tag}`;
        } else {
            const indentation = lines[scenarioIndex].match(/^\s*/)?.[0] || '  ';
            lines.splice(scenarioIndex, 0, `${indentation}${tag}`);
        }
        const normalized = lines.join('\n');
        return hadFinalNewline || normalized.endsWith('\n') ? normalized : `${normalized}\n`;
    }

    private writeTransaction(writes: Map<string, string>): void {
        const originals = new Map<string, Buffer | undefined>();
        const temporaries = new Map<string, string>();
        try {
            for (const [file, content] of writes) {
                fs.mkdirSync(path.dirname(file), { recursive: true });
                originals.set(file, fs.existsSync(file) ? fs.readFileSync(file) : undefined);
                const temporary = `${file}.platform-${process.pid}-${Math.random().toString(16).slice(2)}.tmp`;
                fs.writeFileSync(temporary, content, { encoding: 'utf-8', flag: 'wx' });
                temporaries.set(file, temporary);
            }
            for (const [file, temporary] of temporaries) fs.renameSync(temporary, file);
        } catch (error) {
            for (const temporary of temporaries.values()) {
                if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
            }
            for (const [file, original] of originals) {
                if (original) fs.writeFileSync(file, original);
                else if (fs.existsSync(file)) fs.unlinkSync(file);
            }
            throw error;
        }
    }
}
