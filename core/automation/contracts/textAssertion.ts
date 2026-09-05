/** El locator identifica el objetivo; nunca describe por sí mismo la aserción. */
export interface TextAssertion {
    version: 1;
    source: 'element' | 'container';
    operator: 'contains' | 'equals';
}

export function parseTextAssertion(input: unknown, action: string, expected?: string): TextAssertion | undefined {
    if (input === undefined) return undefined; // No migrar recordings históricos por inferencia.
    const value = input as Partial<TextAssertion> | null;
    if (action !== 'VERIFICAR_TEXTO' || !value || value.version !== 1
        || !['element', 'container'].includes(String(value.source))
        || !['contains', 'equals'].includes(String(value.operator))
        || typeof expected !== 'string' || expected.length === 0 || expected.length > 8192) {
        throw new Error('Define la fuente de texto, la comparación y un valor esperado no vacío (máximo 8192 caracteres).');
    }
    return { version: 1, source: value.source!, operator: value.operator! };
}

/** Contrato ejecutable autocontenido, también emitido dentro del Screen Object.
 * Conserva texto exacto, orden y duplicados. No asciende al padre ni lee XML.
 * Los límites fallan explícitamente: truncar podría aprobar una comparación falsa.
 */
export const RECORDED_TEXT_READER = `    private async readRecordedText(element: Awaited<ReturnType<typeof $>>, source: 'element' | 'container'): Promise<string> {
        const parts: string[] = [];
        const append = (text: string): void => {
            if (text.length > 0) parts.push(text);
            if (parts.join('\\n').length > 32768) throw new Error('El contenido excede 32768 caracteres; selecciona un contenedor más específico.');
        };
        append(await element.getText());
        if (source === 'container') {
            const children = await element.$$('.//*');
            if (await children.length > 200) throw new Error('El contenedor excede 200 descendientes; selecciona uno más específico.');
            for await (const child of children) append(await child.getText());
        }
        return parts.join('\\n');
    }`;
