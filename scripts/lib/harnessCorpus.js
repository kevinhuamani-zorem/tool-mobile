// Portable, unapproved regression inputs. This loader never publishes golden cases.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function confinedFile(root, relative) {
    if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes('\0') || path.isAbsolute(relative)
        || relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`Ruta de corpus inválida: ${relative}`);
    let current = root;
    for (const part of relative.split('/')) {
        current = path.join(current, part);
        if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`El corpus no admite enlaces: ${relative}`);
    }
    if (!fs.statSync(current).isFile()) throw new Error(`El corpus requiere un archivo: ${relative}`);
    return current;
}

function readHarnessCorpus(file) {
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error('El manifiesto del corpus no puede ser un enlace.');
    const root = fs.realpathSync(path.dirname(file));
    const bytes = fs.readFileSync(file), manifest = JSON.parse(bytes);
    if (manifest.schemaVersion !== 1 || manifest.kind !== 'recorder-agent-harness-corpus' || !manifest.corpusId
        || !Array.isArray(manifest.cases) || !manifest.cases.length) throw new Error('Esquema de corpus no soportado.');
    const ids = new Set(), paths = new Set(['corpus.json']);
    const files = [{ path: 'corpus.json', sha256: sha256(bytes), content: bytes }];
    if (manifest.synthetic !== true || manifest.qaReview?.status !== 'pending') throw new Error('El manifiesto técnico debe declarar synthetic y QA pendiente.');
    if (manifest.testData) {
        const ref = manifest.testData;
        if (ref.synthetic !== true || !/^[a-f0-9]{64}$/.test(ref.sha256 || '') || paths.has(ref.path)) throw new Error('Referencia de datos sintéticos inválida.');
        const content = fs.readFileSync(confinedFile(root, ref.path));
        if (sha256(content) !== ref.sha256) throw new Error('Hash de datos sintéticos diferente.');
        files.push({ path: ref.path, sha256: ref.sha256, content });
        paths.add(ref.path);
    }
    const cases = manifest.cases.map(row => {
        if (!row.id || ids.has(row.id) || !row.caseId || !row.family || row.platform !== 'android') throw new Error('Caso o familia de corpus inválido/duplicado.');
        ids.add(row.id);
        if (row.synthetic !== true || row.qaReview?.status !== 'pending' || row.pilotEligible !== false) throw new Error(`El corpus técnico no concede aprobación QA: ${row.id}`);
        const values = {};
        for (const name of ['scenario', 'labels']) {
            const ref = row[name];
            if (!ref || !/^[a-f0-9]{64}$/.test(ref.sha256 || '') || paths.has(ref.path)) throw new Error(`Referencia de corpus inválida/duplicada: ${row.id}/${name}`);
            const content = fs.readFileSync(confinedFile(root, ref.path));
            if (sha256(content) !== ref.sha256) throw new Error(`Hash de corpus diferente: ${row.id}/${name}`);
            paths.add(ref.path);
            files.push({ path: ref.path, sha256: ref.sha256, content });
            values[`${name}Value`] = JSON.parse(content);
        }
        const scenario = values.scenarioValue, labels = values.labelsValue;
        if (scenario.schemaVersion !== 1 || scenario.request?.caseId !== row.caseId || scenario.platform !== row.platform || !Array.isArray(scenario.actions) || !scenario.actions.length
            || labels.schemaVersion !== 1 || labels.caseId !== row.caseId || labels.reviewed !== false || labels.qaReview?.status !== 'pending') throw new Error(`Identidad o revisión incoherente: ${row.id}`);
        return { ...row, ...values };
    });
    return { manifest, cases, files, sha256: sha256(bytes) };
}
module.exports = { readHarnessCorpus, confinedFile, sha256 };
