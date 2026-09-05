import fs from 'fs';
import path from 'path';
import type { GenerationPlan } from '../contracts';
import { readJsonUtf8, readUtf8File, writeUtf8FileAtomic } from '../../shared';

/**
 * Restaura las baselines de archivos compartidos antes de recalcular un patch.
 * Primero valida y carga todo; no escribe parcialmente si falta una baseline.
 */
export function restoreUpdateBaselinesForCorrection(
    packageDirectory: string,
    frameworkRoot: string,
    plan: GenerationPlan,
): Map<string, string> {
    const replacements = loadUpdateBaselinesForCorrection(packageDirectory, frameworkRoot, plan);
    const backups = new Map([...replacements].map(([relative]) => {
        const target = path.resolve(frameworkRoot, relative);
        return [target, readUtf8File(target)] as const;
    }));
    for (const [relative, content] of replacements) writeUtf8FileAtomic(path.resolve(frameworkRoot, relative), content);
    return backups;
}

/** Loads correction baselines without temporarily modifying the user's project. */
export function loadUpdateBaselinesForCorrection(
    packageDirectory: string,
    frameworkRoot: string,
    plan: GenerationPlan,
): Map<string, string> {
    const updates = plan.files.filter(file => file.operation === 'update');
    if (!updates.length) return new Map();
    const contextFile = path.join(packageDirectory, 'reuse-context.json');
    if (!fs.existsSync(contextFile)) {
        throw new Error('La corrección de archivos reutilizados no tiene reuse-context.json.');
    }
    const context = readJsonUtf8<{
        updateBaselines?: Array<{ path: string; reference: string }>;
    }>(contextFile);
    const baselines = new Map((context.updateBaselines || []).map(item => [item.path, item.reference]));
    const replacements = new Map<string, string>();
    for (const update of updates) {
        const reference = baselines.get(update.path);
        if (!reference) {
            throw new Error(
                `No existe baseline para corregir el archivo reutilizado ${update.path}. ` +
                'Prepara una regeneración nueva para conservar los cambios actuales.'
            );
        }
        const target = path.resolve(frameworkRoot, update.path);
        const baseline = path.resolve(packageDirectory, reference);
        const targetRelative = path.relative(path.resolve(frameworkRoot), target);
        const baselineRelative = path.relative(path.resolve(packageDirectory), baseline);
        if (
            targetRelative.startsWith('..') || path.isAbsolute(targetRelative)
            || baselineRelative.startsWith('..') || path.isAbsolute(baselineRelative)
        ) {
            throw new Error(`Baseline fuera del alcance autorizado para ${update.path}.`);
        }
        if (!fs.existsSync(target) || !fs.existsSync(baseline)) {
            throw new Error(`No se pudo reconstruir la baseline de ${update.path}.`);
        }
        replacements.set(update.path, readUtf8File(baseline));
    }
    return replacements;
}

export function rollbackCorrectionBaselines(backups: Map<string, string>): void {
    for (const [file, content] of backups) writeUtf8FileAtomic(file, content);
}
