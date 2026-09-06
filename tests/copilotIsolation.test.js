const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    CopilotCliAdapter,
    AutomationAgentLauncher,
    copilotHelpSupports,
    copilotIsolationArgs,
    describeCopilotIsolation,
    mcpServersFromCopilotEvent,
    nonBuiltinMcpServers,
    readRememberedMcpServers,
    rememberMcpServers,
    normalizeServerNames,
} = require('../dist/core/automation');

const HELP_WITH_FLAGS = [
    'Usage: copilot [options] [command]',
    '  --disable-builtin-mcps         Disable all built-in MCP servers (currently: github-mcp-server)',
    '  --disable-mcp-server=SERVER-NAME  Disable a specific MCP server (can be used multiple times)',
    '  --no-custom-instructions       Disable loading of custom instructions',
].join('\n');
const HELP_WITHOUT_FLAGS = 'Usage: copilot [options]\n  --no-custom-instructions  Disable custom instructions\n';

function fakeChild() {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => child.emit('exit', null, 'SIGTERM');
    return child;
}

/** Runner falso: contesta `--help` y captura las ejecuciones reales. */
function fakeRunner({ help = HELP_WITH_FLAGS, events = [] } = {}) {
    const calls = [];
    const runner = (_command, args) => {
        const child = fakeChild();
        if (args.length === 1 && args[0] === '--help') {
            calls.push({ kind: 'help', args });
            process.nextTick(() => {
                if (help !== null) child.stdout.write(help);
                child.emit('close', help === null ? 1 : 0, null);
            });
            return child;
        }
        calls.push({ kind: 'run', args });
        process.nextTick(() => {
            for (const event of events) child.stdout.write(`${JSON.stringify(event)}\n`);
            child.emit('close', 0, null);
        });
        return child;
    };
    return { runner, calls };
}

