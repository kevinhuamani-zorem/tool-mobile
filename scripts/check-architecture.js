#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const MODULES = new Set([
    'shared',
    'automation',
    'generation',
    'validation',
    'indexing',
    'workspace',
    'mobile-session',
    'coverage',
]);
const PUBLIC_SUBPATHS = new Map([
    ['automation', new Set(['contracts'])],
    ['workspace', new Set(['contracts'])],
]);

function normalized(file) {
    return file.split(path.sep).join('/');
}

function parseArgs(argv) {
    const value = flag => {
        const index = argv.indexOf(flag);
        return index >= 0 ? argv[index + 1] : undefined;
    };
    const root = path.resolve(value('--root') || path.resolve(__dirname, '..'));
    return {
        root,
        baseline: path.resolve(value('--baseline') || path.join(root, 'scripts', 'architecture-baseline.json')),
    };
}

function walk(directory, files = []) {
    if (!fs.existsSync(directory)) return files;
    const entries = fs.readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(absolute, files);
        else if (entry.isFile() && /\.(?:ts|tsx|js|jsx)$/.test(entry.name)) files.push(absolute);
    }
    return files;
}

function importsFrom(content, fileName = 'source.ts') {
    const imports = [];
    const source = ts.createSourceFile(
        fileName,
        content,
        ts.ScriptTarget.Latest,
        true,
        fileName.endsWith('.js') || fileName.endsWith('.jsx') ? ts.ScriptKind.JS : ts.ScriptKind.TS
    );
    function visit(node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)) {
            imports.push(node.moduleSpecifier.text);
        } else if (ts.isImportEqualsDeclaration(node) &&
            ts.isExternalModuleReference(node.moduleReference) &&
            node.moduleReference.expression &&
            ts.isStringLiteral(node.moduleReference.expression)) {
            imports.push(node.moduleReference.expression.text);
        } else if (ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'require' &&
            node.arguments.length === 1 &&
            ts.isStringLiteral(node.arguments[0])) {
            imports.push(node.arguments[0].text);
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
    return [...new Set(imports)];
}

function resolveLocalImport(importer, specifier) {
    if (!specifier.startsWith('.')) return null;
    const candidate = path.resolve(path.dirname(importer), specifier);
    const options = [
        candidate,
        `${candidate}.ts`,
        `${candidate}.tsx`,
        `${candidate}.js`,
        `${candidate}.jsx`,
        path.join(candidate, 'index.ts'),
        path.join(candidate, 'index.tsx'),
        path.join(candidate, 'index.js'),
    ];
    return options.find(file => fs.existsSync(file) && fs.statSync(file).isFile()) || null;
}

function canonicalCycle(cycle) {
    return [...new Set(cycle)].sort().join(' <-> ');
}

function findCycles(graph) {
    let index = 0;
    const indices = new Map();
    const lowLinks = new Map();
    const stack = [];
    const onStack = new Set();
    const cycles = [];

    function connect(node) {
        indices.set(node, index);
        lowLinks.set(node, index);
        index++;
        stack.push(node);
        onStack.add(node);

        for (const dependency of [...(graph.get(node) || [])].sort()) {
            if (!indices.has(dependency)) {
                connect(dependency);
                lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(dependency)));
            } else if (onStack.has(dependency)) {
                lowLinks.set(node, Math.min(lowLinks.get(node), indices.get(dependency)));
            }
        }

        if (lowLinks.get(node) !== indices.get(node)) return;
        const component = [];
        let current;
        do {
            current = stack.pop();
            onStack.delete(current);
            component.push(current);
        } while (current !== node);
        const selfCycle = component.length === 1 &&
            (graph.get(component[0]) || []).includes(component[0]);
        if (component.length > 1 || selfCycle) cycles.push(canonicalCycle(component));
    }

    for (const node of [...graph.keys()].sort()) {
        if (!indices.has(node)) connect(node);
    }
    return cycles.sort();
}

function moduleInfo(relativeFile) {
    const parts = normalized(relativeFile).split('/');
    if (parts[0] !== 'core' || !MODULES.has(parts[1])) return null;
    return {
        module: parts[1],
        layer: parts[2] || '',
        parts,
    };
}

function isPublicTarget(info, targetRelative) {
    const parts = normalized(targetRelative).split('/');
    if (parts[0] !== 'core' || parts[1] !== info.module) return false;
    if (parts.length === 3 && parts[2] === 'index.ts') return true;
    return parts.length === 4 &&
        parts[3] === 'index.ts' &&
        PUBLIC_SUBPATHS.get(info.module)?.has(parts[2]);
}

