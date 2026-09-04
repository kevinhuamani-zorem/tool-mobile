import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import http from 'http';
import net from 'net';
import path from 'path';
import { projectPaths } from '../../workspace';
import { resolveAndroidTooling } from './androidTooling';

interface DriverPackage {
    name: string;
    version: string;
    appium: {
        driverName: string;
        automationName: string;
        platformNames: string[];
        mainClass: string;
        [key: string]: unknown;
    };
    peerDependencies?: { appium?: string };
}

function readJson<T>(file: string): T {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export function buildBundledDriverManifest(toolRoot = projectPaths.toolRoot): Record<string, unknown> {
    const drivers: Record<string, unknown> = {};
    for (const packageName of ['appium-uiautomator2-driver', 'appium-xcuitest-driver']) {
        const installPath = path.join(toolRoot, 'node_modules', packageName);
        const pkg = readJson<DriverPackage>(path.join(installPath, 'package.json'));
        drivers[pkg.appium.driverName] = {
            ...pkg.appium,
            pkgName: pkg.name,
            version: pkg.version,
            appiumVersion: pkg.peerDependencies?.appium || '^3.0.0',
            installType: 'npm',
            installSpec: `${pkg.name}@${pkg.version}`,
            installPath,
        };
    }
    return { drivers, plugins: {}, schemaRev: 4 };
}

function statusReady(port: number): Promise<boolean> {
    return new Promise(resolve => {
        const request = http.get(`http://127.0.0.1:${port}/status`, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => resolve(response.statusCode === 200 && body.includes('ready')));
        });
        request.setTimeout(800, () => request.destroy());
        request.on('error', () => resolve(false));
    });
}

function availablePort(start: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        const probe = net.createServer();
        probe.unref();
        probe.once('error', reject);
        probe.listen({ host: '127.0.0.1', port: start }, () => {
            const address = probe.address();
            const port = typeof address === 'object' && address ? address.port : start;
            probe.close(error => error ? reject(error) : resolve(port));
        });
    }).catch(error => {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EADDRINUSE') return availablePort(start + 1);
        throw error;
    });
}

export class EmbeddedAppiumServer {
    private process: ChildProcess | null = null;
    private owned = false;
    private port = 4723;

    private prepareManifest(appiumHome: string): void {
        const manifest = path.join(appiumHome, 'node_modules', '.cache', 'appium', 'extensions.yaml');
        fs.mkdirSync(path.dirname(manifest), { recursive: true });
        // JSON es un subconjunto válido de YAML y evita sumar un parser al runtime.
        fs.writeFileSync(manifest, JSON.stringify(buildBundledDriverManifest(), null, 2), 'utf8');
    }

    async start(): Promise<number> {
        if (await statusReady(this.port)) {
            // Un Appium dejado por una versión anterior puede conservar un
            // extensions.yaml que apunte a un .app ya eliminado. No es posible
            // recargar drivers en caliente: levantamos el runtime aislado del
            // recorder en el siguiente puerto libre.
            const occupiedPort = this.port;
            this.port = await availablePort(occupiedPort + 1);
            console.log(
                `[Appium] Puerto ${occupiedPort} ocupado; usando runtime aislado en ${this.port}`,
            );
        } else {
            this.port = await availablePort(this.port);
        }

        const appiumEntry = path.join(projectPaths.toolRoot, 'node_modules', 'appium', 'index.js');
        if (!fs.existsSync(appiumEntry)) {
            throw new Error('El runtime empaquetado no contiene Appium. Reinstala la aplicación.');
        }
        const appiumHome = path.join(projectPaths.runtimeRoot, 'appium-home');
        const androidTooling = resolveAndroidTooling();
        this.prepareManifest(appiumHome);
        this.process = spawn(process.execPath, [
            appiumEntry,
            '--address', '127.0.0.1',
            '--port', String(this.port),
            '--log-level', 'error',
            '--relaxed-security',
        ], {
            cwd: projectPaths.toolRoot,
            env: {
                ...androidTooling.environment,
                APPIUM_HOME: appiumHome,
                ELECTRON_RUN_AS_NODE: '1',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        this.owned = true;
        this.process.stdout?.on('data', chunk => console.log(`[Appium] ${String(chunk).trimEnd()}`));
        this.process.stderr?.on('data', chunk => console.error(`[Appium] ${String(chunk).trimEnd()}`));

        for (let attempt = 0; attempt < 30; attempt += 1) {
            if (await statusReady(this.port)) {
                console.log(`[Appium] Servidor integrado listo en ${this.port}`);
                return this.port;
            }
            if (this.process.exitCode !== null) break;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        await this.stop();
        throw new Error('No se pudo iniciar el servidor Appium integrado.');
    }

    /**
     * Puerto del servidor vivo; si el proceso murio o nunca arranco, lo
     * relanza. Es lo que llama cada inicio de sesion: cerrar una sesion no
     * apaga el servidor, pero un Appium caido no puede obligar a reiniciar
     * la app.
     */
    async ensureRunning(): Promise<number> {
        const alive = this.process !== null && this.process.exitCode === null;
        if (alive && await statusReady(this.port)) return this.port;
        if (!alive && await statusReady(this.port) && !this.owned) return this.port;
        await this.stop();
        return this.start();
    }

    async stop(): Promise<void> {
        const child = this.process;
        this.process = null;
        if (!child || !this.owned || child.exitCode !== null) return;
        this.owned = false;
        child.kill('SIGTERM');
        await new Promise<void>(resolve => {
            const timeout = setTimeout(() => {
                if (child.exitCode === null) child.kill('SIGKILL');
                resolve();
            }, 3000);
            child.once('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }
}
