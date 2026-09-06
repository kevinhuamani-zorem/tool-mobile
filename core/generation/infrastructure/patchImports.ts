import ts from 'typescript';

const parse = (text: string) => ts.createSourceFile('patch.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

/** Reads multiline imports for generation and application; never infers them from filenames. */
export function proposedImports(content: string): string[] {
    const source = parse(content);
    return source.statements.filter(ts.isImportDeclaration).map(node => node.getText(source));
}

function importBindings(node: ts.ImportDeclaration): Array<{ local: string; imported: string; typeOnly: boolean }> {
    const c = node.importClause;
    const result: { local: string; imported: string; typeOnly: boolean }[] = [];
    if (c?.name) result.push({ local: c.name.text, imported: 'default', typeOnly: c.isTypeOnly });
    if (c?.namedBindings && ts.isNamespaceImport(c.namedBindings)) {
        result.push({ local: c.namedBindings.name.text, imported: '*', typeOnly: c.isTypeOnly });
    } else if (c?.namedBindings && ts.isNamedImports(c.namedBindings)) {
        for (const spec of c.namedBindings.elements) result.push({
            local: spec.name.text, imported: (spec.propertyName || spec.name).text,
            typeOnly: c.isTypeOnly || spec.isTypeOnly,
        });
    }
    return result;
}

/**
 * Imports del contenido propuesto que aportan algun binding que el baseline
 * aun no declara. Un Screen legacy importa `LocatorOtp` por ruta relativa y el
 * generador por alias: son el mismo binding, no una adicion (`resolveModule`
 * decide la equivalencia). Es lo que un `update` debe pedirle al autor que
 * integre; mandarle todos los imports le hacia reescribir los del baseline.
 */
export function missingImports(baseline: string, proposed: string, resolveModule: (specifier: string) => string = value => value): string[] {
    const existing = new Set(parse(baseline).statements.filter(ts.isImportDeclaration)
        .flatMap(node => importBindings(node).map(binding => binding.local)));
    void resolveModule;
    return proposedImports(proposed).filter(text => {
        const declaration = parse(text).statements.find(ts.isImportDeclaration);
        if (!declaration) return false;
        const bindings = importBindings(declaration);
        if (!bindings.length) return !existing.size;
        return bindings.some(binding => !existing.has(binding.local));
    });
}

/** Merge bindings while preserving all code outside the affected import declarations. */
export function mergePatchImports(content: string, additions: string[], resolveModule: (specifier: string) => string = value => value): string {
    let output = content;
    for (const text of additions) {
        const source = parse(output);
        const imports = source.statements.filter(ts.isImportDeclaration);
        const incoming = parse(text).statements.find(ts.isImportDeclaration);
        if (!incoming || !ts.isStringLiteral(incoming.moduleSpecifier)) continue;
        const moduleName = incoming.moduleSpecifier.text;
        const sameModule = imports.filter(node => ts.isStringLiteral(node.moduleSpecifier)
            && resolveModule(node.moduleSpecifier.text) === resolveModule(moduleName));
        const clause = incoming.importClause;
        if (!clause && sameModule.length) continue;

        const bindings = (node: ts.ImportDeclaration) => {
            const c = node.importClause;
            const result: { local: string; imported: string; typeOnly: boolean }[] = [];
            if (c?.name) result.push({ local: c.name.text, imported: 'default', typeOnly: c.isTypeOnly });
            if (c?.namedBindings && ts.isNamespaceImport(c.namedBindings)) {
                result.push({ local: c.namedBindings.name.text, imported: '*', typeOnly: c.isTypeOnly });
            } else if (c?.namedBindings && ts.isNamedImports(c.namedBindings)) {
                for (const spec of c.namedBindings.elements) result.push({
                    local: spec.name.text, imported: (spec.propertyName || spec.name).text,
                    typeOnly: c.isTypeOnly || spec.isTypeOnly,
                });
            }
            return result;
        };
        const existing = imports.flatMap(node => bindings(node).map(binding => ({
            ...binding, module: (node.moduleSpecifier as ts.StringLiteral).text,
        })));
        const missing = new Set<string>();
        for (const binding of bindings(incoming)) {
            const prior = existing.find(item => item.local === binding.local);
            if (!prior) { missing.add(binding.local); continue; }
            if (resolveModule(prior.module) !== resolveModule(moduleName) || prior.imported !== binding.imported || (prior.typeOnly && !binding.typeOnly)) {
                throw new Error(`Import incompatible para ${binding.local}: conserva el binding existente y corrige la propuesta.`);
            }
        }
        if (clause && !missing.size) continue;
        const named = clause?.namedBindings;
        const nextNamed = named && (ts.isNamedImports(named)
            ? ts.factory.updateNamedImports(named, named.elements.filter(item => missing.has(item.name.text)))
            : missing.has(named.name.text) ? named : undefined);
        const nextClause = clause && ts.factory.updateImportClause(clause, clause.isTypeOnly,
            clause.name && missing.has(clause.name.text) ? clause.name : undefined,
            nextNamed && (!ts.isNamedImports(nextNamed) || nextNamed.elements.length) ? nextNamed : undefined);
        // Named bindings can be merged into a compatible declaration. Namespace
        // and type-only declarations stay separate to preserve TS semantics.
        const target = nextClause?.namedBindings && ts.isNamedImports(nextClause.namedBindings)
            ? sameModule.find(node => node.importClause
                && node.importClause.isTypeOnly === nextClause.isTypeOnly
                && (!node.importClause.namedBindings || ts.isNamedImports(node.importClause.namedBindings))
                && (!nextClause.name || !node.importClause.name)
                && (node.attributes?.getText(source) || '') === (incoming.attributes?.getText() || ''))
            : undefined;
        if (target && nextClause) {
            const prior = target.importClause!;
            const elements = prior.namedBindings && ts.isNamedImports(prior.namedBindings) ? [...prior.namedBindings.elements] : [];
            elements.push(...(nextClause.namedBindings as ts.NamedImports).elements);
            const merged = ts.factory.updateImportDeclaration(target, target.modifiers,
                ts.factory.updateImportClause(prior, prior.isTypeOnly, prior.name || nextClause.name,
                    ts.factory.createNamedImports(elements)), target.moduleSpecifier, target.attributes);
            output = output.slice(0, target.getStart(source))
                + printer.printNode(ts.EmitHint.Unspecified, merged, source) + output.slice(target.getEnd());
        } else {
            const declaration = ts.factory.updateImportDeclaration(incoming, incoming.modifiers,
                nextClause, incoming.moduleSpecifier, incoming.attributes);
            const at = imports.at(-1)?.getEnd() || 0;
            // Tras el ultimo import ya viene su salto de linea: anadir otro
            // dejaba una linea en blanco por cada import agregado.
            const rest = output.slice(at);
            output = output.slice(0, at) + '\n' + printer.printNode(ts.EmitHint.Unspecified, declaration, parse(text))
                + (rest.startsWith('\n') || rest.startsWith('\r\n') ? '' : '\n') + rest;
        }
    }
    return output;
}
