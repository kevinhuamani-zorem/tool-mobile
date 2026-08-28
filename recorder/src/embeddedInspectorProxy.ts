import http, { ClientRequest, IncomingMessage, Server, ServerResponse } from 'http';

const INSPECTOR_ORIGIN = 'appium-recorder://inspector';
const ALLOWED_METHODS = 'GET, POST, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'content-type, accept';

export function isAllowedInspectorProxyRequest(
    origin: string | undefined,
    pathname: string,
    sessionId: string,
): boolean {
    const sessionPrefix = `/session/${encodeURIComponent(sessionId)}`;
    return origin === INSPECTOR_ORIGIN && (
        pathname === sessionPrefix || pathname.startsWith(`${sessionPrefix}/`)
    );
}

function reject(response: ServerResponse, status: number, message: string): void {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ value: { error: 'invalid argument', message } }));
}

export class EmbeddedInspectorProxy {
    private server: Server | null = null;
    private stopInProgress: Promise<void> | null = null;
    private readonly activeRequests = new Set<ClientRequest>();

    async start(upstreamUrl: string, sessionId: string): Promise<string> {
        if (this.stopInProgress) await this.stopInProgress;
        if (this.server) throw new Error('El proxy del Inspector ya está iniciado');
        const upstream = new URL(upstreamUrl);
        if (upstream.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(upstream.hostname)) {
            throw new Error('El Inspector embebido solo admite el servidor Appium local');
        }

        this.server = http.createServer((request, response) => {
            this.handle(request, response, upstream, sessionId);
        });
        await new Promise<void>((resolve, rejectStart) => {
            this.server?.once('error', rejectStart);
            this.server?.listen(0, '127.0.0.1', () => resolve());
        });
        const address = this.server.address();
        if (!address || typeof address === 'string') {
            await this.stop();
            throw new Error('No se pudo obtener el puerto del proxy del Inspector');
        }
        return `http://127.0.0.1:${address.port}`;
    }

    async stop(): Promise<void> {
        if (this.stopInProgress) return this.stopInProgress;
        const current = this.server;
        this.server = null;
        if (!current) return;
        const stopping = new Promise<void>((resolve, rejectClose) => {
            current.close(error => error ? rejectClose(error) : resolve());
        });
        for (const request of this.activeRequests) {
            request.destroy(new Error('El proxy del Inspector se está cerrando'));
        }
        this.activeRequests.clear();
        current.closeAllConnections();
        const tracked = stopping.finally(() => {
            if (this.stopInProgress === tracked) this.stopInProgress = null;
        });
        this.stopInProgress = tracked;
        return tracked;
    }

    private handle(
        request: IncomingMessage,
        response: ServerResponse,
        upstream: URL,
        sessionId: string,
    ): void {
        const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
        const origin = request.headers.origin;
        if (!isAllowedInspectorProxyRequest(origin, requestUrl.pathname, sessionId)) {
            reject(response, 403, 'Origen o ruta no autorizados para el Inspector');
            return;
        }
        if (request.method === 'OPTIONS') {
            response.writeHead(204, {
                'access-control-allow-origin': INSPECTOR_ORIGIN,
                'access-control-allow-methods': ALLOWED_METHODS,
                'access-control-allow-headers': ALLOWED_HEADERS,
                vary: 'Origin',
            });
            response.end();
            return;
        }
        if (!request.method || !['GET', 'POST', 'DELETE'].includes(request.method)) {
            reject(response, 405, 'Método no autorizado para el Inspector');
            return;
        }

        const upstreamPath = `${upstream.pathname.replace(/\/$/, '')}${requestUrl.pathname}${requestUrl.search}`;
        const proxyRequest = http.request({
            protocol: upstream.protocol,
            hostname: upstream.hostname,
            port: upstream.port || 80,
            method: request.method,
            path: upstreamPath,
            headers: {
                accept: request.headers.accept || 'application/json',
                'content-type': request.headers['content-type'] || 'application/json',
            },
        }, proxyResponse => {
            response.writeHead(proxyResponse.statusCode || 502, {
                'content-type': proxyResponse.headers['content-type'] || 'application/json',
                'access-control-allow-origin': INSPECTOR_ORIGIN,
                vary: 'Origin',
            });
            proxyResponse.pipe(response);
        });
        this.activeRequests.add(proxyRequest);
        proxyRequest.once('close', () => this.activeRequests.delete(proxyRequest));
        proxyRequest.on('error', error => {
            if (!response.headersSent) reject(response, 502, error.message);
            else response.destroy(error);
        });
        request.pipe(proxyRequest);
    }
}
