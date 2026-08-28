import { BrowserWindow, BrowserWindowConstructorOptions, net, protocol } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { projectPaths } from '../../core/projectPaths';

export const EMBEDDED_INSPECTOR_COMMIT = '4cbf81677b8a9c514f8ebbff896348ad07409086';
export const EMBEDDED_INSPECTOR_SCHEME = 'appium-recorder';
export const EMBEDDED_INSPECTOR_HOST_ORIGIN = `${EMBEDDED_INSPECTOR_SCHEME}://host`;
export const EMBEDDED_INSPECTOR_ORIGIN = `${EMBEDDED_INSPECTOR_SCHEME}://inspector`;
export const EMBEDDED_INSPECTOR_URL = `${EMBEDDED_INSPECTOR_HOST_ORIGIN}/index.html`;

export function embeddedInspectorAssetsPath(): string {
    return path.join(
        projectPaths.toolRoot,
        'node_modules',
        '.cache',
        'appium-inspector',
        EMBEDDED_INSPECTOR_COMMIT,
        'dist-browser',
    );
}

export function embeddedInspectorAssetsAvailable(assetsPath = embeddedInspectorAssetsPath()): boolean {
    const cacheRoot = path.dirname(assetsPath);
    const manifestPath = path.join(cacheRoot, 'manifest.json');
    if (!fs.existsSync(path.join(assetsPath, 'embedded.html')) || !fs.existsSync(manifestPath)) return false;
    try {
        const manifest: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (
            typeof manifest !== 'object' ||
            manifest === null ||
            Array.isArray(manifest) ||
            !('commit' in manifest) ||
            !('hostOrigin' in manifest) ||
            !('files' in manifest) ||
            manifest.commit !== EMBEDDED_INSPECTOR_COMMIT ||
            manifest.hostOrigin !== EMBEDDED_INSPECTOR_HOST_ORIGIN ||
            typeof manifest.files !== 'object' ||
            manifest.files === null ||
            Array.isArray(manifest.files)
        ) {
            return false;
        }
        const expectedFiles = manifest.files as Record<string, unknown>;
        const actualFiles: Record<string, string> = {};
        const visit = (directory: string): boolean => {
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                const absolute = path.join(directory, entry.name);
                if (entry.isDirectory()) {
                    if (!visit(absolute)) return false;
                    continue;
                }
                if (!entry.isFile()) return false;
                const relative = path.relative(assetsPath, absolute).split(path.sep).join('/');
                actualFiles[relative] = crypto
                    .createHash('sha256')
                    .update(fs.readFileSync(absolute))
                    .digest('hex');
            }
            return true;
        };
        if (!visit(assetsPath)) return false;
        const names = Object.keys(actualFiles).sort();
        if (names.length !== Object.keys(expectedFiles).length) return false;
        return names.every(name => (
            typeof expectedFiles[name] === 'string' &&
            expectedFiles[name] === actualFiles[name]
        ));
    } catch {
        return false;
    }
}

export type InspectorMode = 'legacy' | 'embedded';

export interface InspectorModeResolution {
    mode: InspectorMode;
    warning?: string;
}

export function resolveInspectorMode(
    configuredMode: string | undefined,
    assetsAvailable: boolean,
): InspectorModeResolution {
    const value = configuredMode?.trim().toLowerCase();
    if (value && value !== 'legacy' && value !== 'embedded') {
        throw new Error("RECORDER_INSPECTOR debe ser 'legacy' o 'embedded'");
    }
    if (value === 'legacy') return { mode: 'legacy' };
    if (!assetsAvailable) {
        const warning = 'Assets del Inspector embebido ausentes. Ejecuta npm run inspector:build.';
        if (value === 'embedded') throw new Error(warning);
        return { mode: 'legacy', warning };
    }
    return { mode: 'embedded' };
}

export function embeddedInspectorWindowOptions(preload: string): BrowserWindowConstructorOptions {
    return {
        width: 1280,
        height: 900,
        minWidth: 900,
        minHeight: 650,
        title: 'Appium Inspector',
        backgroundColor: '#10131a',
        webPreferences: {
            preload,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
        },
    };
}

export function isAllowedInspectorNavigation(url: string): boolean {
    return url === EMBEDDED_INSPECTOR_URL || url.startsWith(`${EMBEDDED_INSPECTOR_ORIGIN}/`);
}

export function registerEmbeddedInspectorScheme(): void {
    protocol.registerSchemesAsPrivileged([{
        scheme: EMBEDDED_INSPECTOR_SCHEME,
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
        },
    }]);
}

export function embeddedInspectorHostDocument(): string {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${EMBEDDED_INSPECTOR_ORIGIN}; style-src 'unsafe-inline'">
  <title>Appium Inspector</title>
  <style>html,body,iframe{border:0;height:100%;margin:0;padding:0;width:100%;overflow:hidden;background:#10131a}</style>
</head>
<body>
  <iframe id="embedded-inspector" sandbox="allow-scripts allow-same-origin allow-downloads"
    allow="clipboard-write"
    src="${EMBEDDED_INSPECTOR_ORIGIN}/embedded.html"></iframe>
</body>
</html>`;
}

export async function registerEmbeddedInspectorProtocol(
    assetsPath = embeddedInspectorAssetsPath(),
): Promise<void> {
    await protocol.handle(EMBEDDED_INSPECTOR_SCHEME, async request => {
        const url = new URL(request.url);
        if (url.host === 'host' && url.pathname === '/index.html') {
            return new Response(embeddedInspectorHostDocument(), {
                headers: { 'content-type': 'text/html; charset=utf-8' },
            });
        }
        if (url.host !== 'inspector') return new Response('Not found', { status: 404 });

        const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        const resolved = path.resolve(assetsPath, relative);
        const root = path.resolve(assetsPath);
        if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
            return new Response('Forbidden', { status: 403 });
        }
        if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()) {
            return new Response('Not found', { status: 404 });
        }
        return net.fetch(pathToFileURL(resolved).toString());
    });
}

export function createEmbeddedInspectorWindow(): BrowserWindow {
    const window = new BrowserWindow(embeddedInspectorWindowOptions(
        path.join(__dirname, 'embeddedInspectorPreload.js'),
    ));
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
        if (!isAllowedInspectorNavigation(url)) event.preventDefault();
    });
    window.loadURL(EMBEDDED_INSPECTOR_URL);
    return window;
}

type FocusableInspectorWindow = Pick<
    BrowserWindow,
    'focus' | 'isDestroyed' | 'isMinimized' | 'restore' | 'show'
>;

type RecorderWindow = Pick<BrowserWindow, 'focus' | 'show'>;

export function focusEmbeddedInspectorWindow(
    window: FocusableInspectorWindow | null,
): boolean {
    if (!window || window.isDestroyed()) return false;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return true;
}

export function returnToRecorderAfterElementUse(
    inspectorWindow: Pick<BrowserWindow, 'hide' | 'isDestroyed'> | null,
    recorderWindow: RecorderWindow | null,
): void {
    if (inspectorWindow && !inspectorWindow.isDestroyed()) inspectorWindow.hide();
    recorderWindow?.show();
    recorderWindow?.focus();
}
