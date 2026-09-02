import { app, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import {
    configureWorkspacePaths,
    isFrameworkRoot,
    projectPaths,
    resolveRecorderRuntimeRoot,
    type WorkspaceConfiguration,
} from '../../core/workspace';

interface SavedWorkspace {
    schemaVersion: 1;
    frameworkRoot: string;
}

function workspaceFile(): string {
    return path.join(app.getPath('userData'), 'workspace.json');
}

function readSavedWorkspace(): string | undefined {
    try {
        const value = JSON.parse(fs.readFileSync(workspaceFile(), 'utf8')) as Partial<SavedWorkspace>;
        return value.schemaVersion === 1 && typeof value.frameworkRoot === 'string'
            ? value.frameworkRoot
            : undefined;
    } catch {
        return undefined;
    }
}

function saveWorkspace(frameworkRoot: string): void {
    const file = workspaceFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({
        schemaVersion: 1,
        frameworkRoot,
    } satisfies SavedWorkspace, null, 2), 'utf8');
    fs.renameSync(temporary, file);
}

export interface WorkspaceSelectionResult {
    success: boolean;
    canceled?: boolean;
    frameworkRoot?: string;
    error?: string;
}

/**
 * Permite cambiar el framework desde Ajustes. La selección se persiste, pero
 * no muta los servicios ya construidos: el composition root reinicia la app
 * para que scanners, caches y generadores nazcan contra una única raíz.
 */
export async function selectAndSaveWorkspaceRoot(): Promise<WorkspaceSelectionResult> {
    const fixedRoot = process.env.FWK_MOBILE_ROOT?.trim();
    if (fixedRoot && isFrameworkRoot(fixedRoot)) {
        return {
            success: false,
            error: 'La ruta está fijada por FWK_MOBILE_ROOT. Quita esa variable y reinicia el recorder para cambiarla.',
        };
    }

    while (true) {
        const selection = await dialog.showOpenDialog({
            title: 'Selecciona la carpeta raíz de fwk-mobile-test',
            message: 'El recorder se reiniciará y usará este framework para indexar y generar automatizaciones.',
            buttonLabel: 'Cambiar a este framework',
            properties: ['openDirectory'],
        });
        if (selection.canceled || !selection.filePaths[0]) {
            return { success: false, canceled: true };
        }

        const selectedRoot = path.resolve(selection.filePaths[0]);
        if (isFrameworkRoot(selectedRoot)) {
            saveWorkspace(selectedRoot);
            return { success: true, frameworkRoot: selectedRoot };
        }

        await dialog.showMessageBox({
            type: 'warning',
            title: 'No es un fwk-mobile-test válido',
            message: 'Selecciona la raíz del framework, no una subcarpeta.',
            detail: selectedRoot,
        });
    }
}

function configure(targetProject: string, source: WorkspaceConfiguration['source']): string {
    const runtime = app.isPackaged
        ? resolveRecorderRuntimeRoot({
            explicitRoot: process.env.VISUAL_RECORDER_RUNTIME_ROOT,
            packagedOriginFile: path.join(process.resourcesPath, 'runtime-origin.json'),
            fallbackRoot: app.getPath('userData'),
        })
        : { root: projectPaths.toolRoot, source: 'packaged-origin' as const };
    configureWorkspacePaths({
        targetProject,
        runtimeRoot: runtime.root,
        source,
    });
    console.log(`[Workspace] Framework seleccionado: ${projectPaths.frameworkRoot}`);
    console.log(`[Workspace] Runtime del recorder (${runtime.source}): ${projectPaths.runtimeRoot}`);
    console.log(`[Workspace] Grabaciones: ${projectPaths.recordings}`);
    return projectPaths.frameworkRoot;
}

/**
 * Conserva el arranque embebido actual y añade el bootstrap requerido por el
 * `.app`: variable explícita, workspace persistido o selector nativo.
 */
export async function bootstrapWorkspace(): Promise<string | null> {
    const environmentRoot = process.env.FWK_MOBILE_ROOT?.trim();
    if (environmentRoot) {
        if (!isFrameworkRoot(environmentRoot)) {
            await dialog.showMessageBox({
                type: 'error',
                title: 'Workspace inválido',
                message: 'FWK_MOBILE_ROOT no apunta a un fwk-mobile-test válido.',
                detail: path.resolve(environmentRoot),
            });
        } else {
            return configure(environmentRoot, 'environment');
        }
    }

    const savedRoot = readSavedWorkspace();
    if (savedRoot && isFrameworkRoot(savedRoot)) return configure(savedRoot, 'saved');

    const embeddedRoot = path.resolve(projectPaths.toolRoot, '..', '..');
    if (isFrameworkRoot(embeddedRoot)) return configure(embeddedRoot, 'auto');

    while (true) {
        const selection = await selectAndSaveWorkspaceRoot();
        if (selection.canceled) return null;
        if (selection.success && selection.frameworkRoot) {
            return configure(selection.frameworkRoot, 'selected');
        }
    }
}
