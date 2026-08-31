import ts from 'typescript';
import { AutomationAgentResponse, AutomationScenario } from './automationContracts';
import { declaredIdentifiers, spanishTokens, translateToEnglish } from './englishIdentifiers';
import { words } from './selectorNormalization';

export interface AgentEnglishNormalizationResult {
    response: AutomationAgentResponse;
    renamed: Record<string, string>;
    skipped: Array<{ identifier: string; reason: string }>;
}

function featurePlaceholders(content: string): Set<string> {
    return new Set([...content.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g)].map(match => match[1]));
}

function featureExampleHeaders(content: string): Set<string> {
    const headers = new Set<string>();
    let waitingHeader = false;
    for (const line of content.split(/\r?\n/)) {
        if (/^\s*Examples\s*:/i.test(line)) {
            waitingHeader = true;
            continue;
        }
        if (!waitingHeader) continue;
        if (!line.includes('|')) continue;
        line.split('|').slice(1, -1)
            .map(cell => cell.trim())
            .filter(Boolean)
            .forEach(cell => headers.add(cell));
        waitingHeader = false;
    }
    return headers;
}

function renameFeatureContent(content: string, renames: Map<string, string>): string {
    let output = content;
    for (const [from, to] of renames) {
        output = output.replace(new RegExp(`<${from}>`, 'g'), `<${to}>`);
    }
    const lines = output.split(/\r?\n/);
    let waitingHeader = false;
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (/^\s*Examples\s*:/i.test(line)) {
            waitingHeader = true;
            continue;
        }
        if (!waitingHeader || !line.includes('|')) continue;
        const prefix = line.match(/^\s*/)?.[0] || '';
        const renamedCells = line.split('|').slice(1, -1).map(cell => {
            const trimmed = cell.trim();
            return renames.get(trimmed) || trimmed;
        });
        lines[index] = `${prefix}| ${renamedCells.join(' | ')} |`;
        waitingHeader = false;
    }
    return lines.join('\n');
}

function tsDiagnostics(content: string, filePath: string): string[] {
    const result = ts.transpileModule(content, {
        fileName: filePath,
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
        },
        reportDiagnostics: true,
    });
    return (result.diagnostics || []).map(diagnostic =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    );
}

function renameTsContent(content: string, filePath: string, renames: Map<string, string>): string {
    const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const transformer: ts.TransformerFactory<ts.SourceFile> = context => root => {
        const visit = (node: ts.Node): ts.Node => {
            if (ts.isIdentifier(node)) {
                const replacement = renames.get(node.text);
                if (replacement) return context.factory.createIdentifier(replacement);
            }
            if (ts.isStringLiteral(node)) {
                const replacement = renames.get(node.text);
                if (replacement && (
                    (ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node)
                    || (ts.isPropertyAssignment(node.parent) && node.parent.name === node)
                )) {
                    return context.factory.createStringLiteral(replacement);
                }
            }
            return ts.visitEachChild(node, visit, context);
        };
        return ts.visitNode(root, visit) as ts.SourceFile;
    };
    const transformed = ts.transform(source, [transformer]).transformed[0];
    return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(transformed);
}

function renameLocatorKeys(value: unknown, renames: Map<string, string>): unknown {
    if (Array.isArray(value)) return value.map(item => renameLocatorKeys(item, renames));
    if (!value || typeof value !== 'object') return value;
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        const nextKey = renames.get(key) || key;
        result[nextKey] = renameLocatorKeys(entry, renames);
    }
    return result;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsIdentifierWord(content: string, identifier: string): boolean {
    return new RegExp(`\\b${escapeRegExp(identifier)}\\b`, 'u').test(content);
}

function scenarioVocabularyInputs(scenario: AutomationScenario): string[] {
    return [
        scenario.objective,
        scenario.acceptanceCriteria,
        ...(scenario.actions || []).flatMap(action => [
            action.contextHint,
            action.elementIntent,
            action.description,
            action.variableName,
        ]),
    ].filter(Boolean) as string[];
}

