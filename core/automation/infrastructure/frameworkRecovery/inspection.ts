import ts from 'typescript';
import type { RecoveryLayer, RecoveryChange } from '../../contracts/frameworkRecovery';
export interface RecoveryUnit { key: string; start: number; end: number; text: string; node?: ts.Node }
export interface RecoveryInspection {
    units: RecoveryUnit[];
    imports: Array<{ local: string; imported: string; specifier: string; unit: RecoveryUnit }>;
    insertion: number;
    problem?: string;
}
export function inspectRecoveryCode(layer: RecoveryLayer, content: string): RecoveryInspection {
    const units: RecoveryUnit[] = [];
    const imports: RecoveryInspection['imports'] = [];
    if (layer === 'feature') {
        const starts = [...content.matchAll(/^[ \t]*Scenario(?: Outline)?:[ \t]*([^\r\n]+)/gm)];
        const headers = starts.map(match => {
            let start = match.index!;
            while (start > 0) {
                const end = start - (content[start - 1] === '\n' ? 1 : 0);
                const previous = content.lastIndexOf('\n', end - 1) + 1;
                const line = content.slice(previous, end).trim();
                if (line && !line.startsWith('@') && !line.startsWith('#')) break;
                start = previous;
            }
            return start;
        });
        for (let i = 0; i < starts.length; i++) {
            const start = headers[i];
            const end = headers[i + 1] ?? content.length;
            units.push({ key: starts[i][1].trim(), start, end, text: content.slice(start, end) });
        }
        return { units, imports, insertion: content.length, ...(!units.length ? { problem: 'No se reconocen escenarios Gherkin.' } : {}) };
    }
    if (layer === 'locators') {
        try {
            const blocks = JSON.parse(content);
            for (const [block, values] of Object.entries(blocks)) if (values && typeof values === 'object' && !Array.isArray(values)) {
                for (const [name, value] of Object.entries(values)) units.push({ key: `${block}.${name}`, start: 0, end: 0, text: JSON.stringify(value) });
            }
            return { units, imports, insertion: 0 };
        } catch { return { units, imports, insertion: 0, problem: 'JSON de locators ilegible; requiere asociación del archivo completo.' }; }
    }
    const source = ts.createSourceFile('case.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    let insertion = content.length;
    const add = (key: string, node: ts.Node) => {
        const unit = { key, start: node.getFullStart(), end: node.end, text: content.slice(node.getFullStart(), node.end), node };
        units.push(unit);
        return unit;
    };
    for (const statement of source.statements) {
        if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
            const specifier = statement.moduleSpecifier.text;
            const unit = add(`import:${specifier}`, statement);
            const clause = statement.importClause;
            if (clause?.name) imports.push({ local: clause.name.text, imported: 'default', specifier, unit });
            if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const item of clause.namedBindings.elements) {
                imports.push({ local: item.name.text, imported: item.propertyName?.text || item.name.text, specifier, unit });
            }
            if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) imports.push({ local: clause.namedBindings.name.text, imported: '*', specifier, unit });
        } else if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) add(statement.name.text, statement);
        else if (ts.isClassDeclaration(statement)) {
            insertion = statement.members.end;
            for (const member of statement.members) if (member.name) add(member.name.getText(source).replace(/^['"]|['"]$/g, ''), member);
        } else if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)
            && ts.isIdentifier(statement.expression.expression) && ['Given', 'When', 'Then'].includes(statement.expression.expression.text)) {
            const arg = statement.expression.arguments[0];
            if (arg && (ts.isRegularExpressionLiteral(arg) || ts.isStringLiteralLike(arg))) add(arg.text, statement);
        } else if (ts.isFunctionDeclaration(statement)) add(statement.modifiers?.some(item => item.kind === ts.SyntaxKind.DefaultKeyword) ? 'default' : statement.name?.text || 'anonymous', statement);
        else if (ts.isVariableStatement(statement)) {
            const names = statement.declarationList.declarations.map(item => item.name.getText(source));
            add(names.join(','), statement);
        } else if (ts.isExportAssignment(statement)) add('default', statement);
    }
    const diagnostics = (source as ts.SourceFile & { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics;
    return { units, imports, insertion, ...(diagnostics.length ? { problem: 'Sintaxis incompleta; las relaciones no reconocidas quedan pendientes.' } : {}) };
}
export function unitSelected(key: string, selected: Set<string>): boolean {
    return selected.has('*') || selected.has(key) || selected.has(key.split('.').at(-1)!)
        || selected.has(key.replace(/^\/\^|\$\/[a-z]*$/g, ''));
}
export function projectRecoveryFile(layer: RecoveryLayer, exported: string | null, current: string | null, selected: Set<string>, shared: boolean) {
    if (current === null) return { content: null, changes: [{ symbol: '*', before: exported, after: null, scope: 'case' as const }] };
    if (!shared || selected.has('*')) return { content: current, changes: current === exported ? []
        : [{ symbol: '*', before: exported, after: current, scope: 'case' as const }] };
    if (exported === null) {
        const parsed = inspectRecoveryCode(layer, current);
        if (parsed.problem) return { content: null, changes: [], problem: parsed.problem };
        let content = current;
        const changes: RecoveryChange[] = [];
        for (const unit of [...parsed.units].sort((a, b) => b.start - a.start)) {
            const own = unitSelected(unit.key, selected);
            const structural = unit.key === 'default' || (layer === 'screen' && /new\s+\w+\s*\(/.test(unit.text));
            changes.push({ symbol: unit.key, before: null, after: unit.text, scope: own || structural ? 'case' : 'unrelated' });
            if (!own && !structural && layer !== 'locators') content = content.slice(0, unit.start) + content.slice(unit.end);
        }
        if (layer === 'locators') {
            const value = JSON.parse(current);
            for (const unit of parsed.units) if (!unitSelected(unit.key, selected)) {
                const [block, name] = unit.key.split('.'); delete value[block][name];
            }
            content = JSON.stringify(value, null, 2) + '\n';
        }
        return { content, changes };
    }
    const before = inspectRecoveryCode(layer, exported || '');
    const after = inspectRecoveryCode(layer, current);
    if (before.problem || after.problem) return { content: exported, changes: [], problem: before.problem || after.problem };
    const changes: RecoveryChange[] = [];
    const replacements: Array<{ start: number; end: number; text: string }> = [];
    const added: string[] = [];
    let content = exported || '';
    for (const key of new Set([...before.units, ...after.units].map(unit => unit.key))) {
        const old = before.units.find(unit => unit.key === key);
        const now = after.units.find(unit => unit.key === key);
        if (old?.text === now?.text) continue;
        const own = unitSelected(key, selected);
        changes.push({ symbol: key, before: old?.text ?? null, after: now?.text ?? null, scope: own ? 'case' : 'unrelated' });
        if (!own) continue;
        if (old) replacements.push({ start: old.start, end: old.end, text: now?.text || '' });
        else if (now) added.push(now.text);
    }
    if (layer === 'locators') {
        try {
            const value = JSON.parse(exported || '{}');
            for (const change of changes.filter(item => item.scope === 'case')) {
                const [block, name] = change.symbol.split('.');
                if (change.after === null) delete value[block]?.[name];
                else { if (!Object.prototype.hasOwnProperty.call(value, block)) Object.defineProperty(value, block, { value: {}, enumerable: true, writable: true, configurable: true });
                    Object.defineProperty(value[block], name, { value: JSON.parse(change.after), enumerable: true, writable: true, configurable: true }); }
            }
            content = JSON.stringify(value, null, 2) + '\n';
        } catch { return { content: exported, changes, problem: after.problem || 'No se puede aislar el JSON compartido.' }; }
    } else {
        // Imports stay at the top; class members are added inside the original class.
        const newImports = added.filter(text => /^\s*import\b/.test(text));
        const members = added.filter(text => !/^\s*import\b/.test(text));
        replacements.push({ start: before.insertion, end: before.insertion, text: members.join('') });
        for (const edit of replacements.sort((a, b) => b.start - a.start)) content = content.slice(0, edit.start) + edit.text + content.slice(edit.end);
        content = newImports.join('') + content;
    }
    const structure = (text: string, parsed: RecoveryInspection) => {
        for (const unit of [...parsed.units].sort((a, b) => b.start - a.start)) text = text.slice(0, unit.start) + text.slice(unit.end);
        return text.replace(/\s+/g, '');
    };
    const changedStructure = layer !== 'locators' && structure(exported, before) !== structure(current, after);
    return { content, changes, ...(changedStructure ? { problem: 'Cambios estructurales fuera de los símbolos reconocidos. Asocia el archivo completo si pertenece al caso.' } : {}) };
}
export function recoveryFeatureSteps(content: string): { steps: string[]; parameters: string[] } {
    const steps = [...content.matchAll(/^\s*(?:Given|When|Then|And|But)\s+([^\r\n]+)/gm)].map(match => match[1].trim());
    const parameters = [...new Set([...content.matchAll(/<([^>]+)>/g)].map(match => match[1]))];
    const examples = content.split(/^\s*Examples:[^\r\n]*/m).slice(1).flatMap(block => {
        const rows = block.split(/\r?\n/).filter(line => /^\s*\|/.test(line)).map(line => line.trim().slice(1, -1).split('|').map(cell => cell.trim()));
        return rows.slice(1).map(row => Object.fromEntries((rows[0] || []).map((key, i) => [key, row[i] || ''])));
    });
    return { steps: [...new Set(steps.flatMap(step => examples.length ? examples.map(row => step.replace(/<([^>]+)>/g, (_, key) => row[key] ?? `<${key}>`)) : [step]))], parameters };
}
