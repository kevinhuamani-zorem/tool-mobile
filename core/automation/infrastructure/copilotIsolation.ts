import fs from 'fs';
import path from 'path';

/**
 * Aislamiento de las sesiones headless de Copilot frente a la configuracion
 * personal del QA.
 *
 * Cada sesion de Lorem/Zorem arranca con todo lo que el CLI tiene instalado
 * en la maquina: el MCP builtin de GitHub (sus instrucciones entran al
 * system prompt), los MCP de plugins personales (por ejemplo `workiq`, que
 * reintenta autenticarse en cada sesion) y las skills personales. Los agentes
 * del recorder nunca los usan: trabajan con view/edit/create/bash sobre el
 * paquete. Esos servidores cuestan arranque, contexto y ruido en el log, y
 * un plugin que falla puede colgar la sesion antes del primer turno.
 *
 * Los flags oficiales (`--disable-builtin-mcps`, `--disable-mcp-server`) se
 * añaden solo si el `copilot --help` instalado los anuncia, para no romper
 * versiones anteriores del CLI. Las skills personales no tienen flag: la
 * unica via oficial es `COPILOT_HOME` aislado, que tambien mueve la sesion
 * autenticada, asi que no se aplica por defecto.
 */
export const DISABLE_BUILTIN_MCPS_FLAG = '--disable-builtin-mcps';
export const DISABLE_MCP_SERVER_FLAG = '--disable-mcp-server';
export const COPILOT_ISOLATE_ENV = 'RECORDER_COPILOT_ISOLATE';
export const COPILOT_DISABLED_MCP_SERVERS_ENV = 'RECORDER_COPILOT_DISABLED_MCP_SERVERS';
/** Archivo (bajo config/) donde el adapter recuerda los MCP no builtin vistos. */
export const COPILOT_MCP_SERVERS_FILE = 'copilot-mcp-servers.json';

export interface CopilotMcpServer {
    name: string;
    source: string;
    status: string;
}

export interface CopilotIsolationInput {
    /** Salida de `copilot --help`; null cuando no se pudo obtener. */
    help: string | null;
    /** Servidores MCP no builtin conocidos (env + aprendidos). */
    servers?: Iterable<string>;
    env?: NodeJS.ProcessEnv;
}

export function copilotIsolationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    const raw = String(env[COPILOT_ISOLATE_ENV] ?? '').trim().toLowerCase();
    return !['0', 'false', 'off', 'no'].includes(raw);
}

export function configuredDisabledMcpServers(env: NodeJS.ProcessEnv = process.env): string[] {
    return normalizeServerNames(String(env[COPILOT_DISABLED_MCP_SERVERS_ENV] ?? '').split(','));
}

/** Nombres validos de servidor MCP: sin espacios ni `=`, unicos y ordenados. */
export function normalizeServerNames(names: Iterable<string>): string[] {
    const output = new Set<string>();
    for (const raw of names) {
        const name = String(raw ?? '').trim();
        if (!name || /[\s=]/.test(name)) continue;
        output.add(name);
    }
    return [...output].sort();
}

/** El flag aparece como opcion en el texto de ayuda (`--flag`, `--flag=VALOR`). */
export function copilotHelpSupports(help: string | null, flag: string): boolean {
    if (!help) return false;
    const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[\\s,\\[])${escaped}(?=$|[\\s=,\\]])`, 'm').test(help);
}

/**
 * Flags de aislamiento para una sesion: nunca inventa flags que la ayuda no
 * anuncie y no toca nada con RECORDER_COPILOT_ISOLATE=0.
 */
export function copilotIsolationArgs(input: CopilotIsolationInput): string[] {
    const env = input.env ?? process.env;
    if (!copilotIsolationEnabled(env)) return [];
    const args: string[] = [];
    if (copilotHelpSupports(input.help, DISABLE_BUILTIN_MCPS_FLAG)) args.push(DISABLE_BUILTIN_MCPS_FLAG);
    if (copilotHelpSupports(input.help, DISABLE_MCP_SERVER_FLAG)) {
        const servers = normalizeServerNames([
            ...configuredDisabledMcpServers(env),
            ...(input.servers ?? []),
        ]);
        for (const server of servers) args.push(`${DISABLE_MCP_SERVER_FLAG}=${server}`);
    }
    return args;
}

/** Resumen legible para la traza de arranque. */
export function describeCopilotIsolation(args: string[]): string {
    if (args.length === 0) return 'off';
    const parts: string[] = [];
    if (args.includes(DISABLE_BUILTIN_MCPS_FLAG)) parts.push('builtin-mcps');
    const servers = args
        .filter(arg => arg.startsWith(`${DISABLE_MCP_SERVER_FLAG}=`))
        .map(arg => arg.slice(DISABLE_MCP_SERVER_FLAG.length + 1));
    if (servers.length) parts.push(`mcp[${servers.join(',')}]`);
    return parts.join('+') || 'off';
}

/** Servidores anunciados por un evento `session.mcp_servers_loaded` del CLI. */
export function mcpServersFromCopilotEvent(event: unknown): CopilotMcpServer[] {
    if (!event || typeof event !== 'object') return [];
    const payload = event as { type?: unknown; data?: { servers?: unknown } };
    if (payload.type !== 'session.mcp_servers_loaded') return [];
    const servers = Array.isArray(payload.data?.servers) ? payload.data.servers : [];
    const output: CopilotMcpServer[] = [];
    for (const entry of servers) {
        if (!entry || typeof entry !== 'object') continue;
        const server = entry as Record<string, unknown>;
        const name = typeof server.name === 'string' ? server.name.trim() : '';
        if (!name) continue;
        output.push({
            name,
            source: typeof server.source === 'string' ? server.source : 'unknown',
            status: typeof server.status === 'string' ? server.status : 'unknown',
        });
    }
    return output;
}

/** Los MCP que `--disable-builtin-mcps` no cubre: plugins y configuracion personal. */
export function nonBuiltinMcpServers(servers: CopilotMcpServer[]): string[] {
    return normalizeServerNames(servers.filter(server => server.source !== 'builtin').map(server => server.name));
}

interface RememberedServersDocument {
    schemaVersion: 1;
    servers: string[];
}

export function readRememberedMcpServers(file: string | undefined): string[] {
    if (!file || !fs.existsSync(file)) return [];
    try {
        const document = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<RememberedServersDocument>;
        if (document?.schemaVersion !== 1 || !Array.isArray(document.servers)) return [];
        return normalizeServerNames(document.servers.filter((value): value is string => typeof value === 'string'));
    } catch {
        return [];
    }
}

/** Devuelve la union persistida; no escribe si no hay nada nuevo. */
export function rememberMcpServers(file: string | undefined, servers: Iterable<string>): string[] {
    const known = readRememberedMcpServers(file);
    const merged = normalizeServerNames([...known, ...servers]);
    if (!file || merged.length === known.length) return merged;
    const document: RememberedServersDocument = { schemaVersion: 1, servers: merged };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, 'utf-8');
    return merged;
}
