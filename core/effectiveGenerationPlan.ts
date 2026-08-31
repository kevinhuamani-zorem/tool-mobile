import fs from 'fs';
import path from 'path';
import {
    AgentContextQueryResults,
    GapResolution,
    GenerationPlan,
} from './automationContracts';

export interface ReuseSelection {
    file: string;
    module: string;
    name: string;
}

function normalizeFile(value: string): string {
    return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function moduleFromLocatorFile(file: string): string {
    return normalizeFile(file)
        .replace(/^resources\/locators\//, '')
        .replace(/\.locator\.json$/i, '');
}

function sameCandidate(left: ReuseSelection, right: ReuseSelection): boolean {
    return normalizeFile(left.file) === normalizeFile(right.file)
        && left.module === right.module
        && left.name === right.name;
}

function queryCandidates(
    queryResults: AgentContextQueryResults | undefined,
    gapId: string,
): ReuseSelection[] {
    const candidates: ReuseSelection[] = [];
    for (const result of queryResults?.results || []) {
        if (result.gapId !== gapId || result.status !== 'resolved') continue;
        const items = Array.isArray(result.data?.items) ? result.data!.items as Array<Record<string, unknown>> : [];
        for (const item of items) {
            if (item.type !== 'locator') continue;
            const file = normalizeFile(String(item.path || ''));
            const name = String(item.symbol || item.name || '').trim();
            const module = moduleFromLocatorFile(file);
            if (file && module && name) candidates.push({ file, module, name });
        }
    }
    return candidates;
}

function legacySelection(
    resolution: GapResolution,
    candidates: ReuseSelection[],
): ReuseSelection | undefined {
    const symbol = String(resolution.symbol || '').trim();
    if (!symbol) return undefined;
    const evidence = [symbol, ...(resolution.evidence || [])].join(' ');
    return candidates.find(candidate =>
        evidence.includes(candidate.name)
        && (
            evidence.includes(candidate.file)
            || evidence.includes(path.posix.basename(candidate.file))
            || evidence.includes(candidate.module)
        )
    );
}

function readQueryResults(packageDirectory: string): AgentContextQueryResults | undefined {
    const file = path.join(packageDirectory, 'query-results.json');
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as AgentContextQueryResults;
}

function gapSequence(packageDirectory: string, gapId: string): number | undefined {
    const file = path.join(packageDirectory, 'gaps.json');
    if (fs.existsSync(file)) {
        const document = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
            gaps?: Array<{ id?: string; sequence?: number }>;
        };
        const sequence = document.gaps?.find(gap => gap.id === gapId)?.sequence;
        if (Number.isInteger(sequence)) return sequence;
    }
    // Compatibilidad con paquetes/fixtures anteriores a gaps.json proyectado.
    const suffix = gapId.match(/-(\d+)$/)?.[1];
    return suffix ? Number(suffix) : undefined;
}

/**
 * Aplica decisiones semánticas sobre una copia del plan inmutable.
 *
 * El LLM no genera código: elige un candidato estructurado. Solo candidatos
 * previamente ofrecidos por el resolver o devueltos por una consulta aceptada
 * pueden alterar el plan. Así el generador y el validador comparten una única
 * decisión efectiva en vez de reinterpretar `symbol` de forma independiente.
 */
export function effectiveGenerationPlan(
    packageDirectory: string,
    plan: GenerationPlan,
    gapResolutions: GapResolution[],
): GenerationPlan {
    const queryResults = readQueryResults(packageDirectory);
    const effective: GenerationPlan = JSON.parse(JSON.stringify(plan));
    for (const gapResolution of gapResolutions) {
        if (gapResolution.decision !== 'reuse') continue;
        const sequence = gapSequence(packageDirectory, gapResolution.gapId);
        const action = effective.resolutions.find(item =>
            item.gapId === gapResolution.gapId
            || (sequence !== undefined && item.sequence === sequence)
        );
        if (!action) {
            throw new Error(`Reuse inválido: ${gapResolution.gapId} no está asociado a una acción del plan.`);
        }
        const offered = [
            ...(action.reuseCandidates || []),
            ...queryCandidates(queryResults, gapResolution.gapId),
        ];
        const selected = gapResolution.selectedCandidate
            || legacySelection(gapResolution, offered);
        if (!selected) {
            throw new Error(
                `Reuse inválido para ${gapResolution.gapId}: falta selectedCandidate estructurado.`,
            );
        }
        const authorized = offered.find(candidate => sameCandidate(candidate, selected));
        if (!authorized) {
            throw new Error(
                `Reuse inválido para ${gapResolution.gapId}: `
                + `${selected.file}#${selected.name} no fue ofrecido por el plan ni por findLocator.`,
            );
        }
        action.resolution = 'reuse';
        action.locatorName = authorized.name;
        action.source = {
            file: normalizeFile(authorized.file),
            module: authorized.module,
            scope: authorized.module === 'home' || authorized.module.startsWith('home/')
                ? 'home'
                : 'squad',
        };
        action.reason = gapResolution.reason || `Reutiliza ${authorized.module}.${authorized.name}`;
    }
    return effective;
}
