import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { PreparedAutomation } from './automationApplier';
import { symbolsOf } from './automationPatchWriter';
import type { AutomationValidation } from '../../validation';
import type { AutomationAgentResponse, AutomationScenario, GenerationPlan, AutomationHistoryIdentity } from '../contracts';

export const AUTOMATION_APPLICATION_RECEIPT_SCHEMA_VERSION = 2;

export interface AppliedAutomationFile {
    path: string;
    operation: 'create' | 'update';
    afterHash: string;
    beforeHash?: string | null;
    symbols?: string[];
}

export interface AutomationApplicationReceipt {
    schemaVersion: 1 | 2;
    exportId?: string;
    revisionId?: string;
    attemptId?: string;
    basedOnAttemptId?: string;
    caseId?: string;
    recordingId: string;
    planId: string;
    responseHash: string;
    appliedAt: string;
    files: AppliedAutomationFile[];
    exportStatus?: 'exported' | 'exported-with-observations';
    missingLayers?: string[];
    validation?: AutomationValidation;
    generationDiagnostics?: string[];
}

function hash(content: Buffer | string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
}

export function createAutomationApplicationReceipt(
    frameworkRoot: string,
    scenario: AutomationScenario,
    plan: GenerationPlan,
    response: AutomationAgentResponse,
    identity?: AutomationHistoryIdentity,
    snapshot?: { prepared: PreparedAutomation; validation: AutomationValidation; generationDiagnostics: string[] },
): AutomationApplicationReceipt {
    return {
        schemaVersion: identity ? AUTOMATION_APPLICATION_RECEIPT_SCHEMA_VERSION : 1,
        ...(identity ? { exportId: `export-${crypto.randomUUID()}`, revisionId: identity.revisionId, attemptId: identity.attemptId, basedOnAttemptId: identity.basedOnAttemptId, caseId: identity.caseId } : {}),
        recordingId: scenario.recordingId,
        planId: plan.planId,
        responseHash: hash(JSON.stringify(response)),
        appliedAt: new Date().toISOString(),
        ...(snapshot ? {
            exportStatus: (!snapshot.validation.valid || snapshot.generationDiagnostics.length
                || plan.files.some(file => !response.files.some(item => item.layer === file.layer)))
                ? 'exported-with-observations' as const : 'exported' as const,
            missingLayers: plan.files.filter(file => !response.files.some(item => item.layer === file.layer)).map(file => file.layer),
            validation: snapshot.validation, generationDiagnostics: snapshot.generationDiagnostics,
        } : {}),
        files: (snapshot ? snapshot.prepared.files.map(file => ({ ...file,
            operation: plan.files.find(item => item.path === file.path)?.operation || 'update' as const })) : plan.files).map(file => {
            const absolute = path.resolve(frameworkRoot, file.path);
            if (!fs.existsSync(absolute)) {
                throw new Error(`No existe el archivo aplicado para registrar recibo: ${file.path}`);
            }
            return {
                path: file.path,
                operation: file.operation,
                afterHash: hash(fs.readFileSync(absolute)),
                ...(snapshot ? {
                    beforeHash: snapshot.prepared.files.find(item => item.path === file.path)!.before === null ? null
                        : hash(snapshot.prepared.files.find(item => item.path === file.path)!.before!),
                    symbols: [...new Set([
                        ...snapshot.prepared.outcomes.filter(item => item.file === file.path).flatMap(item => item.added),
                        ...response.files.filter(item => item.path === file.path).flatMap(item => symbolsOf(item.layer, item.content)
                            .filter(symbol => !symbolsOf(item.layer, snapshot.prepared.files.find(part => part.path === file.path)!.before || '').includes(symbol))),
                    ])],
                } : {}),
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
    if (receipt.schemaVersion !== 1 && receipt.schemaVersion !== AUTOMATION_APPLICATION_RECEIPT_SCHEMA_VERSION) {
        throw new Error(`Versión de application-receipt.json no soportada: ${receipt.schemaVersion}`);
    }
    if (receipt.schemaVersion === 2 && (!receipt.exportId || !receipt.revisionId)) throw new Error('El recibo v2 no contiene identidad de exportación/revisión.');
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
