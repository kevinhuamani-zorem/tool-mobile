import fs from 'fs';
import path from 'path';

export interface AndroidTooling {
    adb: string;
    environment: NodeJS.ProcessEnv;
    sdkRoot?: string;
}

function unique(values: Array<string | undefined>): string[] {
    return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

/**
 * Finder no abre los `.app` con el PATH de zsh. Resolvemos ADB desde las
 * variables oficiales, los SDK habituales de macOS y Homebrew antes de caer
 * al nombre disponible en PATH.
 */
export function resolveAndroidTooling(
    environment: NodeJS.ProcessEnv = process.env,
    exists: (candidate: string) => boolean = fs.existsSync,
): AndroidTooling {
    const userHome = environment.HOME;
    const declaredSdk = environment.ANDROID_SDK_ROOT || environment.ANDROID_HOME;
    const defaultSdk = userHome ? path.join(userHome, 'Library', 'Android', 'sdk') : undefined;
    const linuxSdk = userHome ? path.join(userHome, 'Android', 'Sdk') : undefined;
    const sdkRoot = unique([declaredSdk, defaultSdk, linuxSdk]).find(exists);
    const explicitAdb = environment.ADB_PATH?.trim();
    const adbCandidates = unique([
        explicitAdb,
        declaredSdk && path.join(declaredSdk, 'platform-tools', 'adb'),
        defaultSdk && path.join(defaultSdk, 'platform-tools', 'adb'),
        linuxSdk && path.join(linuxSdk, 'platform-tools', 'adb'),
        '/opt/homebrew/bin/adb',
        '/usr/local/bin/adb',
    ]);
    const adb = adbCandidates.find(exists) || 'adb';
    const adbDirectory = adb === 'adb' ? undefined : path.dirname(adb);
    const currentPath = String(environment.PATH || '').split(path.delimiter).filter(Boolean);
    const searchPath = unique([
        adbDirectory,
        sdkRoot && path.join(sdkRoot, 'platform-tools'),
        '/opt/homebrew/bin',
        '/usr/local/bin',
        ...currentPath,
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin',
    ]).join(path.delimiter);

    return {
        adb,
        sdkRoot,
        environment: {
            ...environment,
            PATH: searchPath,
            ...(sdkRoot ? {
                ANDROID_HOME: environment.ANDROID_HOME || sdkRoot,
                ANDROID_SDK_ROOT: environment.ANDROID_SDK_ROOT || sdkRoot,
            } : {}),
        },
    };
}

export function applyAndroidToolEnvironment(): AndroidTooling {
    const tooling = resolveAndroidTooling();
    Object.assign(process.env, tooling.environment);
    console.log(`[AndroidTooling] ADB: ${tooling.adb}`);
    if (tooling.sdkRoot) console.log(`[AndroidTooling] SDK: ${tooling.sdkRoot}`);
    return tooling;
}
