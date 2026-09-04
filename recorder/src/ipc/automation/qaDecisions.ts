import fs from 'fs';
import path from 'path';
import { GenerationPlan, GapResolution } from '../../../../core/automation';

export interface QaDecisionOption {
    optionId: string;
    title: string;
    reason: string;
    decision: 'reuse' | 'create';
    symbol?: string;
    candidate?: { file: string; module: string; name: string };
}

export interface QaDecisionPrompt {
    gapId: string;
    title: string;
    description: string;
    requiredOutput: string;
    options: QaDecisionOption[];
}

function readUnresolvedGaps(packageDirectory: string): Array<any> {
    const unresolvedFile = path.join(packageDirectory, 'unresolved-context.json');
    const unresolved = fs.existsSync(unresolvedFile)
        ? JSON.parse(fs.readFileSync(unresolvedFile, 'utf-8')) as { gaps?: Array<any> }
        : { gaps: [] };
    return unresolved.gaps || [];
}

export function qaDecisionPromptsFromPlan(plan: GenerationPlan, packageDirectory: string): QaDecisionPrompt[] {
    const gaps = readUnresolvedGaps(packageDirectory).filter(gap =>
        gap && typeof gap.id === 'string' && (gap.blocking || gap.status === 'blocked-qa' || gap.type === 'qa-decision')
    );
    return gaps.map(gap => {
        const resolution = plan.resolutions.find(entry => entry.gapId === gap.id);
        const candidates = (resolution?.reuseCandidates || []).map((candidate: any) => ({
            optionId: `reuse:${candidate.module}.${candidate.name}`,
            title: `Reutilizar ${candidate.module}.${candidate.name}`,
            reason: `Componente existente en ${candidate.file}`,
            decision: 'reuse' as const,
            symbol: `${candidate.module}.${candidate.name}`,
            candidate: {
                file: candidate.file,
                module: candidate.module,
                name: candidate.name,
            },
        }));
        return {
            gapId: gap.id,
            title: gap.intent || gap.description || 'Decisión pendiente',
            description: gap.description || 'Se requiere confirmación para continuar.',
            requiredOutput: gap.requiredOutput || '',
            options: [
                ...candidates,
                {
                    optionId: 'create:new',
                    title: 'Crear componente nuevo',
                    reason: 'No reutilizar un candidato existente para este caso.',
                    decision: 'create',
                },
            ],
        } satisfies QaDecisionPrompt;
    });
}

export function mergedResolutionsWithQa(
    plan: GenerationPlan,
    qaResolutions: GapResolution[],
    packageDirectory: string,
): GapResolution[] {
    const gaps = readUnresolvedGaps(packageDirectory);
    const byGap = new Map<string, GapResolution>(qaResolutions.map(item => [item.gapId, item]));
    const fromDeterministic = plan.resolutions
        .filter(item => item.gapId && item.resolution !== 'unresolved')
        .map(item => ({
            gapId: item.gapId!,
            decision: item.resolution === 'builtin' ? 'resolved' : item.resolution,
            reason: item.reason,
        } as GapResolution));
    for (const item of fromDeterministic) {
        if (!byGap.has(item.gapId)) byGap.set(item.gapId, item);
    }
    for (const gapId of plan.unresolvedGapIds || []) {
        if (byGap.has(gapId)) continue;
        const gap = gaps.find((entry: any) => entry?.id === gapId);
        byGap.set(gapId, {
            gapId,
            decision: 'unresolved',
            reason: gap?.requiredOutput || 'Gap abierto sin resolución explícita.',
        });
    }
    return [...byGap.values()];
}

/**
 * Convierte las opciones elegidas por QA en resoluciones de gap y deja el plan
 * alineado con cada decisión (reuse → locatorName/source; create → create).
 * Lanza si falta una decisión, está duplicada o no corresponde al prompt.
 */
export function applyQaDecisionsToPlan(
    plan: GenerationPlan,
    prompts: QaDecisionPrompt[],
    decisions: Array<{ gapId: string; optionId: string }>,
): GapResolution[] {
    const selectedByGap = new Map<string, string>();
    for (const entry of decisions || []) {
        if (!entry?.gapId || !entry?.optionId) continue;
        if (selectedByGap.has(entry.gapId)) {
            throw new Error(`La decisión para ${entry.gapId} está duplicada.`);
        }
        selectedByGap.set(entry.gapId, entry.optionId);
    }
    const qaResolutions: GapResolution[] = [];
    for (const prompt of prompts) {
        const optionId = selectedByGap.get(prompt.gapId);
        if (!optionId) throw new Error(`Falta confirmar una decisión de QA.`);
        const option = prompt.options.find(entry => entry.optionId === optionId);
        if (!option) throw new Error('La decisión seleccionada no es válida para este gap.');
        qaResolutions.push({
            gapId: prompt.gapId,
            decision: option.decision,
            reason: `${option.reason} (confirmado por QA)`,
            ...(option.symbol ? { symbol: option.symbol } : {}),
            ...(option.candidate ? { evidence: [option.candidate.file] } : {}),
        });
        const target = plan.resolutions.find(resolution => resolution.gapId === prompt.gapId);
        if (target && option.decision === 'reuse' && option.candidate) {
            target.resolution = 'reuse';
            target.locatorName = option.candidate.name;
            target.source = {
                file: option.candidate.file,
                module: option.candidate.module,
                scope: target.source?.scope || 'squad',
            };
            target.reason = `${target.reason} QA confirmó reutilización ${option.candidate.module}.${option.candidate.name}.`;
        }
        if (target && option.decision === 'create') {
            target.resolution = 'create';
            target.reason = `${target.reason} QA confirmó crear componente nuevo.`;
        }
    }
    return qaResolutions;
}
