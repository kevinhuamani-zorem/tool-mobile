class ContextSwitcher {
    /**
     * Cambia al primer contexto WebView disponible, esperando si es necesario.
     * @param timeout Tiempo máximo de espera en milisegundos (por defecto 10000ms).
     * @throws Error si no se encuentra un contexto WebView después de esperar.
     */
    async switchToWebView(timeout = 10000): Promise<void> {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const contexts = await driver.getContexts();
            const contextNames = contexts.map(ctx => typeof ctx === 'string' ? ctx : ctx.id);
            console.log('[ContextSwitcher] Available contexts:', JSON.stringify(contextNames, null, 2));

            const webviewContext = contextNames.find(ctx => ctx !== 'NATIVE_APP' && ctx.startsWith('WEBVIEW'));
            if (webviewContext) {
                await driver.switchContext(webviewContext);
                console.log(`[ContextSwitcher] Switched to context: ${webviewContext}`);
                return;
            }

            await new Promise(resolve => setTimeout(resolve, 500)); // Espera 500ms antes de reintentar
        }

        throw new Error('No WEBVIEW context was found after waiting');
    }

    /**
     * Cambia al contexto nativo de la aplicación, esperando si es necesario.
     * @param timeout Tiempo máximo de espera en milisegundos (por defecto 10000ms).
     * @throws Error si no se encuentra el contexto NATIVE_APP después de esperar.
     */
    async switchToNative(timeout = 10000): Promise<void> {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const contexts = await driver.getContexts();
            const contextNames = contexts.map(ctx => typeof ctx === 'string' ? ctx : ctx.id);
            console.log('[ContextSwitcher] Available contexts:', JSON.stringify(contextNames, null, 2));

            if (contextNames.includes('NATIVE_APP')) {
                await driver.switchContext('NATIVE_APP');
                console.log('[ContextSwitcher] Switched to context: NATIVE_APP');
                return;
            }

            await new Promise(resolve => setTimeout(resolve, 500)); // Espera 500ms antes de reintentar
        }

        throw new Error('No NATIVE_APP context was found after waiting');
    }
}

export default ContextSwitcher;
