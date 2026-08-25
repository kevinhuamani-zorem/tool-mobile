/**
 * [visual-recorder] Descubrimiento de simuladores iOS.
 *
 * El parseo vive separado del `exec` para poder probarlo sin macOS: el contenedor
 * donde se desarrolla no tiene `xcrun`, asi que la unica forma de cubrir esto con
 * tests es tratar la salida de `simctl` como dato.
 */

export interface SimulatorDevice {
    udid: string;
    name: string;
    /** Version del runtime: `18.2`. */
    version: string;
    /** `Booted` | `Shutdown`. Appium puede arrancar uno apagado. */
    state: string;
    booted: boolean;
}

/**
 * `com.apple.CoreSimulator.SimRuntime.iOS-18-2` -> `18.2`.
 * Devuelve '' para runtimes que no son iOS (watchOS, tvOS): se descartan.
 */
export function runtimeVersion(identifier: string): string {
    const match = /SimRuntime\.iOS-(\d+)(?:-(\d+))?(?:-(\d+))?$/.exec(identifier);
    if (!match) return '';
    return [match[1], match[2], match[3]].filter(Boolean).join('.');
}

/**
 * Parsea `xcrun simctl list devices available --json`.
 *
 * Tolera claves ausentes y runtimes desconocidos: una salida rara no puede
 * tumbar la pantalla de conexion, como mucho deja la lista vacia.
 */
export function parseSimulators(raw: string): SimulatorDevice[] {
    let document: { devices?: Record<string, unknown[]> };
    try {
        document = JSON.parse(raw);
    } catch {
        return [];
    }
    const devices: SimulatorDevice[] = [];
    for (const [runtime, entries] of Object.entries(document.devices || {})) {
        const version = runtimeVersion(runtime);
        if (!version || !Array.isArray(entries)) continue;
        for (const entry of entries) {
            const item = entry as Record<string, unknown>;
            const udid = typeof item.udid === 'string' ? item.udid : '';
            if (!udid) continue;
            // `available` ya filtra por la bandera, pero no todas las versiones
            // de Xcode la respetan al pie de la letra.
            if (item.isAvailable === false) continue;
            const state = typeof item.state === 'string' ? item.state : 'Shutdown';
            devices.push({
                udid,
                name: typeof item.name === 'string' ? item.name : udid,
                version,
                state,
                booted: state === 'Booted',
            });
        }
    }
    // Los arrancados primero: es el que el QA suele querer.
    return devices.sort((left, right) =>
        Number(right.booted) - Number(left.booted) ||
        right.version.localeCompare(left.version, undefined, { numeric: true }) ||
        left.name.localeCompare(right.name)
    );
}
