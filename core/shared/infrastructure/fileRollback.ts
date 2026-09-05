import fs from 'fs';

/** Synchronous, bounded file transaction. Only explicitly named files are restored. */
export function withFileRollback<T>(files: string[], action: () => T): T {
    const backups = [...new Set(files)].map(file => ({ file, before: fs.existsSync(file) ? fs.readFileSync(file) : null }));
    try { return action(); }
    catch (error) {
        const failures: unknown[] = [];
        for (const { file, before } of backups) {
            try {
                if (before === null) { if (fs.existsSync(file)) fs.unlinkSync(file); }
                else fs.writeFileSync(file, before);
            } catch (failure) { failures.push(failure); }
        }
        if (failures.length) throw Object.assign(new Error('La operación falló y no se pudieron restaurar todos los archivos. Conserva los archivos para recuperación.'), { errors: [error, ...failures] });
        throw error;
    }
}
