import type {
    AgentGeneratedFile,
    AutomationAgentResponse,
} from '../../automation/contracts';

export const GENERATED_FILE_AUTHOR = 'Kevinarnold.zorem';
export const GENERATED_FILE_GENERATOR = 'Appium Visual Recorder';

function validCreatedAt(value: string): string {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? new Date().toISOString() : new Date(timestamp).toISOString();
}

function stripCommentMetadata(content: string, marker: '#' | '//'): string {
    const escaped = marker === '#' ? '#' : '\\/\\/';
    const metadata = new RegExp(
        `^(?:${escaped} (?:Generado por Appium Visual Recorder|Author: [^\\n]+|Fecha de creación: [^\\n]+)\\r?\\n)+\\r?\\n?`
    );
    return content.replace(metadata, '');
}

function commentHeader(marker: '#' | '//', createdAt: string): string {
    return [
        `${marker} Generado por ${GENERATED_FILE_GENERATOR}`,
        `${marker} Author: ${GENERATED_FILE_AUTHOR}`,
        `${marker} Fecha de creación: ${validCreatedAt(createdAt)}`,
        '',
    ].join('\n');
}

export function withGeneratedFileMetadata(
    layer: AgentGeneratedFile['layer'],
    content: string,
    createdAt: string
): string {
    if (layer === 'locators') {
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(content) as Record<string, unknown>;
        } catch {
            // La validación posterior debe conservar el error original del JSON.
            return content;
        }
        // El estandar del repo prohibe metadatos dentro del JSON de locators:
        // JSON no admite comentarios y un `_metadata` es lo mismo con otro
        // nombre. La trazabilidad (que grabacion aporto que clave) vive en el
        // registro del recorder, fuera del framework. Se sigue eliminando el
        // bloque para limpiar los archivos escritos por versiones anteriores.
        const { _metadata: _discarded, ...blocks } = parsed;
        return JSON.stringify(blocks, null, 4) + '\n';
    }

    const marker = layer === 'feature' ? '#' : '//';
    return commentHeader(marker, createdAt) + stripCommentMetadata(content, marker);
}

export function withGeneratedResponseMetadata(
    response: AutomationAgentResponse,
    createdAt: string
): AutomationAgentResponse {
    return {
        ...response,
        files: response.files.map(file => ({
            ...file,
            content: withGeneratedFileMetadata(file.layer, file.content, createdAt),
        })),
    };
}
