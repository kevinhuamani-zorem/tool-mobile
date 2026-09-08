import fs from 'fs';
import { readJsonUtf8 } from '../../../shared';

// Transport limits, independent of the informational context/cost budgets.
export const MAX_LAYERED_OUTPUT_BYTES = 4 * 1024 * 1024;
export const MAX_LAYERED_TRACE_ITEMS = 2000;
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);

export function readLayeredOutput(file: string): unknown {
    if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > MAX_LAYERED_OUTPUT_BYTES) {
        throw new Error('output-envelope: la entrega requiere un archivo local de hasta 4 MiB.');
    }
    return readJsonUtf8<unknown>(file);
}

/** Check shape before normalization/AST traversal; semantic rules remain authoritative. */
export function assertLayeredEnvelope(value: unknown, integration = false): void {
    if (!object(value)) throw new Error('output-envelope: se esperaba un objeto JSON.');
    if (!Array.isArray(value.files) || value.files.length > 4 || value.files.some(file =>
        !object(file) || typeof file.layer !== 'string' || typeof file.path !== 'string' || typeof file.content !== 'string')) {
        throw new Error('output-envelope: files debe contener hasta cuatro objetos con layer, path y content textuales.');
    }
    if (!Array.isArray(value.actionTrace) || value.actionTrace.length > MAX_LAYERED_TRACE_ITEMS || value.actionTrace.some(trace =>
        !object(trace) || !Number.isInteger(trace.sequence) || typeof trace.gherkinStep !== 'string'
        || (trace.screenMethod !== undefined && typeof trace.screenMethod !== 'string')
        || (trace.locatorName !== undefined && typeof trace.locatorName !== 'string'))) {
        throw new Error('output-envelope: actionTrace debe contener hasta 2000 trazas con secuencia y campos textuales.');
    }
    if (integration && (!Array.isArray(value.resolutions) || value.resolutions.length > MAX_LAYERED_TRACE_ITEMS
        || value.resolutions.some(item => !object(item) || typeof item.gapId !== 'string' || typeof item.decision !== 'string'))) {
        throw new Error('output-envelope: resolutions debe contener hasta 2000 decisiones identificadas.');
    }
    if (value.assumptions !== undefined && (!Array.isArray(value.assumptions) || value.assumptions.length > 100
        || value.assumptions.some(item => typeof item !== 'string'))) throw new Error('output-envelope: assumptions debe ser un arreglo de textos.');
    if (value.testDesignReview !== undefined && (!object(value.testDesignReview) || typeof value.testDesignReview.summary !== 'string'
        || !Array.isArray(value.testDesignReview.issues) || value.testDesignReview.issues.length > MAX_LAYERED_TRACE_ITEMS)) {
        throw new Error('output-envelope: testDesignReview requiere summary e issues.');
    }
}
