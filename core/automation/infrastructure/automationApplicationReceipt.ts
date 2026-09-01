import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { AutomationAgentResponse, AutomationScenario, GenerationPlan } from '../contracts';

export const AUTOMATION_APPLICATION_RECEIPT_SCHEMA_VERSION = 1;

export interface AppliedAutomationFile {
    path: string;
    operation: 'create' | 'update';
    afterHash: string;
}

export interface AutomationApplicationReceipt {
    schemaVersion: 1;
    recordingId: string;
    planId: string;
    responseHash: string;
    appliedAt: string;
    files: AppliedAutomationFile[];
}

function hash(content: Buffer | string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
}

export function createAutomationApplicationReceipt(
    frameworkRoot: string,
    scenario: AutomationScenario,
    plan: GenerationPlan,
    response: AutomationAgentResponse,
): AutomationApplicationReceipt {
    return {
        schemaVersion: AUTOMATION_APPLICATION_RECEIPT_SCHEMA_VERSION,
        recordingId: scenario.recordingId,
        planId: plan.planId,
        responseHash: hash(JSON.stringify(response)),
        appliedAt: new Date().toISOString(),
        files: plan.files.map(file => {
            const absolute = path.resolve(frameworkRoot, file.path);
            if (!fs.existsSync(absolute)) {
                throw new Error(`No existe el archivo aplicado para registrar recibo: ${file.path}`);
            }
            return {
                path: file.path,
                operation: file.operation,
                afterHash: hash(fs.readFileSync(absolute)),
            };
        }),
    };
}

/** Bloquea una corrección si alguien editó los archivos desde la última aplicación. */
export function requireUnchangedAppliedFiles(
    frameworkRoot: string,
    receipt: AutomationApplicationReceipt,
    recordingId: string,
    planId: string,
): void {
    if (receipt.schemaVersion !== AUTOMATION_APPLICATION_RECEIPT_SCHEMA_VERSION) {
        throw new Error(`Versión de application-receipt.json no soportada: ${receipt.schemaVersion}`);
    }
    if (receipt.recordingId !== recordingId || receipt.planId !== planId) {
        throw new Error('application-receipt.json pertenece a otra grabación o plan.');
    }
    for (const file of receipt.files) {
        const absolute = path.resolve(frameworkRoot, file.path);
        const relative = path.relative(path.resolve(frameworkRoot), absolute);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error(`Ruta aplicada fuera del framework: ${file.path}`);
        }
        if (!fs.existsSync(absolute)) {
            throw new Error(`El archivo aplicado fue eliminado fuera del recorder: ${file.path}`);
        }
        const currentHash = hash(fs.readFileSync(absolute));
        if (currentHash !== file.afterHash) {
            throw new Error(
                `El archivo aplicado fue modificado fuera del recorder: ${file.path}. ` +
                'Conserva esos cambios y vuelve a preparar una regeneración para evitar sobrescribirlos.'
            );
        }
    }
}

export function planAgainstApplicationReceipt(
    plan: GenerationPlan,
    receipt?: AutomationApplicationReceipt,
): GenerationPlan {
    if (!receipt) return plan;
    const hashes = new Map(receipt.files.map(file => [file.path, file.afterHash]));
    return {
        ...plan,
        files: plan.files.map(file => file.operation === 'update' && hashes.has(file.path)
            ? { ...file, baseHash: hashes.get(file.path) }
            : file),
    };
}
