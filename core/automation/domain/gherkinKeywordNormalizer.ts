import { expectedGherkinKeyword, gherkinKeywordAccepted, gherkinStepKind, GherkinStepKind } from '../contracts/gherkinContract';
import { selectorNormalization } from '../../shared';

export interface GherkinNormalizationContext {
    actions?: ReadonlyArray<{ sequence: number; action: string }>;
    reusedStepTexts?: readonly string[];
}

interface Proposal {
    files: Array<{ layer: string; content: string }>;
    actionTrace: Array<{ sequence: number; gherkinStep: string }>;
}

const textKey = (text: string) => selectorNormalization.normalizeStepText(text.replace(/^\s*(?:Given|When|Then|And|But)\s+/i, ''));
const primaryKind = (keyword: string): GherkinStepKind | undefined =>
    keyword === 'Given' ? 'context' : keyword === 'When' ? 'behavior' : keyword === 'Then' ? 'assertion' : undefined;

/** Pure, copy-on-write: only keywords, never wording, actions, selectors or method calls. */
export function normalizeGeneratedGherkinKeywords<T extends Proposal>(
    response: T,
    context: GherkinNormalizationContext = {},
): { response: T; changed: boolean } {
    if (!Array.isArray(response?.files) || !Array.isArray(response?.actionTrace)
        || !Array.isArray(context.actions) || !context.actions.length) return { response, changed: false };
    const actions = new Map(context.actions.map(action => [action.sequence, action]));
    if (actions.size !== context.actions.length) return { response, changed: false };
    const seenSequences = new Set<number>();
    const byText = new Map<string, Array<{ sequence: number; action: string }>>();
    for (const trace of response.actionTrace) {
        const action = actions.get(trace?.sequence);
        // A malformed trace must reach validation unchanged, not be "fixed" by guessing.
        if (!action || typeof trace.gherkinStep !== 'string' || seenSequences.has(trace.sequence)) return { response, changed: false };
        seenSequences.add(trace.sequence);
        const key = textKey(trace.gherkinStep);
        const group = byText.get(key) || [];
        group.push(action);
        byText.set(key, group);
    }
    if (seenSequences.size !== actions.size) return { response, changed: false };
    const protectedTexts = new Set((context.reusedStepTexts || []).map(textKey));
    type StepLine = { index: number; keyword: string; key: string };
    const parsed = response.files.map(file => {
        const lines = typeof file.content === 'string' ? file.content.split(/(?<=\n)/) : [];
        const scenarios: StepLine[][] = [];
        let current: StepLine[] | undefined;
        let docstring: string | undefined;
        if (file.layer === 'feature') lines.forEach((line, index) => {
            const delimiter = line.trimStart().match(/^("""|```)/)?.[1];
            if (delimiter) { if (!docstring) docstring = delimiter; else if (docstring === delimiter) docstring = undefined; return; }
            if (docstring) return;
            if (/^\s*Scenario(?: Outline)?:/i.test(line)) { current = []; scenarios.push(current); return; }
            if (/^\s*(?:Background|Rule|Feature|Examples):/i.test(line)) { current = undefined; return; }
            const match = line.match(/^\s*(Given|When|Then|And|But)\s+([^\r\n]+)/i);
            if (current && match) current.push({ index, keyword: match[1][0].toUpperCase() + match[1].slice(1).toLowerCase(), key: textKey(match[2]) });
        });
        return { file, lines, scenarios };
    });
    // A trace only has text, not a scenario id: repeated text is ambiguous.
    const counts = new Map<string, number>();
    for (const entry of parsed) for (const scenario of entry.scenarios) for (const line of scenario) counts.set(line.key, (counts.get(line.key) || 0) + 1);
    const replacements = new Map<string, string>();
    let changed = false;
    const files = parsed.map(({ file, lines, scenarios }) => {
        let fileChanged = false;
        for (const scenario of scenarios) {
            let previous: GherkinStepKind | undefined;
            for (const line of scenario) {
                const group = byText.get(line.key);
                // Mixed behavior/result rows require semantic editing, not a keyword substitution.
                const kinds = new Set(group?.map(action => gherkinStepKind([action])));
                const eligible = group?.length && kinds.size === 1 && counts.get(line.key) === 1 && !protectedTexts.has(line.key);
                if (!eligible) { previous = primaryKind(line.keyword) || previous; continue; }
                const kind = gherkinStepKind([...group].sort((a, b) => a.sequence - b.sequence));
                if (!gherkinKeywordAccepted(line.keyword, kind, previous)) {
                    const keyword = expectedGherkinKeyword(kind, previous);
                    lines[line.index] = lines[line.index].replace(/^(\s*)(Given|When|Then|And|But)\b/i, `$1${keyword}`);
                    replacements.set(line.key, keyword);
                    fileChanged = changed = true;
                }
                previous = kind;
            }
        }
        return fileChanged ? { ...file, content: lines.join('') } : file;
    });
    if (!changed) return { response, changed: false };
    const actionTrace = response.actionTrace.map(trace => {
        const keyword = replacements.get(textKey(trace.gherkinStep));
        // Prefix-free traces already match Cucumber's text; leave them byte-identical.
        if (!keyword || !/^\s*(Given|When|Then|And|But)\s+/i.test(trace.gherkinStep)) return trace;
        return { ...trace, gherkinStep: trace.gherkinStep.replace(/^(\s*)(Given|When|Then|And|But)\b/i, `$1${keyword}`) };
    });
    return { response: { ...response, files, actionTrace }, changed: true };
}
