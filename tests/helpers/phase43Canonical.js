const crypto = require('node:crypto');

function normalizeText(value) {
    return String(value || '')
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+$/gm, '')
        .trim();
}

function stripGeneratedMetadata(content) {
    return normalizeText(content)
        .split('\n')
        .filter(line => !/^# Fecha de creación:/.test(line) && !/^\/\/ Fecha de creación:/.test(line))
        .join('\n')
        .trim();
}

function canonicalFeature(content) {
    const body = stripGeneratedMetadata(content);
    const lines = body.split('\n');
    return {
        tags: lines.filter(line => /^@/.test(line.trim())).map(line => line.trim()),
        scenario: lines.find(line => /^\s*Scenario/.test(line))?.trim() || '',
        gherkinSteps: lines
            .filter(line => /^\s*(Given|When|Then|And|But)\s+/.test(line))
            .map(line => line.trim()),
        dataTables: lines
            .filter(line => /^\s*\|.*\|\s*$/.test(line))
            .map(line => line.trim()),
    };
}

function canonicalSteps(content) {
    const body = stripGeneratedMetadata(content);
    const defs = [...body.matchAll(/(Given|When|Then)\(\/\^(.+?)\$\/,\s*async\s*\((.*?)\)\s*=>\s*\{([\s\S]*?)\}\);/g)]
        .map(match => {
            const fnBody = normalizeText(match[4]);
            const methodCall = fnBody.match(/await\s+[A-Za-z0-9_$.]+\.(\w+)\((.*?)\);/);
            return {
                keyword: match[1],
                expression: match[2],
                args: normalizeText(match[3]),
                usesDataTable: /DataTable/.test(body) || /dataTable\./.test(fnBody),
                method: methodCall?.[1] || '',
                methodArgs: normalizeText(methodCall?.[2] || ''),
            };
        });
    return {
        importsDataTable: /import\s+\{[^}]*\bDataTable\b/.test(body),
        definitions: defs,
    };
}

function canonicalScreen(content) {
    const body = stripGeneratedMetadata(content);
    const methods = [...body.matchAll(/public\s+(?:async\s+)?(\w+)\((.*?)\)\s*:\s*[^{]+\{([\s\S]*?)\n\s*\}/g)]
        .map(match => ({
            name: match[1],
            args: normalizeText(match[2]),
            hasLoop: /for\s*\(\s*const\s+/.test(match[3]),
            usesDynamicLocator: /\.replace\('\{[A-Za-z_][A-Za-z0-9_]*\}'/.test(match[3]),
        }));
    return {
        importsDataTableDrivenSignals: /replace\('\{/.test(body),
        methods,
    };
}

function canonicalLocators(content) {
    const parsed = JSON.parse(content);
    return Object.fromEntries(Object.keys(parsed).sort().map(block => [
        block,
        Object.fromEntries(Object.keys(parsed[block] || {}).sort().map(key => [key, parsed[block][key]])),
    ]));
}

function canonicalResponse(response) {
    const files = {};
    for (const file of response.files || []) {
        if (file.layer === 'feature') files.feature = canonicalFeature(file.content);
        if (file.layer === 'steps') files.steps = canonicalSteps(file.content);
        if (file.layer === 'screen') files.screen = canonicalScreen(file.content);
        if (file.layer === 'locators') files.locators = canonicalLocators(file.content);
    }
    const actionTrace = (response.actionTrace || [])
        .map(item => ({
            sequence: item.sequence,
            gherkinStep: normalizeText(item.gherkinStep),
            screenMethod: item.screenMethod || '',
            locatorName: item.locatorName || '',
        }))
        .sort((a, b) => a.sequence - b.sequence);
    const resolutions = (response.resolutions || [])
        .map(item => ({
            gapId: item.gapId,
            decision: item.decision,
        }))
        .sort((a, b) => a.gapId.localeCompare(b.gapId));
    return {
        recordingId: response.recordingId,
        planIdPresent: Boolean(response.planId),
        files,
        resolutions,
        actionTrace,
        fingerprints: {
            feature: crypto.createHash('sha256').update(JSON.stringify(files.feature || {})).digest('hex'),
            steps: crypto.createHash('sha256').update(JSON.stringify(files.steps || {})).digest('hex'),
            screen: crypto.createHash('sha256').update(JSON.stringify(files.screen || {})).digest('hex'),
            locators: crypto.createHash('sha256').update(JSON.stringify(files.locators || {})).digest('hex'),
        },
    };
}

module.exports = {
    canonicalResponse,
};

