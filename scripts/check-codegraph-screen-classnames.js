#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { CodeGraph } = require('../dist/core/codeGraph');
const { projectPaths } = require('../dist/core/projectPaths');

function walk(dir, files = []) {
    if (!fs.existsSync(dir)) return files;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(absolute, files);
        else if (entry.isFile() && absolute.endsWith('.ts')) files.push(absolute);
    }
    return files;
}

function declaredClassName(file, content) {
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    let name = null;
    function visit(node) {
        if (name) return;
        if ((ts.isClassDeclaration(node) || ts.isClassExpression(node))
            && node.name && ts.isIdentifier(node.name)) {
            name = node.name.text;
            return;
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
    return name;
}

const frameworkRoot = projectPaths.frameworkRoot;
const files = walk(path.join(frameworkRoot, 'screenobjects'));
const graphNodes = new CodeGraph().snapshot().nodes.filter(node => node.type === 'screenObject');
const nodesByPath = new Map(graphNodes.map(node => [node.file, node]));

const mismatches = [];
for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const expected = declaredClassName(file, content);
    const relative = path.relative(frameworkRoot, file).replace(/\\/g, '/');
    const actual = nodesByPath.get(relative)?.name || null;
    if (expected !== actual) {
        mismatches.push({ file: relative, expected, actual });
    }
}

const report = {
    screenObjectFiles: files.length,
    matched: files.length - mismatches.length,
    mismatches: mismatches.length,
    details: mismatches.slice(0, 20),
};
console.log(JSON.stringify(report, null, 2));
process.exit(mismatches.length ? 1 : 0);