export function scenarioEnglishVocabulary(scenario: AutomationScenario): Record<string, string> {
    const map = new Map<string, string>();
    for (const text of scenarioVocabularyInputs(scenario)) {
        for (const token of words(text)) {
            if (!spanishTokens(token).length) continue;
            const translation = translateToEnglish(token).name;
            if (!translation || translation === token) continue;
            map.set(token, translation);
        }
    }
    return Object.fromEntries([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

export function normalizeAgentResponseEnglishIdentifiers(
    response: AutomationAgentResponse
): AgentEnglishNormalizationResult {
    const feature = response.files.find(file => file.layer === 'feature');
    const steps = response.files.find(file => file.layer === 'steps');
    const screen = response.files.find(file => file.layer === 'screen');
    const locators = response.files.find(file => file.layer === 'locators');
    if (!feature || !steps || !screen || !locators) {
        return { response, renamed: {}, skipped: [] };
    }

    const identifierSet = new Set<string>([
        ...declaredIdentifiers({
            steps: steps.content,
            screen: screen.content,
            locators: locators.content,
        }).map(symbol => symbol.name),
        ...featurePlaceholders(feature.content),
        ...featureExampleHeaders(feature.content),
    ]);
    const layerContents = new Map<AutomationAgentResponse['files'][number]['layer'], string>([
        ['feature', feature.content],
        ['steps', steps.content],
        ['screen', screen.content],
        ['locators', locators.content],
    ]);
    const proposed = new Map<string, string>();
    const skipped: Array<{ identifier: string; reason: string }> = [];
    const sortedIdentifiers = [...identifierSet].sort((a, b) => a.localeCompare(b));
    for (const identifier of sortedIdentifiers) {
        if (!spanishTokens(identifier).length) continue;
        const translation = translateToEnglish(identifier).name;
        if (!translation || translation === identifier || spanishTokens(translation).length) {
            skipped.push({
                identifier,
                reason: 'translation-unavailable',
            });
            continue;
        }
        if (
            identifierSet.has(translation)
            && translation !== identifier
            && !spanishTokens(translation).length
        ) {
            skipped.push({ identifier, reason: 'collision' });
            continue;
        }
        const appearsInLayer = (['feature', 'steps', 'screen', 'locators'] as const)
            .filter(layer => containsIdentifierWord(layerContents.get(layer) || '', identifier));
        if (!appearsInLayer.length) continue;
        if (appearsInLayer.some(layer => containsIdentifierWord(layerContents.get(layer) || '', translation))) {
            skipped.push({ identifier, reason: 'collision' });
            continue;
        }
        proposed.set(identifier, translation);

        for (const layer of appearsInLayer) {
            const current = layerContents.get(layer) || '';
            if (layer === 'feature') {
                const renamed = renameFeatureContent(current, new Map([[identifier, translation]]));
                layerContents.set(layer, renamed);
                continue;
            }
            if (layer === 'locators') {
                const renamedDoc = renameLocatorKeys(JSON.parse(current), new Map([[identifier, translation]]));
                layerContents.set(layer, `${JSON.stringify(renamedDoc, null, 2)}\n`);
                continue;
            }
            layerContents.set(
                layer,
                renameTsContent(current, layer === 'steps' ? steps.path : screen.path, new Map([[identifier, translation]]))
            );
        }
    }
    if (!proposed.size) return { response, renamed: {}, skipped };

    const nextFiles = new Map(response.files.map(file => [file.layer, file]));
    const nextFeature = layerContents.get('feature') || feature.content;
    const nextSteps = layerContents.get('steps') || steps.content;
    const nextScreen = layerContents.get('screen') || screen.content;
    const nextLocators = layerContents.get('locators') || locators.content;

    if (tsDiagnostics(nextSteps, steps.path).length || tsDiagnostics(nextScreen, screen.path).length) {
        return { response, renamed: {}, skipped };
    }

    nextFiles.set('feature', { ...feature, content: nextFeature });
    nextFiles.set('steps', { ...steps, content: nextSteps });
    nextFiles.set('screen', { ...screen, content: nextScreen });
    nextFiles.set('locators', { ...locators, content: nextLocators });

    return {
        response: {
            ...response,
            files: response.files.map(file => nextFiles.get(file.layer) || file),
        },
        renamed: Object.fromEntries([...proposed.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
        skipped,
    };
}
