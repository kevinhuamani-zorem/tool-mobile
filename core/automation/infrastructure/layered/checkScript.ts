/**
 * Verificador local de Zorem (`tools/check.js`).
 *
 * Sin una forma oficial de comprobar su Screen Object, cada modelo inventaba
 * la suya: buscaba `tsc` en el framework (denegado), `node_modules` (vacio),
 * `@babel/parser`, `--experimental-strip-types --check`, contaba llaves...
 * Eso era el "resolviendo dependencias" que alargaba cada corrida
 * (a014db25: 82 s de 190 s; c4f989db: dos comandos denegados y un script
 * propio). Este script ejecuta las mismas reglas mecanicas que el validador
 * (`screen-object-contract.js`, la copia compilada del contrato) y la sintaxis
 * TypeScript con el `typescript` que el framework ya tiene instalado, sobre
 * `interaction-result.json`, y termina con codigo 1 si hay problemas. Vive en
 * `tools/` junto al contrato: son herramientas del autor, no evidencia del
 * caso, y por eso no se listan en `input-manifest.json`.
 */
import fs from 'fs';
import path from 'path';
import { projectPaths } from '../../../workspace';

export const INTERACTION_TOOLS_DIRECTORY = 'tools';
export const INTERACTION_CHECK_SCRIPT = `${INTERACTION_TOOLS_DIRECTORY}/check.js`;
const CONTRACT_FILE = 'screen-object-contract.js';

/**
 * `typescript` utilizable desde un proceso `node` independiente: el del
 * framework destino (siempre presente en un proyecto wdio+TS) y, si no, el
 * del recorder cuando no esta empaquetado dentro de un asar (un `require`
 * hijo no puede leer dentro del asar). `null` deja el chequeo de sintaxis
 * fuera con un aviso, nunca rompe el script.
 */
