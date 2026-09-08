import path from 'path';
import type { LayeredGenerationResult } from '../../../../core/automation';

/** A review payload, without an application token. F3 adds draft export. */
export function layeredDraftPreview(draft: NonNullable<LayeredGenerationResult['draft']>, frameworkRoot: string) {
    const preview: Record<string, any> = { files: [], provenance: {} };
    const names = { feature: 'feature', steps: 'step', screen: 'screen', locators: 'locator' };
    for (const file of draft.files) {
        const absolute = path.join(frameworkRoot, file.path);
        const prefix = names[file.layer];
        preview[`${prefix}Path`] = absolute;
        preview[`${prefix}Content`] = file.content;
        preview.files.push(absolute);
        preview.provenance[absolute] = { origin: file.origin, pass: file.pass };
    }
    return {
        preview, missingLayers: draft.missingLayers,
        validation: { valid: false, warnings: [], errors: draft.diagnostics.map(message => ({ code: 'generation-incomplete', message })) },
    };
}
