import path from 'path';

/** CLI approvals are not an OS sandbox: interpreters can execute arbitrary code. */
export function copilotPermissionArgs(packageDirectory: string, allowValidationScripts = true): string[] {
    return [
        '--add-dir', path.resolve(packageDirectory),
        '--allow-tool=read',
        '--allow-tool=write',
        ...(allowValidationScripts
            ? ['--allow-tool=shell(node)', '--allow-tool=shell(python)', '--allow-tool=shell(python3)']
            : ['--deny-tool=shell']),
        '--no-custom-instructions',
    ];
}
