import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { GeneratedPreview } from './fwkMobileGenerator';
import { projectPaths } from './projectPaths';
import { PlannedFile } from './automationContracts';

interface RegistryEntry {
    contentHash: string;
    generatedAt: string;
    squad: string;
}

interface PatchLedgerEntry {
    recordingId: string;
    symbols: string[];
    patchedAt: string;
    squad: string;
}

interface RegistryDocument {
    version: 1;
    files: Record<string, RegistryEntry>;
    /**
     * Archivos ajenos que el recorder solo amplió. No llevan `contentHash`
     * a propósito: registrar uno los convertiría en administrados y cualquier
     * edición humana posterior bloquearía el siguiente patch con un conflicto
     * falso. Aquí solo queda la traza de qué símbolos aportó cada recording.
     */
    patches?: Record<string, PatchLedgerEntry[]>;
}

export interface ManagedFileAssessment {
    writable: Set<string>;
    conflicts: string[];
}

export class GeneratedFileRegistry {
    private readonly manifestPath = path.join(projectPaths.toolConfig, 'generated-files.json');

    assess(
        preview: GeneratedPreview,
        squad: string,
        plannedFiles: PlannedFile[] = []
    ): ManagedFileAssessment {
        const manifest = this.read();
        const removedEntries = Object.keys(manifest.files).filter(relative =>
            !fs.existsSync(path.resolve(projectPaths.frameworkRoot, relative))
        );
        for (const relative of removedEntries) delete manifest.files[relative];
        if (removedEntries.length > 0) this.write(manifest);
        const writable = new Set<string>();
        const conflicts: string[] = [];
        for (const file of preview.files) {
            if (!fs.existsSync(file)) continue;
            const relative = this.relative(file);
            const entry = manifest.files[relative];
            const plannedUpdate = plannedFiles.find(planned =>
                planned.operation === 'update' && planned.path === relative
            );
            if (plannedUpdate?.baseHash) {
                const currentHash = this.hash(fs.readFileSync(file));
                if (currentHash !== plannedUpdate.baseHash) {
                    conflicts.push(`${relative} (cambió después de preparar el plan)`);
                    continue;
                }
                writable.add(file);
                continue;
            }
            if (!entry || entry.squad !== squad) {
                conflicts.push(relative);
                continue;
            }
            const currentHash = this.hash(fs.readFileSync(file));
            if (currentHash !== entry.contentHash) {
                conflicts.push(`${relative} (modificado fuera del recorder)`);
                continue;
            }
            writable.add(file);
        }
        return { writable, conflicts };
    }

    /**
     * Reclama como administrados únicamente los archivos que el recorder creó.
     * Un `update` sobre un archivo ajeno se amplió con un patch aditivo: no se
     * adopta, se anota en el ledger. Sin `plannedFiles` se conserva el
     * comportamiento anterior para los flujos que generan las cuatro capas.
     */
    register(preview: GeneratedPreview, squad: string, plannedFiles: PlannedFile[] = []): RegistryDocument {
        const manifest = this.read();
        const updated = new Set(plannedFiles
            .filter(planned => planned.operation === 'update')
            .map(planned => planned.path));
        for (const output of this.outputs(preview)) {
            const relative = this.relative(output.file);
            if (updated.has(relative) && !manifest.files[relative]) continue;
            manifest.files[relative] = {
                contentHash: this.hash(Buffer.from(output.content, 'utf-8')),
                generatedAt: new Date().toISOString(),
                squad
            };
        }
        this.write(manifest);
        return manifest;
    }

    /** Traza de una ampliación aditiva sobre un archivo que el recorder no administra. */
    registerPatch(
        file: string,
        squad: string,
        recordingId: string,
        symbols: string[]
    ): RegistryDocument {
        const manifest = this.read();
        const relative = this.relative(file);
        const patches = manifest.patches || (manifest.patches = {});
        const entries = patches[relative] || (patches[relative] = []);
        entries.push({ recordingId, symbols, patchedAt: new Date().toISOString(), squad });
        this.write(manifest);
        return manifest;
    }

    listPatches(file: string): PatchLedgerEntry[] {
        return this.read().patches?.[this.relative(file)] || [];
    }

    registerUpdatedFile(file: string, squad: string): RegistryDocument {
        if (!fs.existsSync(file)) throw new Error(`No existe el archivo generado: ${file}`);
        const manifest = this.read();
        const relative = this.relative(file);
        const current = manifest.files[relative];
        // No convierte archivos del framework creados manualmente en archivos
        // administrados; solo mantiene vigente un registro que ya existía.
        if (!current || current.squad !== squad) return manifest;
        manifest.files[relative] = {
            contentHash: this.hash(fs.readFileSync(file)),
            generatedAt: new Date().toISOString(),
            squad
        };
        this.write(manifest);
        return manifest;
    }

    private outputs(preview: GeneratedPreview): { file: string; content: string }[] {
        return [
            { file: preview.featurePath, content: preview.featureContent },
            ...(preview.locatorPath && preview.locatorContent
                ? [{ file: preview.locatorPath, content: preview.locatorContent }]
                : []),
            ...(preview.stepPath && preview.stepContent
                ? [{ file: preview.stepPath, content: preview.stepContent }]
                : []),
            ...(preview.screenPath && preview.screenContent
                ? [{ file: preview.screenPath, content: preview.screenContent }]
                : [])
        ];
    }

    private read(): RegistryDocument {
        if (!fs.existsSync(this.manifestPath)) return { version: 1, files: {} };
        try {
            const parsed = JSON.parse(fs.readFileSync(this.manifestPath, 'utf-8'));
            return parsed?.version === 1 && parsed.files
                ? { patches: {}, ...parsed } as RegistryDocument
                : { version: 1, files: {}, patches: {} };
        } catch {
            return { version: 1, files: {} };
        }
    }

    private write(manifest: RegistryDocument): void {
        fs.mkdirSync(path.dirname(this.manifestPath), { recursive: true });
        const temporary = `${this.manifestPath}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
        fs.renameSync(temporary, this.manifestPath);
    }

    private relative(file: string): string {
        const relative = path.relative(projectPaths.frameworkRoot, file).replace(/\\/g, '/');
        if (relative.startsWith('../') || path.isAbsolute(relative)) {
            throw new Error(`Archivo fuera del framework: ${file}`);
        }
        return relative;
    }

    private hash(content: Buffer): string {
        return crypto.createHash('sha256').update(content).digest('hex');
    }
}
