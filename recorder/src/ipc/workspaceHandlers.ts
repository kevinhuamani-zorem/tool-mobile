import fs from 'fs';
import path from 'path';
import { app, ipcMain } from 'electron';
import { FrameworkScanner, getWorkspaceAdapter, projectPaths } from '../../../core/workspace';
import { ReuseAnalyzer, indexDeclaredStrategies, roundTrip } from '../../../core/indexing';
import { RecordingCoverageAnalyzer, RecordingPlatformUpdater } from '../../../core/coverage';
import { GeneratedFileRegistry, MobilePlatform } from '../../../core/automation';
import { normalizeJsonUnicode, writeUtf8FileAtomic } from '../../../core/shared';
import { RecorderRuntimeState } from './runtimeState';
import { selectAndSaveWorkspaceRoot } from '../workspaceBootstrap';

/**
 * Dependencias del catálogo de workspace: consulta del framework, catálogo de
 * squad, cobertura de escenarios existentes y asignación de valores de
 * locator. No inicia ni cierra sesiones; solo lee y escribe el catálogo del
 * framework padre a partir de la sesión que ya esté activa.
 */
export interface WorkspaceHandlersContext {
    state: RecorderRuntimeState;
    frameworkScanner: FrameworkScanner;
    reuseAnalyzer: ReuseAnalyzer;
    workspaceAdapter: ReturnType<typeof getWorkspaceAdapter>;
    recordingCoverageAnalyzer: RecordingCoverageAnalyzer;
    recordingPlatformUpdater: RecordingPlatformUpdater;
    generatedFileRegistry: GeneratedFileRegistry;
}

