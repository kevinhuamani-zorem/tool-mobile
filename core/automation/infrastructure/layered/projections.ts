/**
 * Lo que cada rol recibe en su carpeta: copia y proyeccion por rol de los artefactos del paquete (gaps abiertos, contrato por capa, borrador como adiciones, reutilizacion sin codigo duplicado).
 */
import fs from 'fs';
import path from 'path';
import { proposedImports } from '../../../generation';
import {
    readJsonUtf8,
    writeJsonUtf8,
} from '../../../shared';
import {
    locatorAdditions,
    screenAdditions,
} from '../automationPatchWriter';
import {
    AuthorRole,
    ROLE_LAYERS,
} from './roles';
import {
    BEHAVIOR_RULE_CODES,
    GapJudgment,
    INTEGRATION_RULE_CODES,
    INTERACTION_RULE_CODES,
} from './gapJudgment';

export function ensureInside(root: string, candidate: string): string {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(candidate);
    const relative = path.relative(resolvedRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Ruta fuera del workspace de agentes: ${candidate}`);
    }
    return resolved;
}

export function copyIfPresent(
    sourceRoot: string,
    targetRoot: string,
    relativePath: string,
    judgment?: GapJudgment,
): void {
    const source = ensureInside(sourceRoot, path.join(sourceRoot, relativePath));
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return;
    const target = ensureInside(targetRoot, path.join(targetRoot, relativePath));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!judgment || !relativePath.endsWith('.json')) {
        fs.copyFileSync(source, target);
        return;
    }
    writeJsonUtf8(target, projectIntegrationJson(
        relativePath,
        projectSharedJson(relativePath, readJsonUtf8<any>(source), judgment),
    ));
}

/**
 * Un archivo `update` del borrador viaja a Zorem como sus adiciones sobre el
 * baseline, no como el archivo completo: el baseline ya esta integro en
 * `baselines/` y repetirlo dentro del draft duplicaba el Screen Object entero
 * en su contexto. Si no hay baseline (create) el contenido viaja tal cual.
 */
export function draftFileForInteraction(packageDirectory: string, file: any): any {
    if (!file || (file.layer !== 'screen' && file.layer !== 'locators')) return file;
    const baselineReference = `baselines/${file.layer}-${path.basename(String(file.path || ''))}`;
    const baselineFile = path.join(packageDirectory, baselineReference);
    if (!fs.existsSync(baselineFile)) return file;
    const baseline = fs.readFileSync(baselineFile, 'utf8');
    const { content, ...rest } = file;
    try {
        if (file.layer === 'screen') {
            const additions = screenAdditions(baseline, String(content || ''));
            return {
                ...rest,
                operation: 'update',
                baseline: baselineReference,
                additions: {
                    imports: proposedImports(String(content || '')),
                    getters: additions.getters.map(item => ({ name: item.name, code: item.code })),
                    methods: additions.methods.map(item => ({ name: item.name, code: item.code })),
                },
            };
        }
        return {
            ...rest,
            operation: 'update',
            baseline: baselineReference,
            additions: { locators: locatorAdditions(baseline, String(content || '')) },
        };
    } catch {
        return file;
    }
}

export function projectRoleJson(relativePath: string, value: any, role: AuthorRole, packageDirectory: string): any {
    if (relativePath === 'deterministic-draft.json') {
        const layers = new Set(ROLE_LAYERS[role]);
        const files = (value.files || []).filter((file: any) => layers.has(file.layer));
        return {
            ...value,
            files: role === 'interaction-author'
                ? files.map((file: any) => draftFileForInteraction(packageDirectory, file))
                : files,
            actionTrace: value.actionTrace || [],
            assumptions: [
                'Referencia generada localmente. Puedes corregirla o reemplazar APIs provisionales por reutilización autorizada.',
                ...(role === 'interaction-author'
                    ? ['Un archivo con `operation: update` trae solo sus adiciones sobre `baseline`; el archivo completo de partida está en baselines/.']
                    : []),
            ],
        };
    }
    if (relativePath === 'validation-contract.json') {
        // Los autores no emiten resoluciones: las reglas de integracion son de
        // Derek y Sumrak.
        const rules = (value.rules || []).filter((rule: any) =>
            !INTEGRATION_RULE_CODES.has(rule.code)
            && (role === 'behavior-author'
                ? !INTERACTION_RULE_CODES.has(rule.code)
                : !BEHAVIOR_RULE_CODES.has(rule.code))
        );
        return {
            ...value,
            totalRules: rules.length,
            expressibleWithMinimalExampleCount: rules.filter((rule: any) => rule.minimalExample).length,
            explanationOnlyCount: rules.filter((rule: any) => rule.needsExplanation).length,
            rules,
        };
    }
    if (relativePath === 'reuse-context.json') {
        if (role === 'behavior-author') {
            return {
                schemaVersion: value.schemaVersion,
                recordingId: value.recordingId,
                decision: value.decision,
                reuseTarget: value.reuseTarget,
                candidates: value.candidates || [],
                updateBaselines: (value.updateBaselines || []).filter((item: any) =>
                    item?.layer === 'feature' || item?.layer === 'steps'
                ),
            };
        }
        return {
            schemaVersion: value.schemaVersion,
            recordingId: value.recordingId,
            decision: value.decision,
            reuseTarget: value.reuseTarget,
            // El codigo de cada getter ya viaja integro en `baselines/`; aqui
            // solo hace falta la identidad del elemento y sus locators.
            elements: (value.elements || []).map((module: any) => ({
                ...module,
                elements: (module?.elements || []).map((element: any) => {
                    const { getter, ...rest } = element || {};
                    void getter;
                    return rest;
                }),
            })),
            updateBaselines: (value.updateBaselines || []).filter((item: any) =>
                item?.layer === 'screen' || item?.layer === 'locators'
            ),
        };
    }
    if (relativePath === 'hints.json') {
        const behaviorTypes = new Set(['existing_step', 'existing_scenario', 'builtin_action']);
        const interactionTypes = new Set(['existing_locator', 'existing_screen', 'builtin_action']);
        const allowed = role === 'behavior-author' ? behaviorTypes : interactionTypes;
        return {
            ...value,
            hints: (value.hints || []).filter((hint: any) =>
                !hint?.type || allowed.has(hint.type)
            ),
        };
    }
    if (relativePath === 'query-results.json') {
        const behaviorTypes = new Set(['feature', 'scenario', 'stepDefinition', 'example']);
        const interactionTypes = new Set(['screenObject', 'screenMethod', 'locator', 'helper', 'contract', 'import']);
        const allowed = role === 'behavior-author' ? behaviorTypes : interactionTypes;
        return {
            ...value,
            results: (value.results || []).map((result: any) => ({
                ...result,
                data: result?.data && Array.isArray(result.data.items)
                    ? {
                        ...result.data,
                        items: result.data.items.filter((item: any) =>
                            !item?.type || allowed.has(item.type)
                        ),
                    }
                    : result?.data,
            })),
        };
    }
    return value;
}

export function copyRoleInput(
    sourceRoot: string,
    targetRoot: string,
    relativePath: string,
    role: AuthorRole,
    judgment: GapJudgment,
): void {
    const source = ensureInside(sourceRoot, path.join(sourceRoot, relativePath));
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return;
    const target = ensureInside(targetRoot, path.join(targetRoot, relativePath));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!relativePath.endsWith('.json')) {
        fs.copyFileSync(source, target);
        return;
    }
    writeJsonUtf8(target, projectRoleJson(
        relativePath,
        projectSharedJson(relativePath, readJsonUtf8<any>(source), judgment),
        role,
        sourceRoot,
    ));
}

export function copyRoleBaselines(
    sourceRoot: string,
    targetRoot: string,
    role: AuthorRole,
): void {
    const sourceDirectory = path.join(sourceRoot, 'baselines');
    if (!fs.existsSync(sourceDirectory)) return;
    const allowedPrefixes = role === 'behavior-author'
        ? ['feature-', 'steps-']
        : ['screen-', 'locators-'];
    for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
        if (!entry.isFile() || !allowedPrefixes.some(prefix => entry.name.startsWith(prefix))) continue;
        copyIfPresent(sourceRoot, targetRoot, path.join('baselines', entry.name));
    }
}

/** Campos del protocolo de queries: en el pipeline por capas no hay ronda de consultas. */
export const GAP_QUERY_FIELDS = ['allowedQueries', 'allowedQueryArgsSchemas', 'maxQueries', 'expectedAnswerSchema'];

/**
 * Sumrak decide resoluciones y trazabilidad; no escribe codigo. Recibe el
 * catalogo de reglas de integracion y la reutilizacion sin el codigo de los
 * elementos, que solo necesitan los autores.
 */
export function projectIntegrationJson(relativePath: string, value: any): any {
    if (relativePath === 'validation-contract.json') {
        const rules = (value.rules || []).filter((rule: any) => INTEGRATION_RULE_CODES.has(rule.code));
        return {
            ...value,
            totalRules: rules.length,
            expressibleWithMinimalExampleCount: rules.filter((rule: any) => rule.minimalExample).length,
            explanationOnlyCount: rules.filter((rule: any) => rule.needsExplanation).length,
            rules,
        };
    }
    if (relativePath === 'reuse-context.json') {
        return {
            schemaVersion: value.schemaVersion,
            recordingId: value.recordingId,
            decision: value.decision,
            reuseTarget: value.reuseTarget,
            candidates: value.candidates || [],
            updateBaselines: value.updateBaselines || [],
        };
    }
    return value;
}

/**
 * Proyeccion comun a todos los roles: los agentes reciben unicamente los gaps
 * que requieren juicio y sin el protocolo de queries que no pueden ejercer.
 */
export function projectSharedJson(relativePath: string, value: any, judgment: GapJudgment): any {
    if (relativePath === 'gaps.json') {
        const open = new Set([...judgment.open, ...judgment.informational]);
        return {
            ...value,
            gaps: (value.gaps || [])
                .filter((gap: any) => open.has(gap?.id))
                .map((gap: any) => Object.fromEntries(
                    Object.entries(gap).filter(([key]) => !GAP_QUERY_FIELDS.includes(key))
                )),
        };
    }
    if (relativePath === 'generation-plan.json') {
        return {
            ...value,
            unresolvedGapIds: judgment.open,
            fixedGapResolutions: judgment.fixed,
        };
    }
    return value;
}
