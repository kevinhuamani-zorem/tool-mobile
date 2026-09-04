/**
 * Artefactos del paquete de automatización que escribe el orquestador:
 * lectura/escritura JSON, saneado de rutas absolutas (los artefactos nunca
 * exponen rutas de la máquina), status.json, workspaces por gap y la
 * respuesta de fallo cuando el agente no dejó ninguna.
 */
import fs from 'fs';
import path from 'path';
import { AutomationGapsProjection } from '../../contracts';
import { readJsonUtf8, writeJsonUtf8 } from '../../../shared';

export function readJson<T>(file: string): T {
    return readJsonUtf8<T>(file);
}

export function writeJson(file: string, value: unknown): void {
    writeJsonUtf8(file, value);
}

export function normalizeDisplayPath(baseDirectory: string, candidate: string): string {
    const resolvedBase = path.resolve(baseDirectory);
    const resolvedCandidate = path.resolve(candidate);
    const relative = path.relative(resolvedBase, resolvedCandidate).replace(/\\/g, '/');
    if (!relative) return '.';
    if (relative.startsWith('.')) return relative;
    return `./${relative}`;
}

export function sanitizeAbsolutePathsInText(value: string, baseDirectory: string): string {
    const normalize = (rawPath: string): string => {
        if (!rawPath || !path.isAbsolute(rawPath)) return rawPath;
        return normalizeDisplayPath(baseDirectory, rawPath);
    };
    let sanitized = value;
    sanitized = sanitized.replace(/(["'])(\/[^"'`\n\r]+)\1/g, (_match, quote: string, rawPath: string) =>
        `${quote}${normalize(rawPath)}${quote}`
    );
    sanitized = sanitized.replace(/(^|[\s(=;,])((?:\/[^ \t\n\r"'`;<>()|&]+)+)/g, (_match, prefix: string, rawPath: string) =>
        `${prefix}${normalize(rawPath)}`
    );
    sanitized = sanitized.replace(/(["'])([A-Za-z]:\\[^"'`\n\r]+)\1/g, (_match, quote: string, rawPath: string) =>
        `${quote}${normalize(rawPath)}${quote}`
    );
    sanitized = sanitized.replace(/(^|[\s(=;,])([A-Za-z]:\\[^ \t\n\r"'`;<>()|&]+)/g, (_match, prefix: string, rawPath: string) =>
        `${prefix}${normalize(rawPath)}`
    );
    return sanitized;
}

export function sanitizeArtifactValue<T>(
    value: T,
    baseDirectory: string,
    keyPath: string[] = [],
): T {
    const insideGeneratedFileContent = keyPath.length >= 2
        && keyPath[keyPath.length - 2] === 'files'
        && keyPath[keyPath.length - 1] === 'content';
    if (insideGeneratedFileContent) {
        return value;
    }
    if (typeof value === 'string') {
        return sanitizeAbsolutePathsInText(value, baseDirectory) as unknown as T;
    }
    if (Array.isArray(value)) {
        return value.map(entry => sanitizeArtifactValue(entry, baseDirectory, keyPath)) as unknown as T;
    }
    if (value && typeof value === 'object') {
        const output: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            output[key] = sanitizeArtifactValue(entry, baseDirectory, [...keyPath, key]);
        }
        return output as T;
    }
    return value;
}

export function updateStatus(
    statusFile: string,
    patch: Record<string, unknown>,
): void {
    const packageDirectory = path.dirname(statusFile);
    const current = fs.existsSync(statusFile)
        ? readJson<Record<string, unknown>>(statusFile)
        : {};
    writeJson(statusFile, sanitizeArtifactValue({
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
    }, packageDirectory));
}

export function safeGapFolderName(gapId: string): string {
    return gapId.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

export function copyGapWorkspace(packageDirectory: string, gapId: string): string {
    const gapRoot = path.join(packageDirectory, '.gap-runs');
    fs.mkdirSync(gapRoot, { recursive: true });
    const destination = path.join(gapRoot, safeGapFolderName(gapId));
    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(destination, { recursive: true });
    const entries = fs.readdirSync(packageDirectory, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === '.gap-runs') continue;
        if (entry.name === 'query-requests.json') continue;
        if (entry.name === 'gap-resolutions.json') continue;
        if (entry.name === 'agent-response.json') continue;
        const source = path.join(packageDirectory, entry.name);
        const target = path.join(destination, entry.name);
        if (entry.isDirectory()) {
            fs.cpSync(source, target, { recursive: true });
        } else if (entry.isFile()) {
            fs.copyFileSync(source, target);
        }
    }
    return destination;
}

export function clearAgentWritableOutputs(packageDirectory: string): void {
    for (const name of ['query-requests.json', 'gap-resolutions.json', 'agent-response.json', 'test-design-review.json']) {
        const file = path.join(packageDirectory, name);
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    }
}

export function writeFailureResponseIfMissing(
    packageDirectory: string,
    plan: { recordingId?: string; planId?: string },
    gaps: AutomationGapsProjection,
    reason: string,
): void {
    const responsePath = path.join(packageDirectory, 'agent-response.json');
    if (fs.existsSync(responsePath)) return;
    const resolutions = gaps.gaps
        .filter(gap => gap.status === 'open' && !gap.blocking)
        .map(gap => ({
            gapId: gap.id,
            decision: 'unresolved' as const,
            reason: sanitizeAbsolutePathsInText(reason, packageDirectory),
        }));
    writeJson(responsePath, sanitizeArtifactValue({
        recordingId: plan.recordingId || gaps.recordingId || '',
        planId: plan.planId || gaps.planId || '',
        resolutions,
        actionTrace: [],
        files: [],
    }, packageDirectory));
}
