import fs from 'fs';
import path from 'path';

export interface RuntimeRootResolution {
    root: string;
    source: 'environment' | 'packaged-origin' | 'fallback';
}

interface RuntimeOriginDocument {
    schemaVersion: 1;
    runtimeRoot: string;
}

function isRecorderCheckout(candidate: string): boolean {
    try {
        const root = path.resolve(candidate);
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
            name?: string;
        };
        fs.accessSync(root, fs.constants.R_OK | fs.constants.W_OK);
        return manifest.name === 'appium-visual-recorder';
    } catch {
        return false;
    }
}

function originRoot(originFile: string | undefined): string | undefined {
    if (!originFile) return undefined;
    try {
        const document = JSON.parse(fs.readFileSync(originFile, 'utf8')) as Partial<RuntimeOriginDocument>;
        if (document.schemaVersion !== 1 || typeof document.runtimeRoot !== 'string') return undefined;
        return document.runtimeRoot;
    } catch {
        return undefined;
    }
}

/**
 * Resuelve el almacenamiento mutable de la app sin confundirlo con los
 * recursos empacados ni con el framework seleccionado. Una build local usa
 * el checkout que la produjo; una app copiada conserva un fallback escribible.
 */
export function resolveRecorderRuntimeRoot(options: {
    explicitRoot?: string;
    packagedOriginFile?: string;
    fallbackRoot: string;
}): RuntimeRootResolution {
    const explicitRoot = options.explicitRoot?.trim();
    if (explicitRoot && isRecorderCheckout(explicitRoot)) {
        return { root: path.resolve(explicitRoot), source: 'environment' };
    }

    const packagedRoot = originRoot(options.packagedOriginFile);
    if (packagedRoot && isRecorderCheckout(packagedRoot)) {
        return { root: path.resolve(packagedRoot), source: 'packaged-origin' };
    }

    return { root: path.resolve(options.fallbackRoot), source: 'fallback' };
}
