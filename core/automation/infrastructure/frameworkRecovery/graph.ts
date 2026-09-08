import ts from 'typescript';
import type { RecoveryLayer, RecoveryPending, RecoveryRelation } from '../../contracts/frameworkRecovery';
import { matchingStepDefinitions } from '../../../shared';
import { RecoveryWorkspace } from './files';
import { inspectRecoveryCode, recoveryFeatureSteps, unitSelected } from './inspection';
export const recoveryLayer = (file: string): RecoveryLayer => file.endsWith('.feature') ? 'feature'
    : file.endsWith('.steps.ts') ? 'steps' : file.endsWith('.screen.ts') ? 'screen'
    : file.endsWith('.locator.json') ? 'locators' : 'dependency';

/** Follows syntax relationships; never infers case ownership from basenames or Git status. */
export function recoverRelationships(workspace: RecoveryWorkspace, seeds: Map<string, Set<string>>, caseId?: string, hints = new Map<string, RecoveryLayer>()) {
    const selected = new Map([...seeds].map(([file, symbols]) => [file, new Set(symbols)]));
    const layers = new Map<string, RecoveryLayer>(hints);
    const layerOf = (file: string) => layers.get(file) || recoveryLayer(file);
    const relations: RecoveryRelation[] = [];
    const pending: RecoveryPending[] = [];
    const parameters = new Set<string>();
    const features = [...selected.keys()].filter(file => layerOf(file) === 'feature');
    const stepFiles = [...new Set([...workspace.list('features', '.ts'), ...selected.keys()].filter(file => file.endsWith('.ts')))];
    const definitions = stepFiles.flatMap(file => {
        const content = workspace.read(file);
        return content === null ? [] : inspectRecoveryCode('steps', content).units.filter(unit => unit.node && ts.isExpressionStatement(unit.node) && ts.isCallExpression(unit.node.expression)
                && ts.isIdentifier(unit.node.expression.expression) && ['Given', 'When', 'Then'].includes(unit.node.expression.expression.text))
            .map(unit => ({ expression: unit.key, file }));
    });
    for (const file of features) {
        const content = workspace.read(file);
        if (content === null) continue;
        const inspection = inspectRecoveryCode('feature', content);
        const caseUnits = inspection.units.filter(unit => unitSelected(unit.key, selected.get(file)!) || (caseId && unit.key.includes(`[${caseId}]`)));
        for (const unit of caseUnits) {
            selected.get(file)!.add(unit.key);
            const parsed = recoveryFeatureSteps(unit.text);
            parsed.parameters.forEach(name => parameters.add(name));
            for (const text of parsed.steps) {
                const matches = matchingStepDefinitions(text, definitions);
                if (matches.length !== 1) { pending.push({ id: `step:${file}:${text}`, path: file,
                    message: `Step sin asociación única: ${text}`, candidates: [...new Set(matches.map(item => item.file))] }); continue; }
                const match = matches[0];
                const symbols = selected.get(match.file) || new Set<string>();
                symbols.add(match.expression); selected.set(match.file, symbols); layers.set(match.file, 'steps');
                relations.push({ from: { path: file, symbol: text }, to: { path: match.file, symbol: match.expression }, kind: 'step' });
            }
        }
    }
    const visited = new Set<string>();
    for (let pass = 0; pass < 100; pass++) {
        let progressed = false;
        if (selected.size > 100) throw new Error('Más de 100 dependencias vinculadas; reduce las asociaciones del caso.');
        for (const [file, symbols] of selected) {
            const layer = layerOf(file);
            if (layer === 'feature' || layer === 'locators') continue;
            const content = workspace.read(file);
            if (content === null) continue;
            const parsed = inspectRecoveryCode(layer, content);
            for (const symbol of symbols) if (symbol !== '*' && !symbol.startsWith('import:') && !parsed.units.some(item => unitSelected(item.key, new Set([symbol])))) {
                pending.push({ id: `symbol:${file}:${symbol}`, path: file, message: `Símbolo sin definición reconocible: ${symbol}. Puede asociarse manualmente.` });
            }
            if (parsed.problem && !pending.some(item => item.id === `syntax:${file}`)) pending.push({ id: `syntax:${file}`, path: file, message: parsed.problem });
            const link = (from: string, target: string, symbol: string, kind: RecoveryRelation['kind']) => {
                const bucket = selected.get(target) || new Set<string>();
                bucket.add(symbol); selected.set(target, bucket);
                const relation = { from: { path: file, symbol: from }, to: { path: target, symbol }, kind };
                if (!relations.some(item => JSON.stringify(item) === JSON.stringify(relation))) relations.push(relation);
            };
            for (const unit of parsed.units.filter(item => !item.key.startsWith('import:') && unitSelected(item.key, symbols))) {
                const key = `${file}#${unit.key}`;
                if (visited.has(key)) continue;
                visited.add(key); progressed = true;
                const inspect = (node: ts.Node) => {
                    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
                        || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
                        pending.push({ id: `dynamic-import:${key}`, path: file, message: 'Import dinámico/require: asocia su dependencia explícitamente.' });
                    }
                    if (ts.isElementAccessExpression(node)) {
                        let root: ts.Expression = node.expression;
                        while (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root)) root = root.expression;
                        if (root.kind === ts.SyntaxKind.ThisKeyword || (ts.isIdentifier(root) && parsed.imports.some(item => item.local === (root as ts.Identifier).text))) {
                            pending.push({ id: `computed:${key}`, path: file, message: 'Referencia calculada: la relación con el método/locator requiere asociación explícita.' });
                        }
                    }
                    if (ts.isIdentifier(node) && node.text !== unit.key && parsed.units.some(item => item.key === node.text)
                        && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) link(unit.key, file, node.text, 'call');
                    if (ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword) {
                        if (parsed.units.some(item => item.key === node.name.text)) link(unit.key, file, node.name.text, 'call');
                        else pending.push({ id: `member:${key}:${node.name.text}`, path: file, message: `Método/getter no resuelto: ${node.name.text}` });
                    }
                    for (const imported of parsed.imports) {
                        if (!ts.isIdentifier(node) || node.text !== imported.local) continue;
                        // Only the identifier at the base of a reference, not a member with the same name.
                        if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) continue;
                        symbols.add(imported.unit.key);
                        let target: string | undefined;
                        try { target = workspace.resolve(file, imported.specifier); }
                        catch (error: any) { pending.push({ id: `import:${key}:${imported.specifier}`, path: file, message: error.message }); continue; }
                        if (!target) {
                            if (imported.specifier.startsWith('.') || /^@(screenobjects|locators|utils|support|common|features|resources)\//.test(imported.specifier))
                                pending.push({ id: `import:${key}:${imported.specifier}`, path: file, message: `Import local no resuelto: ${imported.specifier}` });
                            continue;
                        }
                        let parent: ts.Node = node;
                        const names: string[] = [];
                        while (ts.isPropertyAccessExpression(parent.parent) && parent.parent.expression === parent) {
                            names.push(parent.parent.name.text); parent = parent.parent;
                        }
                        if (target.endsWith('.json') && /(?:android|ios)$/i.test(names[0] || '')) layers.set(target, 'locators');
                        if (layer === 'steps' && names[0] && target.endsWith('.ts')) {
                            const module = inspectRecoveryCode('dependency', workspace.read(target) || '');
                            if (module.units.some(member => member.key === names[0] && member.node && ts.isClassDeclaration(member.node.parent))) layers.set(target, 'screen');
                        }
                        const locator = layerOf(target) === 'locators';
                        const symbol = locator ? names.join('.') : names[0] || (imported.imported === 'default' ? 'default' : imported.imported);
                        if (locator && names.length < 2) {
                            pending.push({ id: `locator:${key}`, path: target, message: 'Acceso dinámico al locator; asocia sus claves explícitamente.' });
                        } else link(unit.key, target, symbol, locator ? 'locator' : ts.isTypeReferenceNode(node.parent) ? 'import' : 'call');
                    }
                    ts.forEachChild(node, inspect);
                };
                if (unit.node) inspect(unit.node);
            }
        }
        if (!progressed) break;
        if (pass === 99) pending.push({ id: 'relations-limit', message: 'Hay dependencias pendientes fuera del alcance de 100 recorridos.' });
    }
    return { selected, layers, relations, pending: pending.filter((item, index, all) => all.findIndex(other => other.id === item.id) === index), parameters: [...parameters] };
}