export function registerWorkspaceHandlers(context: WorkspaceHandlersContext): void {
    const {
        state,
        frameworkScanner,
        reuseAnalyzer,
        workspaceAdapter,
        recordingCoverageAnalyzer,
        recordingPlatformUpdater,
        generatedFileRegistry,
    } = context;

    ipcMain.handle('scan-framework', async () => {
        try {
            return { success: true, catalog: frameworkScanner.scan() };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('analyze-step-reuse', async (_, texts: string[], squad?: string) => {
        try {
            reuseAnalyzer.refresh();
            return {
                success: true,
                steps: reuseAnalyzer.analyzeSteps(texts, squad || state.activeSquad),
                screenMethods: reuseAnalyzer.getScreenMethods(squad || state.activeSquad)
            };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('analyze-step-impact', async (_, texts: string[], squad?: string) => {
        try {
            reuseAnalyzer.refresh();
            return {
                success: true,
                steps: reuseAnalyzer.analyzeStepImpact(texts, squad || state.activeSquad)
            };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('get-workspace-info', async () => workspaceAdapter.describe());

    ipcMain.handle('select-framework-root', async () => {
        const result = await selectAndSaveWorkspaceRoot();
        if (result.success) {
            // Da tiempo al renderer para limpiar preferencias del framework
            // anterior y mostrar el estado antes del relanzamiento.
            setTimeout(() => {
                app.relaunch();
                app.quit();
            }, 700);
        }
        return result;
    });

    ipcMain.handle('get-squad-catalog', async (_, squad?: string, platform?: MobilePlatform, featureScope?: string) => {
        try {
            const selectedSquad = squad || state.activeSquad;
            const selectedPlatform = platform === 'ios' ? 'ios' : 'android';
            return {
                success: true,
                catalog: reuseAnalyzer.getCatalog(selectedSquad, selectedPlatform, featureScope)
            };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('get-existing-scenarios', async (_, squad?: string) => {
        try {
            return {
                success: true,
                scenarios: recordingCoverageAnalyzer.listRecordings(
                    squad || state.activeSquad,
                    state.activeEnvironment
                )
            };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('get-scenario-coverage', async (_, scenarioId: string, squad?: string) => {
        try {
            return {
                success: true,
                coverage: recordingCoverageAnalyzer.analyze(
                    squad || state.activeSquad,
                    scenarioId,
                    state.activeEnvironment
                ),
                platform: state.recordingPlatform
            };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('assign-locator-value', async (_, request: {
        recordingId?: string;
        file: string;
        name: string;
        selector: string;
        platform?: MobilePlatform;
        androidBlock?: string;
        iosBlock?: string;
    }) => {
        try {
            if (!state.sessionActive) throw new Error('Sin sesion activa');
            const platform: MobilePlatform = state.recordingPlatform;
            if (request.platform && request.platform !== platform) {
                throw new Error(`La sesion activa es ${platform}; no se puede escribir en ${request.platform}`);
            }
            const name = String(request.name || '').trim();
            const executableSelector = String(request.selector || '').trim();
            if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
                throw new Error(`Nombre de locator invalido: ${name}`);
            }
            if (!executableSelector) throw new Error('El selector no puede estar vacio');
            if (request.recordingId) {
                const updated = recordingPlatformUpdater.update({
                    recordingId: request.recordingId,
                    squad: state.activeSquad,
                    file: request.file,
                    name,
                    selector: executableSelector,
                    platform,
                    androidBlock: request.androidBlock,
                    iosBlock: request.iosBlock,
                });
                for (const relative of updated.updatedFiles) {
                    generatedFileRegistry.registerUpdatedFile(
                        path.resolve(projectPaths.frameworkRoot, relative),
                        state.activeSquad
                    );
                }
                const coverage = recordingCoverageAnalyzer.analyze(
                    state.activeSquad,
                    request.recordingId,
                    state.activeEnvironment
                );
                const activeKey = platform === 'ios' ? 'iosSelector' : 'androidSelector';
                const complete = coverage.locators.every(locator => Boolean(locator[activeKey]));
                if (complete) {
                    const platformFiles = recordingPlatformUpdater.markComplete(
                        request.recordingId,
                        state.activeSquad,
                        platform
                    );
                    for (const relative of platformFiles) {
                        generatedFileRegistry.registerUpdatedFile(
                            path.resolve(projectPaths.frameworkRoot, relative),
                            state.activeSquad
                        );
                    }
                }
                return {
                    success: true,
                    ...updated,
                    coverageComplete: complete,
                    catalog: reuseAnalyzer.getCatalog(state.activeSquad, platform),
                };
            }
            // El valor que va al JSON sale del mismo traductor que usa el
            // generador. Recortar prefijos a mano guardaba `id=com.yape.qa:id/btn`
            // como `com.yape.qa:id/btn`, que el getter volvia a componer como
            // accesibilidad y no encontraba nada.
            const check = roundTrip(executableSelector, platform);
            if (!check.ok) throw new Error(check.reason);
            const selector = check.value;

            const relativeFile = String(request.file || '').replace(/\\/g, '/');
            if (!relativeFile.startsWith('resources/locators/') || !relativeFile.endsWith('.json')) {
                throw new Error('El archivo no pertenece a resources/locators');
            }
            const file = path.resolve(projectPaths.frameworkRoot, relativeFile);
            const locatorRoot = path.resolve(projectPaths.locators) + path.sep;
            if (!file.startsWith(locatorRoot) || !fs.existsSync(file)) {
                throw new Error(`No existe el archivo de locators: ${relativeFile}`);
            }

            const document = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, any>;
            const requestedBlock = platform === 'android' ? request.androidBlock : request.iosBlock;
            let blockName = requestedBlock && document[requestedBlock] &&
                typeof document[requestedBlock] === 'object' &&
                requestedBlock.toLowerCase().endsWith(platform)
                ? requestedBlock
                : Object.keys(document).find(block => block.toLowerCase().endsWith(platform));

            if (!blockName) {
                const counterpart = platform === 'android' ? request.iosBlock : request.androidBlock;
                if (counterpart) {
                    blockName = counterpart.replace(
                        /(android|ios)$/i,
                        platform === 'android' ? 'Android' : 'Ios'
                    );
                } else {
                    const moduleName = path.basename(file).replace(/\.locator\.json$/i, '');
                    const camel = moduleName.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
                    blockName = `${camel}${platform === 'android' ? 'Android' : 'Ios'}`;
                }
                document[blockName] = {};
            }
            if (!document[blockName] || typeof document[blockName] !== 'object' || Array.isArray(document[blockName])) {
                throw new Error(`El bloque ${blockName} no es valido`);
            }

            // El getter del Screen Object ya declara una estrategia para esta clave.
            // Escribir un valor de otra estrategia deja las dos capas en desacuerdo
            // y el locator no resuelve, asi que se rechaza en vez de sobrescribir.
            const locatorModule = relativeFile
                .replace(/^resources\/locators\//, '')
                .replace(/\.locator\.json$/, '');
            const declared = indexDeclaredStrategies().get(`${locatorModule}#${name}`)?.[platform];
            if (declared && declared !== check.type) {
                throw new Error(
                    `El getter de "${name}" declara TypeLocator.${declared} para ${platform}, ` +
                    `pero este selector es TypeLocator.${check.type}. ` +
                    'Captura el elemento con esa estrategia o actualiza el getter primero.'
                );
            }

            const previous = typeof document[blockName][name] === 'string'
                ? document[blockName][name]
                : '';
            document[blockName][name] = selector;
            writeUtf8FileAtomic(file, JSON.stringify(normalizeJsonUnicode(document), null, 4) + '\n');
            generatedFileRegistry.registerUpdatedFile(file, state.activeSquad);

            return {
                success: true,
                platform,
                block: blockName,
                previous,
                selector,
                catalog: reuseAnalyzer.getCatalog(state.activeSquad, platform)
            };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });
}
