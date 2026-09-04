import fs from 'fs';
import path from 'path';
import {
    AgentErrorCode,
    AgentExecutionMode,
    AgentExecutionState,
    DEFAULT_AGENT_EXECUTION_MODE,
    isAgentFallbackAllowed,
} from '../contracts';

const ALLOWED_ARTIFACTS = new Set([
    'agent-response.json',
    'gap-resolutions.json',
    'query-requests.json',
    'query-results.json',
]);

export interface AgentOutputSummary {
    exitCode: number | null;
    stdoutBytes: number;
    stderrBytes: number;
    truncated: boolean;
    summary: string;
}

/**
 * Tope de seguridad de una sesion del agente, no su presupuesto.
 *
 * `maxDurationMs` del plan es un objetivo de coste que se reporta; matar la
 * sesion al cumplirse tiraria una respuesta casi completa y produciria una
 * automatizacion incompleta. Lo que corta la sesion es este hang stop: una
 * hora por defecto, ajustable con RECORDER_AGENT_HANG_STOP_MS.
 */
export const DEFAULT_AGENT_HANG_STOP_MS = 3_600_000;

export function resolveAgentHangStopMs(raw: unknown = process.env.RECORDER_AGENT_HANG_STOP_MS): number {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return DEFAULT_AGENT_HANG_STOP_MS;
    return Math.max(1, Math.floor(value));
}

export function resolveAgentExecutionMode(
    mode?: string | null,
): AgentExecutionMode {
    const normalized = String(mode || '').trim().toLowerCase();
    if (normalized === 'automatic') return 'automatic';
    if (normalized === 'manual') return 'manual';
    return DEFAULT_AGENT_EXECUTION_MODE;
}

export function canFallbackToManual(
    mode: AgentExecutionMode,
    code: AgentErrorCode,
): boolean {
    return mode === 'automatic' && isAgentFallbackAllowed(code);
}

export function isValidAgentExecutionState(value: unknown): value is AgentExecutionState {
    return typeof value === 'string' && new Set([
        'prepared', 'running', 'completed', 'failed', 'timed-out', 'cancelled',
    ]).has(value);
}

export function resolvePackageArtifactPath(
    packageDirectory: string,
    fileName: string,
): string {
    if (!ALLOWED_ARTIFACTS.has(fileName)) {
        throw new Error(`Artefacto no permitido: ${fileName}`);
    }
    const root = fs.realpathSync.native(packageDirectory);
    const candidate = path.resolve(root, fileName);
    if (!candidate.startsWith(root + path.sep)) {
        throw new Error(`Ruta fuera del package: ${fileName}`);
    }
    if (fs.existsSync(candidate) && fs.lstatSync(candidate).isSymbolicLink()) {
        throw new Error(`Symlink no permitido para ${fileName}`);
    }
    return candidate;
}

function redact(value: string): string {
    return value
        .replace(/(browserstack[_-]?access[_-]?key|access[_-]?key|token|password|passwd|pin|otp)\s*[:=]\s*[^\s'"]+/ig, '$1=<redacted>')
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
        .replace(/\b\d{9,16}\b/g, '<number>');
}

export function summarizeAgentProcessOutput(
    stdout: string,
    stderr: string,
    exitCode: number | null,
    maxSummaryBytes = 2048,
): AgentOutputSummary {
    const combined = `${stdout || ''}\n${stderr || ''}`.trim();
    const sanitized = redact(combined);
    const bytes = Buffer.byteLength(sanitized, 'utf-8');
    const summary = bytes > maxSummaryBytes
        ? Buffer.from(sanitized, 'utf-8').subarray(0, maxSummaryBytes).toString('utf-8')
        : sanitized;
    return {
        exitCode,
        stdoutBytes: Buffer.byteLength(stdout || '', 'utf-8'),
        stderrBytes: Buffer.byteLength(stderr || '', 'utf-8'),
        truncated: bytes > maxSummaryBytes,
        summary,
    };
}