function withEnv(overrides, run) {
    const previous = {};
    for (const [key, value] of Object.entries(overrides)) {
        previous[key] = process.env[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    return Promise.resolve().then(run).finally(() => {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });
}

const MCP_EVENT = {
    type: 'session.mcp_servers_loaded',
    data: {
        servers: [
            { name: 'github-mcp-server', status: 'connected', source: 'builtin' },
            { name: 'workiq', status: 'needs-auth', source: 'plugin' },
        ],
    },
};

test('la ayuda decide qué flags de aislamiento existen en el CLI instalado', () => {
    assert.equal(copilotHelpSupports(HELP_WITH_FLAGS, '--disable-builtin-mcps'), true);
    assert.equal(copilotHelpSupports(HELP_WITH_FLAGS, '--disable-mcp-server'), true);
    assert.equal(copilotHelpSupports(HELP_WITHOUT_FLAGS, '--disable-builtin-mcps'), false);
    assert.equal(copilotHelpSupports('  --disable-mcp-servers-all', '--disable-mcp-server'), false, 'prefijo no cuenta');
    assert.equal(copilotHelpSupports(null, '--disable-builtin-mcps'), false);
    assert.equal(copilotHelpSupports('', '--disable-builtin-mcps'), false);
});

test('copilotIsolationArgs solo emite flags anunciados y respeta el opt-out por entorno', async () => {
    const env = { RECORDER_COPILOT_DISABLED_MCP_SERVERS: 'workiq, mi-mcp ,workiq' };
    assert.deepEqual(copilotIsolationArgs({ help: HELP_WITH_FLAGS, servers: ['otro'], env }), [
        '--disable-builtin-mcps',
        '--disable-mcp-server=mi-mcp',
        '--disable-mcp-server=otro',
        '--disable-mcp-server=workiq',
    ]);
    assert.deepEqual(copilotIsolationArgs({ help: HELP_WITHOUT_FLAGS, servers: ['workiq'], env }), []);
    assert.deepEqual(copilotIsolationArgs({ help: null, servers: ['workiq'], env }), []);
    assert.deepEqual(copilotIsolationArgs({ help: HELP_WITH_FLAGS, servers: ['workiq'], env: { RECORDER_COPILOT_ISOLATE: '0' } }), []);
    assert.deepEqual(copilotIsolationArgs({ help: HELP_WITH_FLAGS, servers: ['workiq'], env: { RECORDER_COPILOT_ISOLATE: 'off' } }), []);
    assert.deepEqual(normalizeServerNames(['con espacio', 'con=igual', '', 'ok']), ['ok']);
    assert.equal(describeCopilotIsolation(['--disable-builtin-mcps', '--disable-mcp-server=workiq']), 'builtin-mcps+mcp[workiq]');
    assert.equal(describeCopilotIsolation([]), 'off');
});

test('los servidores no builtin se extraen del evento session.mcp_servers_loaded', () => {
    const servers = mcpServersFromCopilotEvent(MCP_EVENT);
    assert.deepEqual(servers.map(server => server.name), ['github-mcp-server', 'workiq']);
    assert.deepEqual(nonBuiltinMcpServers(servers), ['workiq']);
    assert.deepEqual(mcpServersFromCopilotEvent({ type: 'assistant.message', data: {} }), []);
    assert.deepEqual(mcpServersFromCopilotEvent(null), []);
});

test('la memoria de servidores persiste la unión y no reescribe sin novedades', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-mcp-memory-'));
    const file = path.join(root, 'config', 'copilot-mcp-servers.json');
    try {
        assert.deepEqual(readRememberedMcpServers(file), []);
        assert.deepEqual(rememberMcpServers(file, ['workiq']), ['workiq']);
        const first = fs.statSync(file).mtimeMs;
        assert.deepEqual(rememberMcpServers(file, ['workiq']), ['workiq']);
        assert.equal(fs.statSync(file).mtimeMs, first, 'sin novedades no se reescribe');
        assert.deepEqual(rememberMcpServers(file, ['abc']), ['abc', 'workiq']);
        assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { schemaVersion: 1, servers: ['abc', 'workiq'] });
        fs.writeFileSync(file, '{corrupto', 'utf8');
        assert.deepEqual(readRememberedMcpServers(file), []);
        assert.deepEqual(readRememberedMcpServers(undefined), []);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('adapter aislado sondea --help una vez y desactiva builtin y servidores configurados', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-isolate-'));
    const { runner, calls } = fakeRunner();
    const adapter = new CopilotCliAdapter(runner, 'copilot', ['-p'], 'claude-sonnet-5', 5_000, { isolateMcp: true });
    try {
        await withEnv({ RECORDER_COPILOT_DISABLED_MCP_SERVERS: 'workiq', RECORDER_COPILOT_ISOLATE: undefined }, async () => {
            await adapter.execute({ cwd: root, prompt: 'hola', timeoutMs: 1000, traceFile: 'agent-execution.log', traceLabel: 'zorem' });
            await adapter.execute({ cwd: root, prompt: 'otra', timeoutMs: 1000 });
        });
        assert.equal(calls.filter(call => call.kind === 'help').length, 1, 'una sola sonda por adapter');
        const runs = calls.filter(call => call.kind === 'run');
        assert.equal(runs.length, 2);
        for (const run of runs) {
            assert.ok(run.args.includes('--disable-builtin-mcps'), run.args.join(' '));
            assert.ok(run.args.includes('--disable-mcp-server=workiq'), run.args.join(' '));
            assert.ok(run.args.includes('--no-custom-instructions'));
            assert.equal(run.args.indexOf('--disable-builtin-mcps') > run.args.indexOf('hola') || run.args.indexOf('--disable-builtin-mcps') > run.args.indexOf('otra'), true, 'los flags van tras el prompt');
        }
        const trace = fs.readFileSync(path.join(root, 'agent-execution.log'), 'utf8');
        assert.match(trace, /\[zorem\]\[start\] .*mcpIsolation=builtin-mcps\+mcp\[workiq\]/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('sin flags en la ayuda el adapter no inventa opciones y lo deja en la traza', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-isolate-old-'));
    const { runner, calls } = fakeRunner({ help: HELP_WITHOUT_FLAGS });
    const adapter = new CopilotCliAdapter(runner, 'copilot', ['-p'], 'claude-sonnet-5', 5_000, { isolateMcp: true });
    try {
        await withEnv({ RECORDER_COPILOT_DISABLED_MCP_SERVERS: 'workiq', RECORDER_COPILOT_ISOLATE: undefined }, async () => {
            await adapter.execute({ cwd: root, prompt: 'hola', timeoutMs: 1000, traceFile: 'agent-execution.log' });
        });
        const run = calls.find(call => call.kind === 'run');
        assert.equal(run.args.some(arg => arg.startsWith('--disable-')), false);
        assert.match(fs.readFileSync(path.join(root, 'agent-execution.log'), 'utf8'), /mcpIsolation=unsupported/);

        const noHelp = fakeRunner({ help: null });
        const older = new CopilotCliAdapter(noHelp.runner, 'copilot', ['-p'], 'claude-sonnet-5', 5_000, { isolateMcp: true });
        await older.execute({ cwd: root, prompt: 'hola', timeoutMs: 1000, traceFile: 'agent-execution.log' });
        assert.equal(noHelp.calls.find(call => call.kind === 'run').args.some(arg => arg.startsWith('--disable-')), false);
        assert.match(fs.readFileSync(path.join(root, 'agent-execution.log'), 'utf8'), /mcpIsolation=no-help/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('sin isolateMcp o con RECORDER_COPILOT_ISOLATE=0 no se sondea la ayuda', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-isolate-off-'));
    try {
        const plain = fakeRunner();
        const adapter = new CopilotCliAdapter(plain.runner, 'copilot', ['-p']);
        await adapter.execute({ cwd: root, prompt: 'hola', timeoutMs: 1000, traceFile: 'agent-execution.log' });
        assert.equal(plain.calls.some(call => call.kind === 'help'), false);
        assert.equal(plain.calls[0].args.some(arg => arg.startsWith('--disable-')), false);
        assert.match(fs.readFileSync(path.join(root, 'agent-execution.log'), 'utf8'), /mcpIsolation=disabled/);

        const byEnv = fakeRunner();
        const isolated = new CopilotCliAdapter(byEnv.runner, 'copilot', ['-p'], 'claude-sonnet-5', 5_000, { isolateMcp: true });
        await withEnv({ RECORDER_COPILOT_ISOLATE: '0' }, async () => {
            await isolated.execute({ cwd: root, prompt: 'hola', timeoutMs: 1000, traceFile: 'agent-execution.log' });
        });
        assert.equal(byEnv.calls.some(call => call.kind === 'help'), false);
        assert.equal(byEnv.calls[0].args.some(arg => arg.startsWith('--disable-')), false);
        assert.match(fs.readFileSync(path.join(root, 'agent-execution.log'), 'utf8'), /mcpIsolation=off-by-env/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('adapter aprende los MCP de plugins del evento del CLI, los recuerda y los desactiva después', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-isolate-learn-'));
    const file = path.join(root, 'config', 'copilot-mcp-servers.json');
    const { runner, calls } = fakeRunner({ events: [MCP_EVENT] });
    const adapter = new CopilotCliAdapter(runner, 'copilot', ['-p'], 'claude-sonnet-5', 5_000, { isolateMcp: true, mcpServersFile: file });
    try {
        await withEnv({ RECORDER_COPILOT_DISABLED_MCP_SERVERS: undefined, RECORDER_COPILOT_ISOLATE: undefined }, async () => {
            await adapter.execute({ cwd: root, prompt: 'primera', timeoutMs: 1000, traceFile: 'agent-execution.log' });
            const first = calls.filter(call => call.kind === 'run')[0];
            assert.ok(first.args.includes('--disable-builtin-mcps'));
            assert.equal(first.args.some(arg => arg.startsWith('--disable-mcp-server=')), false, 'aún no conoce workiq');

            assert.deepEqual(adapter.knownMcpServers(), ['workiq']);
            assert.deepEqual(readRememberedMcpServers(file), ['workiq']);
            const trace = fs.readFileSync(path.join(root, 'agent-execution.log'), 'utf8');
            assert.match(trace, /\[mcp\] github-mcp-server\(builtin,connected\) workiq\(plugin,needs-auth\)/);

            await adapter.execute({ cwd: root, prompt: 'segunda', timeoutMs: 1000 });
            const second = calls.filter(call => call.kind === 'run')[1];
            assert.ok(second.args.includes('--disable-mcp-server=workiq'), second.args.join(' '));
            assert.equal(second.args.includes('--disable-mcp-server=github-mcp-server'), false, 'el builtin ya lo cubre su flag');

            const reopened = new CopilotCliAdapter(fakeRunner().runner, 'copilot', ['-p'], 'claude-sonnet-5', 5_000, { isolateMcp: true, mcpServersFile: file });
            assert.deepEqual(reopened.knownMcpServers(), ['workiq']);
        });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('el adapter no duplica flags que ya vienen en RECORDER_COPILOT_CLI_ARGS', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-isolate-dup-'));
    const { runner, calls } = fakeRunner();
    const adapter = new CopilotCliAdapter(runner, 'copilot', ['-p', '--disable-builtin-mcps'], 'claude-sonnet-5', 5_000, { isolateMcp: true });
    try {
        await withEnv({ RECORDER_COPILOT_ISOLATE: undefined }, async () => {
            await adapter.execute({ cwd: root, prompt: 'hola', timeoutMs: 1000 });
        });
        const run = calls.find(call => call.kind === 'run');
        assert.equal(run.args.filter(arg => arg === '--disable-builtin-mcps').length, 1);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('el script del modo visible sondea --help en zsh y desactiva los MCP recordados', () => {
    if (process.platform !== 'darwin') return;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-isolate-visible-'));
    const file = path.join(root, 'config', 'copilot-mcp-servers.json');
    rememberMcpServers(file, ['workiq', 'raro nombre']);
    try {
        const launcher = new AutomationAgentLauncher(() => ({ unref() {} }), { mcpServersFile: file });
        launcher.openTerminalWithPrompt('copilot', root);
        const script = fs.readdirSync(root).find(name => name.startsWith('.recorder-copilot-') && name.endsWith('.sh'));
        const content = fs.readFileSync(path.join(root, script), 'utf8');
        assert.match(content, /copilot_help="\$\('copilot' --help 2>&1 \|\| true\)"/);
        assert.match(content, /\*--disable-builtin-mcps\*\) isolation="--disable-builtin-mcps"/);
        assert.match(content, /\*--disable-mcp-server\*\) isolation="\$isolation --disable-mcp-server=workiq"/);
        assert.doesNotMatch(content, /raro/);
        assert.match(content, /'--no-custom-instructions' \$\{=isolation\}\n/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
