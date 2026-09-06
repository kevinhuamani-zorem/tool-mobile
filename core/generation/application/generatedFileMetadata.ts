import type {
    AgentGeneratedFile,
    AutomationAgentResponse,
} from '../../automation/contracts';

export const GENERATED_FILE_AUTHOR = 'Kevinarnold.zorem';
export const GENERATED_FILE_GENERATOR = 'Appium Recorder';

function validCreatedAt(value: string): string {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? new Date().toISOString() : new Date(timestamp).toISOString();
}

function stripCommentMetadata(content: string, marker: '#'): string {
    const metadata = new RegExp(
        `^(?:${marker} (?:Generado por Appium (?:Visual )?Recorder|Author: [^\\n]+|Fecha de creación: [^\\n]+)\\r?\\n)+\\r?\\n?`
    );
    return content.replace(metadata, '');
}

function commentHeader(marker: '#', createdAt: string): string {
    return [
        `${marker} Generado por ${GENERATED_FILE_GENERATOR}`,
        `${marker} Author: ${GENERATED_FILE_AUTHOR}`,
        `${marker} Fecha de creación: ${validCreatedAt(createdAt)}`,
        '',
    ].join('\n');
}

/**
 * Metadata de procedencia: solo en el Feature.
 *
 * El Feature es documentacion que la gente lee y ahi una cabecera (generador,
 * autor y fecha) tiene sentido. Steps, Screen Object y Locators deben parecer
 * codigo del framework: git ya sabe quien y cuando, y que grabacion aporto
 * cada simbolo vive en `config/generated-files.json` y en
 * `package-provenance.json`, fuera del framework. Un comentario por metodo
 * con el recordingId (que solo existe en `runtime/` de una maquina) era ruido
 * para cualquier revisor.
 */
export function withGeneratedFileMetadata(
    layer: AgentGeneratedFile['layer'],
    content: string,
    createdAt: string
): string {
    if (layer === 'steps' || layer === 'screen') {
        // Sin cabecera. Tampoco se retira la de archivos ya generados con
        // versiones anteriores: un update no toca lineas ajenas a lo anadido.
        return content;
    }
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

    return commentHeader('#', createdAt) + stripCommentMetadata(content, '#');
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
