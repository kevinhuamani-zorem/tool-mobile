import ts from 'typescript';
import { canonicalNode, CoverageSources, coverageHash } from './sources';

export interface LinearizedCoverage {
    beforeFiles: Record<string, string>;
    afterFiles: Record<string, string>;
    beforeCalls: Map<string, string[]>;
    afterCalls: Map<string, string[]>;
}
const printer = ts.createPrinter({ removeComments: true });
const key = (file: string, method: string) => `${file}#${method}`;
export const coverageCallKey = key;
const name = (member: ts.ClassElement): string | undefined => member.name && ts.isIdentifier(member.name) ? member.name.text : undefined;
const fingerprint = (node: ts.Node, source: ts.SourceFile): string => canonicalNode(node, source);

/** Proves one mechanical extraction, never arbitrary edited-method equivalence. */
export function linearizeCoverageExtractions(beforeFiles: Record<string, string>, afterFiles: Record<string, string>): LinearizedCoverage {
    const result: LinearizedCoverage = { beforeFiles, afterFiles, beforeCalls: new Map(), afterCalls: new Map() };
    const before = new CoverageSources(beforeFiles), after = new CoverageSources(afterFiles);
    const replacements: Record<string, string> = {};
    for (const file of Object.keys(beforeFiles).filter(file => /^screenobjects\/.*\.screen\.[jt]s$/.test(file) && afterFiles[file] !== undefined && beforeFiles[file] !== afterFiles[file])) {
        const oldModule = before.module(file), newModule = after.module(file);
        if (oldModule.problem || newModule.problem) continue;
        const oldClass = singletonClass(oldModule.source), newClass = singletonClass(newModule.source);
        if (!oldClass || !newClass) continue;
        const oldMembers = new Map(oldClass.members.map(member => [name(member), member]));
        const newMembers = new Map(newClass.members.map(member => [name(member), member]));
        const added = newClass.members.filter(member => !oldMembers.has(name(member)));
        const changed = oldClass.members.filter(member => !newMembers.has(name(member)) || fingerprint(member, oldModule.source) !== fingerprint(newMembers.get(name(member))!, newModule.source));
        if (added.length !== 1 || changed.length !== 1) continue;
        const oldMethod = changed[0], suffix = newMembers.get(name(oldMethod)), prefix = added[0];
        if (!linearMethod(oldMethod) || !suffix || !linearMethod(suffix) || !linearMethod(prefix)) continue;
        const oldStatements = oldMethod.body!.statements.map(statement => fingerprint(statement, oldModule.source));
        const suffixStatements = suffix.body!.statements.map(statement => fingerprint(statement, newModule.source));
        const prefixStatements = prefix.body!.statements.map(statement => fingerprint(statement, newModule.source));
        if (!prefixStatements.length || !suffixStatements.length || JSON.stringify(oldStatements) !== JSON.stringify([...prefixStatements, ...suffixStatements])) continue;
        const changedNames = new Set([name(oldMethod)!, name(prefix)!]);
        if (!safeRuntimeClass(before, file, oldClass, changedNames) || !safeRuntimeClass(after, file, newClass, changedNames)) continue;
        if (!safeReferences(before, file, changedNames) || !safeReferences(after, file, changedNames)) continue;
        // Restore the sole edited member and remove the extracted member. Everything
        // else (including inheritance, fields, getters and module effects) must match.
        const shell = (source: ts.SourceFile, declaration: ts.ClassDeclaration): string => {
            const empty = ts.factory.updateClassDeclaration(declaration, declaration.modifiers, declaration.name, declaration.typeParameters, declaration.heritageClauses, []);
            return printer.printFile(ts.factory.updateSourceFile(source, source.statements.map(statement => statement === declaration ? empty : statement)));
        };
        const signature = (method: ts.MethodDeclaration, source: ts.SourceFile): string => canonicalNode(ts.factory.updateMethodDeclaration(method, method.modifiers, method.asteriskToken, method.name, method.questionToken, method.typeParameters, method.parameters, method.type, undefined), source);
        const oldOrder = oldClass.members.map(member => fingerprint(member, oldModule.source));
        const restoredOrder = newClass.members.filter(member => member !== prefix).map(member => member === suffix ? fingerprint(oldMethod, oldModule.source) : fingerprint(member, newModule.source));
        if (shell(oldModule.source, oldClass) !== shell(newModule.source, newClass) || JSON.stringify(oldOrder) !== JSON.stringify(restoredOrder)
            || signature(oldMethod, oldModule.source) !== signature(suffix, newModule.source)) continue;
        replacements[file] = beforeFiles[file];
        result.beforeCalls.set(key(file, name(oldMethod)!), oldStatements);
        result.afterCalls.set(key(file, name(oldMethod)!), suffixStatements);
        result.afterCalls.set(key(file, name(prefix)!), prefixStatements);
    }
    if (!Object.keys(replacements).length) return result;
    const normalizedBefore = { ...beforeFiles }, normalizedAfter = { ...afterFiles, ...replacements };
    // Object ordering is irrelevant only when every supplied consumer reads a
    // static path ending in a scalar. Enumerated/computed/object reads stay pending.
    for (const file of Object.keys(beforeFiles).filter(file => file.endsWith('.json') && afterFiles[file] !== undefined && beforeFiles[file] !== afterFiles[file])) {
        try {
            const oldJson = JSON.parse(beforeFiles[file]), newJson = JSON.parse(afterFiles[file]);
            const canonical = sortedJson(oldJson);
            if (coverageHash(canonical) !== coverageHash(sortedJson(newJson)) || !staticScalarConsumers(before, file, oldJson) || !staticScalarConsumers(after, file, newJson)) continue;
            normalizedBefore[file] = normalizedAfter[file] = JSON.stringify(canonical);
        } catch { /* Malformed inputs remain unchanged and unverified. */ }
    }
    return { ...result, beforeFiles: normalizedBefore, afterFiles: normalizedAfter };
}
function singletonClass(source: ts.SourceFile): ts.ClassDeclaration | undefined {
    const exported = source.statements.filter(ts.isExportAssignment);
    if (exported.length !== 1 || !ts.isNewExpression(exported[0].expression) || exported[0].expression.arguments?.length || !ts.isIdentifier(exported[0].expression.expression)) return undefined;
    const className = exported[0].expression.expression.text;
    const classes = source.statements.filter(ts.isClassDeclaration).filter(item => item.name?.text === className);
    return classes.length === 1 ? classes[0] : undefined;
}
function linearMethod(node: ts.ClassElement): node is ts.MethodDeclaration {
    if (!ts.isMethodDeclaration(node) || !node.body || node.parameters.length || !node.name || !ts.isIdentifier(node.name) || node.asteriskToken) return false;
    if (!node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword) || node.modifiers.some(modifier => [ts.SyntaxKind.StaticKeyword, ts.SyntaxKind.Decorator].includes(modifier.kind))) return false;
    if (node.type?.getText().replace(/\s/g, '') !== 'Promise<void>') return false;
    if (!node.body.statements.every(statement => ts.isExpressionStatement(statement) && ts.isAwaitExpression(statement.expression) && ts.isCallExpression(statement.expression.expression))) return false;
    let safe = true;
    const inspect = (child: ts.Node) => {
        if (child.kind === ts.SyntaxKind.SuperKeyword || ts.isMetaProperty(child) || ts.isIdentifier(child) && child.text === 'arguments'
            || ts.isFunctionExpression(child) || ts.isArrowFunction(child) || ts.isElementAccessExpression(child) || ts.isAwaitExpression(child) && !ts.isExpressionStatement(child.parent)) safe = false;
        ts.forEachChild(child, inspect);
    };
    inspect(node.body); return safe;
}
function safeRuntimeClass(sources: CoverageSources, file: string, declaration: ts.ClassDeclaration, changed: Set<string>, visited = new Set<string>()): boolean {
    if (visited.has(file) || ts.canHaveDecorators(declaration) && ts.getDecorators(declaration)?.length) return false;
    visited.add(file);
    const source = sources.module(file);
    if (source.problem) return false;
    let identitySafe = true;
    const inspectIdentity = (node: ts.Node) => {
        if (declaration.name && ts.isIdentifier(node) && node.text === declaration.name.text) {
            const isDeclaration = node === declaration.name;
            const isDefaultInstance = ts.isNewExpression(node.parent) && node.parent.expression === node
                && ts.isExportAssignment(node.parent.parent) && node.parent.parent.expression === node.parent && !node.parent.arguments?.length;
            if (!isDeclaration && !isDefaultInstance) identitySafe = false;
        }
        ts.forEachChild(node, inspectIdentity);
    };
    inspectIdentity(source.source);
    if (!identitySafe) return false;
    for (const member of declaration.members) {
        if (member.name && ts.isComputedPropertyName(member.name) || ts.isClassStaticBlockDeclaration(member) || ts.canHaveDecorators(member) && ts.getDecorators(member)?.length) return false;
        if (ts.isPropertyDeclaration(member) && member.initializer) return false;
        if (ts.isSetAccessorDeclaration(member)) return false;
        if (ts.isConstructorDeclaration(member)) {
            if (member.parameters.length || !member.body) return false;
            for (const statement of member.body.statements) {
                if (!ts.isExpressionStatement(statement)) return false;
                const expression = statement.expression;
                if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken || !ts.isPropertyAccessExpression(expression.left)
                    || expression.left.expression.kind !== ts.SyntaxKind.ThisKeyword || !ts.isNewExpression(expression.right) || expression.right.arguments?.length
                    || !ts.isIdentifier(expression.right.expression) || !source.imports.has(expression.right.expression.text)) return false;
            }
        }
        let safe = true;
        const inspect = (child: ts.Node) => {
            if (child.kind === ts.SyntaxKind.ThisKeyword && (!ts.isPropertyAccessExpression(child.parent) || child.parent.expression !== child || ['constructor', '__proto__', 'prototype'].includes(child.parent.name.text) || changed.has(child.parent.name.text))) safe = false;
            ts.forEachChild(child, inspect);
        };
        // Fields and constructors were constrained separately. This traversal also
        // forbids virtual calls to the changed members from other class methods.
        inspect(member);
        if (!safe) return false;
    }
    for (const clause of declaration.heritageClauses || []) for (const type of clause.types) {
        if (!ts.isIdentifier(type.expression)) return false;
        const imported = source.imports.get(type.expression.text);
        if (!imported || imported.external) return false;
        const parent = sources.module(imported.target);
        const classes = parent.source.statements.filter(ts.isClassDeclaration);
        if (classes.length !== 1 || !safeRuntimeClass(sources, imported.target, classes[0], changed, visited)) return false;
    }
    return true;
}
function safeReferences(sources: CoverageSources, file: string, changed: Set<string>): boolean {
    for (const target of Object.keys(sources.files).filter(path => /\.[jt]s$/.test(path) && path !== file)) {
        const module = sources.module(target);
        const aliases = new Set([...module.imports].filter(([, binding]) => binding.target === file).map(([alias]) => alias));
        if (!aliases.size) continue;
        let safe = true;
        const inspect = (node: ts.Node) => {
            if (ts.isIdentifier(node) && aliases.has(node.text) && !ts.isImportClause(node.parent) && !ts.isImportSpecifier(node.parent)) {
                const property = node.parent;
                if (!ts.isPropertyAccessExpression(property) || property.expression !== node) { safe = false; return; }
                // Every use must be an ordinary awaited invocation from a registered
                // Step callback; hooks, rebinding and passing the object are excluded.
                if (!ts.isCallExpression(property.parent) || property.parent.expression !== property || !ts.isAwaitExpression(property.parent.parent)) { safe = false; return; }
                let ancestor: ts.Node = property;
                while (ancestor.parent && !ts.isArrowFunction(ancestor) && !ts.isFunctionExpression(ancestor)) ancestor = ancestor.parent;
                const registration = ancestor.parent;
                if (!registration || !ts.isCallExpression(registration) || !ts.isIdentifier(registration.expression)
                    || !['Given', 'When', 'Then'].includes(module.imports.get(registration.expression.text)?.exported || registration.expression.text)) safe = false;
                if (changed.has(property.name.text) && property.parent.arguments.length) safe = false;
            }
            ts.forEachChild(node, inspect);
        };
        inspect(module.source);
        if (!safe) return false;
    }
    return true;
}
function staticScalarConsumers(sources: CoverageSources, file: string, json: unknown): boolean {
    let used = false;
    for (const target of Object.keys(sources.files).filter(path => /\.[jt]s$/.test(path))) {
        const module = sources.module(target);
        const aliases = new Set([...module.imports].filter(([, binding]) => binding.target === file).map(([alias]) => alias));
        if (!aliases.size) continue;
        let safe = true;
        const inspect = (node: ts.Node) => {
            if (ts.isIdentifier(node) && aliases.has(node.text) && !ts.isImportClause(node.parent) && !ts.isImportSpecifier(node.parent)) {
                used = true; let current: ts.Node = node; let value = json;
                while (ts.isPropertyAccessExpression(current.parent) && current.parent.expression === current && value !== null && typeof value === 'object') {
                    const property: ts.PropertyAccessExpression = current.parent;
                    if (!Object.prototype.hasOwnProperty.call(value, property.name.text)) { safe = false; break; }
                    value = (value as Record<string, unknown>)[property.name.text]; current = property;
                }
                if (current === node || value !== null && typeof value === 'object') safe = false;
            }
            ts.forEachChild(node, inspect);
        };
        inspect(module.source); if (!safe) return false;
    }
    return used;
}
function sortedJson(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortedJson);
    return value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([name, child]) => [name, sortedJson(child)])) : value;
}
