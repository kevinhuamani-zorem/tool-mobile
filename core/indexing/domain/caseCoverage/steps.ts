import ts from 'typescript';
import { coverageCallKey } from './extraction';
import { gherkinLineText, matchingStepDefinitions, stepDefinitionRegExp } from '../../../shared';
import { canonicalNode, coverageHash, CoverageSources, SourceModule } from './sources';

export interface CoverageOperation { core: string; hash: string; stepIndex: number; opaque?: boolean }
export interface CoverageExecution { operations: CoverageOperation[]; problems: Array<{ code: string; stepIndex: number }> }
interface Definition {
    module: SourceModule;
    expression: string;
    optionsHash: string;
    callback?: ts.ArrowFunction | ts.FunctionExpression;
    match: (text: string) => unknown[] | undefined;
}
const globalBindings = new Set(['expect', 'browser', 'driver', '$', '$$', 'Boolean', 'Number', 'String', 'Math', 'JSON', 'undefined']);
const stepNames = new Set(['Given', 'When', 'Then']);

function matcher(expression: ts.Expression, source: ts.SourceFile): Definition['match'] | undefined {
    if (!ts.isStringLiteralLike(expression) && !ts.isRegularExpressionLiteral(expression)) return undefined;
    const raw = ts.isStringLiteralLike(expression) ? expression.text : expression.getText(source);
    if (/\([^)]*[+*][^)]*\)[+*{]/.test(raw)) return undefined;
    const regex = stepDefinitionRegExp(raw);
    if (!regex) return undefined;
    const kinds = ts.isStringLiteralLike(expression) ? [...raw.matchAll(/\{([^}]*)\}/g)].map(item => item[1]) : [];
    if (kinds.some(kind => !['', 'string', 'word', 'int', 'float'].includes(kind))) return undefined;
    return value => {
        const match = regex.exec(gherkinLineText(value));
        if (!match) return undefined;
        const captures = match.slice(1);
        if (ts.isStringLiteralLike(expression) && kinds.length !== captures.length) return undefined;
        return captures.map((capture, index) => kinds[index] === 'int' || kinds[index] === 'float' ? Number(capture)
            : kinds[index] === 'string' ? capture.slice(1, -1).replace(/\\(['"\\])/g, '$1') : capture);
    };
}

export class CoverageStepDefinitions {
    private definitions: Definition[] = [];
    private unsupportedPatterns = false;
    private modules: SourceModule[] = [];
    constructor(private sources: CoverageSources, private linearCalls: Map<string, string[]> = new Map()) {
        for (const file of Object.keys(sources.files).filter(file => /(?:steps?|step-definitions)\.[cm]?[jt]s$/.test(file) || /(?:steps|step_definitions|step-definitions)\//.test(file) && /\.[cm]?[jt]s$/.test(file))) {
            const module = sources.module(file);
            this.modules.push(module);
            for (const statement of module.source.statements) {
                if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
                const call = statement.expression;
                if (!ts.isIdentifier(call.expression)) continue;
                const binding = module.imports.get(call.expression.text);
                if (!stepNames.has(binding?.exported || call.expression.text)) continue;
                const match = call.arguments[0] && matcher(call.arguments[0], module.source);
                if (!match) { this.unsupportedPatterns = true; continue; }
                const callback = call.arguments[call.arguments.length - 1];
                this.definitions.push({ module, optionsHash: coverageHash(call.arguments.slice(1, -1).map(argument => canonicalNode(argument, module.source))), expression: ts.isStringLiteralLike(call.arguments[0]) ? call.arguments[0].text : call.arguments[0].getText(module.source), match, callback: callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) ? callback : undefined });
            }
        }
    }
    hasStepHooks(): boolean {
        return Object.keys(this.sources.files).filter(file => /\.[jt]s$/.test(file)).some(file => {
            const module = this.sources.module(file);
            let found = false;
            const inspect = (node: ts.Node) => {
                if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
                    && ['BeforeStep', 'AfterStep'].includes(module.imports.get(node.expression.text)?.exported || node.expression.text)) found = true;
                ts.forEachChild(node, inspect);
            };
            inspect(module.source); return found;
        });
    }
    contextFingerprint(): { hash: string; complete: boolean } {
        let complete = true;
        const entries = this.modules.map(module => {
            if (module.problem) complete = false;
            const statements = module.source.statements.filter(statement => {
                if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression) || !ts.isIdentifier(statement.expression.expression)) return true;
                const call = statement.expression;
                const binding = module.imports.get((call.expression as ts.Identifier).text);
                return !stepNames.has(binding?.exported || (call.expression as ts.Identifier).text);
            });
            const dependencies = module.localDependencies.map(file => {
                const fingerprint = this.sources.fingerprint(file);
                if (!fingerprint.complete) complete = false;
                return [file, fingerprint.hash];
            });
            const context = statements.map(statement => {
                if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier)) return canonicalNode(statement, module.source);
                const resolved = this.sources.resolve(module.file, statement.moduleSpecifier.text);
                const clause = statement.importClause;
                const named = clause?.namedBindings;
                const imported = [clause?.name ? 'default' : '', named && ts.isNamespaceImport(named) ? '*' : '',
                    ...(named && ts.isNamedImports(named) ? named.elements.filter(element => !element.isTypeOnly).map(element => element.propertyName?.text || element.name.text).filter(name => !stepNames.has(name)) : [])].filter(Boolean).sort();
                return ['import', resolved.target, imported];
            });
            const options = module.source.statements.flatMap(statement => {
                if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression) || !ts.isIdentifier(statement.expression.expression)) return [];
                const call = statement.expression;
                const binding = module.imports.get((call.expression as ts.Identifier).text);
                if (!stepNames.has(binding?.exported || (call.expression as ts.Identifier).text) || call.arguments.length <= 2) return [];
                return [call.arguments.slice(1, -1).map(argument => canonicalNode(argument, module.source))];
            });
            return [module.file, context, options, dependencies.sort(([a], [b]) => a.localeCompare(b))];
        });
        return { hash: coverageHash(entries.sort((a, b) => String(a[0]).localeCompare(String(b[0])))), complete };
    }
    execute(steps: Array<{ text: string | undefined; index: number }>): CoverageExecution {
        const execution: CoverageExecution = { operations: [], problems: [] };
        for (const step of steps) {
            if (step.text === undefined) { execution.problems.push({ code: 'unsupported-step-input', stepIndex: step.index }); continue; }
            const matching = matchingStepDefinitions(step.text, this.definitions);
            const matches = matching.flatMap(definition => {
                const args = definition.match(step.text!);
                return args ? [{ definition, args }] : [];
            });
            if (matches.length !== 1 || matching.length !== 1 || this.unsupportedPatterns) {
                execution.problems.push({ code: matching.length > 1 ? 'ambiguous-step-binding' : this.unsupportedPatterns ? 'unsupported-step-pattern' : 'missing-step-binding', stepIndex: step.index });
                continue;
            }
            const { definition, args } = matches[0];
            try { this.callback(definition, args, step.index, execution.operations); }
            catch (error) {
                if (error instanceof OpaqueStepUnavailable) execution.operations.push(error.operation);
                else execution.problems.push({ code: error instanceof ProofUnavailable ? error.code : 'unsupported-step-behavior', stepIndex: step.index });
            }
        }
        return execution;
    }
    private callback(definition: Definition, args: unknown[], stepIndex: number, operations: CoverageOperation[]): void {
        const { module, callback } = definition;
        if (!callback || !ts.isBlock(callback.body) || module.problem) throw new ProofUnavailable(module.problem || 'unsupported-step-callback');
        if (callback.parameters.length !== args.length || callback.parameters.some(parameter => !ts.isIdentifier(parameter.name) || parameter.dotDotDotToken || parameter.initializer)) throw new ProofUnavailable('unsupported-parameter-binding');
        const locals = new Map<string, unknown>(callback.parameters.map((parameter, index) => [(parameter.name as ts.Identifier).text, ['value', args[index] === undefined ? ['undefined'] : args[index]]]));
        const importRef = (name: string): unknown => {
            const imported = module.imports.get(name);
            if (imported) {
                const fingerprint = this.sources.importFingerprint(imported);
                if (!fingerprint.complete) throw new ProofUnavailable('incomplete-source-dependencies');
                return ['import', imported.target, imported.exported, fingerprint.hash];
            }
            if (globalBindings.has(name)) return ['runtime', name];
            throw new ProofUnavailable('unsupported-local-binding');
        };
        const add = (value: unknown): unknown => {
            const withoutDependencies = (item: unknown): unknown => Array.isArray(item)
                ? item[0] === 'import' ? item.slice(0, 3) : item.map(withoutDependencies) : item;
            const core = coverageHash(withoutDependencies(value));
            const operation: CoverageOperation = { core, hash: coverageHash([value, definition.optionsHash]), stepIndex };
            const result = ['result', core, operations.filter(operation => operation.core === core).length];
            operations.push(operation);
            return result;
        };
        const expression = (node: ts.Expression, lift = false): unknown => {
            if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node)) return expression(node.expression, lift);
            if (ts.isAwaitExpression(node)) {
                if (!ts.isCallExpression(node.expression)) throw new ProofUnavailable('unsupported-await-expression');
                const call = node.expression;
                if (ts.isPropertyAccessExpression(call.expression) && ts.isIdentifier(call.expression.expression)) {
                    const binding = module.imports.get(call.expression.expression.text);
                    const statements = binding && !binding.external && binding.exported === 'default' && this.linearCalls.get(coverageCallKey(binding.target, call.expression.name.text));
                    if (statements) {
                        if (call.arguments.length || call.questionDotToken || call.expression.questionDotToken) throw new ProofUnavailable('unsupported-parameter-binding');
                        const receiver = importRef(call.expression.expression.text);
                        for (const statement of statements) add(['screen-statement', receiver, statement]);
                        return ['value', ['undefined']];
                    }
                }
                return add(['await', expression(node.expression)]);
            }
            if (ts.isStringLiteralLike(node)) return ['value', node.text];
            if (ts.isNumericLiteral(node)) return ['value', Number(node.text)];
            if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return ['value', node.kind === ts.SyntaxKind.TrueKeyword];
            if (node.kind === ts.SyntaxKind.NullKeyword) return ['value', null];
            if (ts.isIdentifier(node)) return locals.has(node.text) ? locals.get(node.text) : importRef(node.text);
            if (ts.isPropertyAccessExpression(node) && !node.questionDotToken) return ['property', expression(node.expression), node.name.text];
            if (ts.isCallExpression(node) && !node.questionDotToken) {
                if (ts.isIdentifier(node.expression) && locals.has(node.expression.text)) throw new ProofUnavailable('unsupported-local-call');
                if (node.arguments.some(ts.isSpreadElement)) throw new ProofUnavailable('unsupported-spread-argument');
                const call = ['call', expression(node.expression), node.arguments.map(argument => expression(argument))];
                return lift ? add(['call-effect', call]) : call;
            }
            if (ts.isArrayLiteralExpression(node) && node.elements.every(element => !ts.isSpreadElement(element) && !ts.isOmittedExpression(element))) return ['array', node.elements.map(element => expression(element))];
            if (ts.isObjectLiteralExpression(node)) return ['object', node.properties.map(property => {
                if (ts.isShorthandPropertyAssignment(property)) return [property.name.text, expression(property.name)];
                if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) throw new ProofUnavailable('unsupported-object-argument');
                return [ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name) ? property.name.text : property.name.getText(module.source), expression(property.initializer)];
            })];
            if (ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken, ts.SyntaxKind.ExclamationToken].includes(node.operator)) return ['unary', node.operator, expression(node.operand)];
            if (ts.isTemplateExpression(node)) return ['template', node.head.text, node.templateSpans.map(span => [expression(span.expression), span.literal.text])];
            throw new ProofUnavailable('unsupported-control-or-expression');
        };
        const start = operations.length;
        try {
            for (const statement of callback.body.statements) {
                if (ts.isExpressionStatement(statement)) {
                    if (!ts.isCallExpression(statement.expression) && !ts.isAwaitExpression(statement.expression)) throw new ProofUnavailable('unsupported-step-statement');
                    expression(statement.expression, true);
                } else if (ts.isVariableStatement(statement) && (statement.declarationList.flags & ts.NodeFlags.Const)) {
                    for (const declaration of statement.declarationList.declarations) {
                        if (!ts.isIdentifier(declaration.name) || !declaration.initializer || locals.has(declaration.name.text)) throw new ProofUnavailable('unsupported-local-binding');
                        // A property read may execute a getter now. Substituting it later
                        // can move that effect or detach a method from its receiver.
                        const pure = (node: ts.Node): boolean => {
                            if (ts.isCallExpression(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return false;
                            let valid = true; ts.forEachChild(node, child => { if (!pure(child)) valid = false; }); return valid;
                        };
                        if (!ts.isAwaitExpression(declaration.initializer) && !pure(declaration.initializer)) throw new ProofUnavailable('unsupported-eager-local');
                        locals.set(declaration.name.text, expression(declaration.initializer));
                    }
                } else throw new ProofUnavailable('unsupported-control-flow');
            }
            if (operations.length === start) throw new ProofUnavailable('no-observable-step-behavior');
        } catch (error) {
            operations.splice(start);
            // Identical unsupported callback bodies can still be compared as opaque source
            // only with a complete dependency closure; changed bodies remain unverified.
            const imports = [...module.imports].filter(([, binding]) => !stepNames.has(binding.exported));
            const closure = imports.map(([name, binding]) => {
                const fingerprint = this.sources.importFingerprint(binding);
                if (!fingerprint.complete) throw new ProofUnavailable('incomplete-source-dependencies');
                return [name, binding.target, binding.exported, fingerprint.hash];
            });
            if (error instanceof ProofUnavailable && ['incomplete-source-dependencies', 'unsupported-local-binding'].includes(error.code)) throw error;
            throw new OpaqueStepUnavailable({
                core: coverageHash(['opaque', callback.parameters.map(parameter => canonicalNode(parameter, module.source)), canonicalNode(callback.body, module.source), args]),
                hash: coverageHash(['opaque', callback.parameters.map(parameter => canonicalNode(parameter, module.source)), canonicalNode(callback.body, module.source), args, closure, definition.optionsHash]),
                stepIndex, opaque: true,
            });
        }
    }
}
class ProofUnavailable extends Error { constructor(readonly code: string) { super(code); } }
class OpaqueStepUnavailable extends ProofUnavailable {
    constructor(readonly operation: CoverageOperation) { super('unsupported-step-behavior'); }
}