export function resolveSandboxTypescript(frameworkRoot: string = projectPaths.frameworkRoot): string | null {
    const candidates = [
        path.join(frameworkRoot, 'node_modules', 'typescript', 'lib', 'typescript.js'),
    ];
    try {
        candidates.push(require.resolve('typescript/lib/typescript.js'));
    } catch {
        // El recorder puede no exponer typescript desde aqui.
    }
    for (const candidate of candidates) {
        if (candidate.includes('.asar')) continue;
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
}

export function interactionCheckScript(typescriptPath: string | null): string {
    return `'use strict';
// Verificador local de Zorem. Uso: node tools/check.js [interaction-result.json]
// Ejecuta las reglas mecanicas del Screen Object (screen-object-contract.js),
// comprueba el JSON de locators y la sintaxis TypeScript. Salida 0 = sin problemas.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));
const readJson = file => JSON.parse(read(file));
const resultFile = path.resolve(root, process.argv[2] || 'interaction-result.json');
const problems = [];
const notes = [];
let result;
try {
    result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
} catch (error) {
    console.log('ERROR ' + path.basename(resultFile) + ' ilegible: ' + error.message);
    process.exit(1);
}
const files = Array.isArray(result.files) ? result.files : [];
const screen = files.find(file => file && file.layer === 'screen');
const locators = files.find(file => file && file.layer === 'locators');
if (!screen) problems.push('[missing-layer] files[] no trae la capa screen.');
if (!locators) problems.push('[missing-layer] files[] no trae la capa locators.');
if (files.length !== 2) problems.push('[extra-layer] files[] debe traer exactamente screen y locators (hay ' + files.length + ').');
if (!Array.isArray(result.actionTrace)) problems.push('[trace] actionTrace ausente: debe ser un array (una entrada por accion trazada).');

if (locators) {
    try {
        const document = JSON.parse(String(locators.content));
        const blocks = Object.keys(document);
        const ends = suffix => blocks.some(block => block.toLowerCase().endsWith(suffix));
        if (!ends('android')) problems.push('[platform-coverage] Locators: falta un bloque cuyo nombre termine en Android.');
        if (!ends('ios')) problems.push('[platform-coverage] Locators: falta un bloque cuyo nombre termine en Ios/iOS.');
    } catch (error) {
        problems.push('[json] Locators: JSON invalido: ' + error.message);
    }
}

if (screen && exists('framework-api.json')) {
    const api = readJson('framework-api.json');
    const contract = require('./${CONTRACT_FILE}');
    const plan = exists('generation-plan.json') ? readJson('generation-plan.json') : { files: [] };
    const screenPlan = (plan.files || []).find(file => file.layer === 'screen');
    const behavior = exists('behavior-result.json') ? readJson('behavior-result.json') : null;
    const stepsContent = behavior && Array.isArray(behavior.files)
        ? String((behavior.files.find(file => file.layer === 'steps') || {}).content || '')
        : '';
    const screenObject = (api.screenObjects || []).find(item => !screenPlan || item.path === screenPlan.path)
        || (api.screenObjects || [])[0];
    const expectedImports = {};
    const expectedIdentifiers = {};
    for (const module of (api.locatorContract && api.locatorContract.modules) || []) {
        const fileName = String(module.path || '').split('/').pop();
        if (!fileName) continue;
        expectedImports[fileName] = module.importSource;
        expectedIdentifiers[fileName] = module.identifier;
    }
    const rules = {
        typeLocatorSymbol: api.locatorContract.typeLocator.symbol,
        typeLocatorImport: api.locatorContract.typeLocator.import,
        helpers: (api.helpers || []).map(helper => ({
            property: helper.property,
            methods: (helper.methods || []).map(method => method.name),
        })),
        platformOrder: api.locatorContract.getElement.platformOrder,
        parameterCount: api.locatorContract.getElement.parameterCount,
        expectedImports,
        expectedIdentifiers,
        stepsContent,
        expectedNames: screenObject ? {
            className: screenObject.className,
            instanceName: screenObject.instanceName,
            importSource: screenObject.existingImport ? screenObject.existingImport.source : screenObject.importSource,
            baseScreenClass: api.baseScreen ? api.baseScreen.className : undefined,
        } : undefined,
    };
    // Lo que el baseline ya traia no es del autor: se descuenta, como hace el validador.
    const baselineFile = screenPlan ? 'baselines/screen-' + String(screenPlan.path).split('/').pop() : null;
    const inherited = new Set(baselineFile && exists(baselineFile)
        ? contract.screenObjectProblems(read(baselineFile), rules)
            .filter(problem => problem.code !== 'screen-alias')
            .map(problem => problem.code + '\\u0000' + problem.message)
        : []);
    for (const problem of contract.screenObjectProblems(String(screen.content), rules)) {
        if (inherited.has(problem.code + '\\u0000' + problem.message)) continue;
        // El alias con el que Steps importa el Screen lo escribe Lorem: se avisa, no se cobra.
        if (problem.code === 'screen-alias') { notes.push('[screen-alias] (capa Steps, de Lorem) ' + problem.message); continue; }
        problems.push('[' + problem.code + '] ' + problem.message);
    }
    if (api.textAssertion && /\\bthis\\.readRecordedText\\s*\\(/.test(String(screen.content))) {
        const normalize = text => String(text).replace(/\\s+/g, ' ').trim();
        if (!normalize(screen.content).includes(normalize(api.textAssertion.helper))) {
            notes.push('El helper readRecordedText no coincide textualmente con framework-api.json.textAssertion.helper; copialo identico (Derek lo restaura si difiere).');
        }
    }
} else if (screen) {
    notes.push('Sin framework-api.json no se comprueba el contrato del Screen Object.');
}

const typescriptPath = ${JSON.stringify(typescriptPath)};
if (screen && typescriptPath && fs.existsSync(typescriptPath)) {
    const ts = require(typescriptPath);
    const source = ts.createSourceFile('screen.ts', String(screen.content), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const diagnostic of source.parseDiagnostics || []) {
        const position = source.getLineAndCharacterOfPosition(diagnostic.start || 0);
        problems.push('[typescript-syntax] ' + path.basename(String(screen.path)) + ':' + (position.line + 1) + ':' + (position.character + 1)
            + ' ' + ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '));
    }
} else if (screen) {
    notes.push('Sin typescript disponible: la sintaxis se comprobara al importar el resultado.');
}

for (const note of notes) console.log('NOTA ' + note);
if (problems.length) {
    for (const problem of problems) console.log('ERROR ' + problem);
    console.log(problems.length + ' problema(s). Corrige interaction-result.json y vuelve a ejecutar node tools/check.js');
    process.exit(1);
}
console.log('OK: Screen Object y Locators cumplen el contrato mecanico' + (typescriptPath ? ' y la sintaxis TypeScript.' : '.'));
`;
}

/**
 * Copia el contrato compilado y escribe `tools/check.js` en el stage del autor
 * de interacciones. Devuelve las rutas relativas escritas (para el prompt).
 */
export function writeInteractionTools(packageDirectory: string, stageDirectory: string): string[] {
    const contractSource = path.join(packageDirectory, CONTRACT_FILE);
    if (!fs.existsSync(contractSource)) return [];
    const toolsDirectory = path.join(stageDirectory, INTERACTION_TOOLS_DIRECTORY);
    fs.mkdirSync(toolsDirectory, { recursive: true });
    fs.copyFileSync(contractSource, path.join(toolsDirectory, CONTRACT_FILE));
    fs.writeFileSync(path.join(toolsDirectory, 'check.js'), interactionCheckScript(resolveSandboxTypescript()), 'utf8');
    return [INTERACTION_CHECK_SCRIPT, `${INTERACTION_TOOLS_DIRECTORY}/${CONTRACT_FILE}`];
}