function forbiddenRuntime(specifier) {
    const name = specifier.replace(/^node:/, '');
    if (/^(?:fs)(?:$|\/|-)/.test(name)) return 'filesystem';
    if (/^(?:child_process)(?:$|\/|-)/.test(name)) return 'child_process';
    if (/^electron(?:$|\/|-)/.test(name)) return 'electron';
    if (/^(?:appium|webdriverio|copilot)(?:$|\/|-)/.test(name)) return name.split('/')[0];
    if (/^@(?:appium|wdio)\//.test(name)) return name.split('/')[0];
    if (/^@github\/copilot(?:$|\/|-)/.test(name)) return '@github/copilot';
    return null;
}

function analyzeArchitecture(root, baselineFile) {
    const coreRoot = path.join(root, 'core');
    const files = walk(coreRoot);
    const rendererFiles = walk(path.join(root, 'recorder', 'renderer'));
    const graph = new Map();
    const violations = [];
    const unclassifiedFiles = [];

    for (const file of files) {
        const relative = normalized(path.relative(root, file));
        const info = moduleInfo(relative);
        if (!info) unclassifiedFiles.push(relative);
        const imports = importsFrom(fs.readFileSync(file, 'utf8'), file);
        const dependencies = [];

        for (const specifier of imports) {
            const resolved = resolveLocalImport(file, specifier);
            if (resolved && resolved.startsWith(coreRoot + path.sep)) {
                const targetRelative = normalized(path.relative(root, resolved));
                dependencies.push(targetRelative);
                const targetInfo = moduleInfo(targetRelative);
                if (info && targetInfo && info.module !== targetInfo.module &&
                    !isPublicTarget(targetInfo, targetRelative)) {
                    violations.push({
                        code: 'deep-cross-module-import',
                        file: relative,
                        import: specifier,
                        message: `Usa la API pública de ${targetInfo.module}; no importes ${targetRelative}.`,
                    });
                }
                if (['validation', 'generation'].includes(info?.module) &&
                    targetInfo?.module === 'automation' &&
                    !(targetInfo.layer === 'contracts' && targetRelative.endsWith('/index.ts'))) {
                    violations.push({
                        code: `${info.module}-automation-boundary`,
                        file: relative,
                        import: specifier,
                        message: `${info.module} solo puede consumir automation/contracts.`,
                    });
                }
                if (
                    info?.module === 'automation'
                    && info.layer === 'contracts'
                    && targetInfo
                    && ['validation', 'generation'].includes(targetInfo.module)
                ) {
                    violations.push({
                        code: 'automation-contract-boundary',
                        file: relative,
                        import: specifier,
                        message: `automation/contracts no puede depender de ${targetInfo.module}.`,
                    });
                }
                if (info?.layer === 'domain' &&
                    targetInfo &&
                    ['application', 'infrastructure', 'ports'].includes(targetInfo.layer)) {
                    violations.push({
                        code: 'domain-layer-dependency',
                        file: relative,
                        import: specifier,
                        message: `domain no puede depender de ${targetInfo.layer}.`,
                    });
                }
                if (info && targetInfo &&
                    info.module === targetInfo.module &&
                    info.layer !== 'infrastructure' &&
                    // El índice raíz del módulo (`core/<módulo>/index.ts`, ver ADR-0001
                    // "retiro de fachadas") es su API pública agregadora: reexporta
                    // domain/application/infrastructure/ports a propósito para que
                    // otros módulos y la composition root dejen de importar rutas
                    // profundas. La regla de "infra solo detrás de un puerto" sigue
                    // aplicando a los archivos reales de domain/application.
                    info.layer !== 'index.ts' &&
                    targetInfo.layer === 'infrastructure') {
                    violations.push({
                        code: 'infrastructure-dependency',
                        file: relative,
                        import: specifier,
                        message: `${info.layer} debe depender de un puerto, no de infrastructure.`,
                    });
                }
            }

            const runtime = forbiddenRuntime(specifier);
            if (info && ['domain', 'application'].includes(info.layer) && runtime) {
                violations.push({
                    code: 'runtime-import-outside-infrastructure',
                    file: relative,
                    import: specifier,
                    message: `${info.layer} no puede importar ${runtime}.`,
                });
            }
        }

        if (info && /(?:Port|\.port)\.(?:ts|tsx)$/.test(path.basename(file)) && info.layer !== 'ports') {
            violations.push({
                code: 'misplaced-port',
                file: relative,
                message: `El puerto debe vivir en core/${info.module}/ports/.`,
            });
        }
        graph.set(relative, dependencies);
    }

    for (const file of rendererFiles) {
        const relative = normalized(path.relative(root, file));
        for (const specifier of importsFrom(fs.readFileSync(file, 'utf8'), file)) {
            const resolved = resolveLocalImport(file, specifier);
            if (resolved && resolved.startsWith(coreRoot + path.sep)) {
                violations.push({
                    code: 'renderer-core-import',
                    file: relative,
                    import: specifier,
                    message: 'El renderer solo puede consumir window.api.',
                });
            }
            const runtime = forbiddenRuntime(specifier);
            if (runtime) {
                violations.push({
                    code: 'renderer-runtime-import',
                    file: relative,
                    import: specifier,
                    message: `El renderer no puede importar ${runtime}.`,
                });
            }
        }
    }

    const baseline = fs.existsSync(baselineFile)
        ? JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
        : { allowedCycles: [] };
    const allowedCycles = new Set((baseline.allowedCycles || []).map(cycle =>
        canonicalCycle(cycle)
    ));
    const cycles = findCycles(graph);
    const unexpectedCycles = cycles.filter(cycle => !allowedCycles.has(cycle));
    unexpectedCycles.forEach(cycle => violations.push({
        code: 'dependency-cycle',
        file: cycle.split(' -> ')[0],
        message: cycle,
    }));

    return {
        files: files.length,
        classifiedFiles: files.length - unclassifiedFiles.length,
        unclassifiedFiles,
        modules: [...MODULES],
        cycles,
        allowedCycles: cycles.filter(cycle => allowedCycles.has(cycle)),
        unexpectedCycles,
        violations,
    };
}

if (require.main === module) {
    const { root, baseline } = parseArgs(process.argv.slice(2));
    const result = analyzeArchitecture(root, baseline);
    console.log(JSON.stringify(result, null, 2));
    if (result.violations.length) process.exitCode = 1;
}

module.exports = { analyzeArchitecture, canonicalCycle, findCycles, importsFrom };
