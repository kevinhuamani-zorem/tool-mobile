import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { GeneratedPreview } from './fwkMobileGenerator';
import { projectPaths } from './projectPaths';

interface RegistryEntry {
    contentHash: string;
    generatedAt: string;
    squad: string;
}

interface RegistryDocument {
    version: 1;
    files: Record<string, RegistryEntry>;
}

export interface ManagedFileAssessment {
    writable: Set<string>;
    conflicts: string[];
}

export class GeneratedFileRegistry {
    private readonly manifestPath = path.join(projectPaths.toolConfig, 'generated-files.json');

    assess(preview: GeneratedPreview, squad: string): ManagedFileAssessment {
        const manifest = this.read();
        const writable = new Set<string>();
        const conflicts: string[] = [];
        for (const file of preview.files) {
            if (!fs.existsSync(file)) continue;
            const relative = this.relative(file);
            const entry = manifest.files[relative];
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

    register(preview: GeneratedPreview, squad: string): RegistryDocument {
        const manifest = this.read();
        for (const output of this.outputs(preview)) {
            manifest.files[this.relative(output.file)] = {
                contentHash: this.hash(Buffer.from(output.content, 'utf-8')),
                generatedAt: new Date().toISOString(),
                squad
            };
        }
        fs.mkdirSync(path.dirname(this.manifestPath), { recursive: true });
        const temporary = `${this.manifestPath}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
        fs.renameSync(temporary, this.manifestPath);
        return manifest;
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
        fs.mkdirSync(path.dirname(this.manifestPath), { recursive: true });
        const temporary = `${this.manifestPath}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
        fs.renameSync(temporary, this.manifestPath);
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
                ? parsed as RegistryDocument
                : { version: 1, files: {} };
        } catch {
            return { version: 1, files: {} };
        }
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
