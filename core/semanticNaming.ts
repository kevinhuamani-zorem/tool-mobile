import path from 'path';

export interface ScreenObjectNames {
    moduleName: string;
    className: string;
    instanceName: string;
}

const genericAliases = new Set([
    'generatedScreen', 'screen', 'page', 'screenObject', 'obj',
]);

function pascalCase(value: string): string {
    return value
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map(segment => segment[0].toUpperCase() + segment.slice(1))
        .join('');
}

export function screenObjectNames(moduleOrPath: string): ScreenObjectNames {
    const normalized = String(moduleOrPath || '').replace(/\\/g, '/');
    const moduleName = path.posix.basename(normalized)
        .replace(/\.screen\.(?:ts|js)$/i, '')
        .replace(/\.screen$/i, '');
    const baseName = pascalCase(moduleName);
    if (!baseName) throw new Error(`No se pudo derivar un nombre semántico de ${moduleOrPath}`);
    const className = `${baseName}Screen`;
    return {
        moduleName,
        className,
        instanceName: `${className[0].toLowerCase()}${className.slice(1)}`,
    };
}

export function isGenericScreenAlias(alias: string): boolean {
    return genericAliases.has(alias);
}
