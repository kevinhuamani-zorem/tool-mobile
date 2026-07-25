import { AppiumDriverManager } from './appiumDriverManager';
import { LocatorManager } from './locatorManager';
import { RecordedStep, ExecutionResult } from './models';
import { projectPaths } from './projectPaths';
import path from 'path';

export class MobileStepExecutor {
    constructor(
        private dm: AppiumDriverManager,
        private lm: LocatorManager
    ) {}

    async execute(step: RecordedStep): Promise<ExecutionResult> {
        console.log('[MobileStepExecutor] Ejecutando:', step.action, step.variableName || '');
        try {
            const selector = this.resolveSelector(step.selector || '');

            switch (step.action) {
                case 'ABRIR_APP':    return await this.abrirApp(step.value!);
                case 'CLICK':        return await this.click(selector);
                case 'ESCRIBIR':     return await this.escribir(selector, step.value!);
                case 'LIMPIAR':      return await this.limpiar(selector);
                case 'SCROLL_DOWN':  return await this.scroll('down');
                case 'SCROLL_UP':    return await this.scroll('up');
                case 'SCROLL_HASTA': return await this.scrollHasta(selector);
                case 'SWIPE':        return await this.swipe(step.value || 'left');
                case 'PRESION_LARGA':return await this.presionLarga(selector);
                case 'VERIFICAR_TEXTO':    return await this.verificarTexto(selector, step.value!);
                case 'VERIFICAR_EXISTE':   return await this.verificarExiste(selector);
                case 'VERIFICAR_NO_EXISTE':return await this.verificarNoExiste(selector);
                case 'VOLVER':       return await this.volver();
                case 'ESPERAR':      return await this.esperar(Number(step.value || 1));
                case 'SCREENSHOT':   return await this.screenshot();
                default:
                    return { success: false, message: 'Accion no reconocida' };
            }
        } catch (e: any) {
            console.error('[MobileStepExecutor] Error:', e.message);
            return { success: false, message: e.message };
        }
    }

    private resolveSelector(selector: string): string {
        if (selector.startsWith('{') && selector.endsWith('}')) {
            return this.lm.resolve(selector);
        }
        return selector;
    }

    private async abrirApp(packageName: string): Promise<ExecutionResult> {
        await this.dm.getDriver().activateApp(packageName);
        await new Promise(r => setTimeout(r, 2000));
        return { success: true, message: `App abierta: ${packageName}` };
    }

    private async click(selector: string): Promise<ExecutionResult> {
        const el = await this.dm.findElement(selector);
        await el.waitForDisplayed({ timeout: 10000 });
        await el.click();
        return { success: true, message: `Click en: ${selector}` };
    }

    private async escribir(selector: string, value: string): Promise<ExecutionResult> {
        const el = await this.dm.findElement(selector);
        await el.waitForDisplayed({ timeout: 10000 });
        await el.clearValue();
        await el.setValue(value);
        return { success: true, message: `Escrito "${value}" en: ${selector}` };
    }

    private async limpiar(selector: string): Promise<ExecutionResult> {
        const el = await this.dm.findElement(selector);
        await el.clearValue();
        return { success: true, message: `Limpiado: ${selector}` };
    }

    private async scroll(direction: 'up' | 'down'): Promise<ExecutionResult> {
        const driver = this.dm.getDriver();
        const size   = await driver.getWindowSize();
        const x      = Math.floor(size.width / 2);
        const startY = direction === 'down'
            ? Math.floor(size.height * 0.7)
            : Math.floor(size.height * 0.3);
        const endY = direction === 'down'
            ? Math.floor(size.height * 0.3)
            : Math.floor(size.height * 0.7);

        await driver.touchAction([
            { action: 'press',   x, y: startY },
            { action: 'wait',    ms: 500 },
            { action: 'moveTo',  x, y: endY },
            { action: 'release' }
        ] as any);
        return { success: true, message: `Scroll ${direction}` };
    }

    private async scrollHasta(selector: string): Promise<ExecutionResult> {
        const driver = this.dm.getDriver();
        // UiScrollable para Android
        const scrollSelector =
            `new UiScrollable(new UiSelector().scrollable(true))` +
            `.scrollIntoView(new UiSelector().descriptionContains("${selector}"))`;
        try {
            await driver.$(`android=${scrollSelector}`);
            return { success: true, message: `Scroll hasta: ${selector}` };
        } catch {
            // Fallback scroll manual
            return await this.scroll('down');
        }
    }

    private async swipe(direction: string): Promise<ExecutionResult> {
        const driver = this.dm.getDriver();
        const size   = await driver.getWindowSize();
        const cx     = Math.floor(size.width / 2);
        const cy     = Math.floor(size.height / 2);
        const offset = Math.floor(size.width * 0.35);

        const coords: Record<string, [number, number, number, number]> = {
            left:  [cx + offset, cy, cx - offset, cy],
            right: [cx - offset, cy, cx + offset, cy],
            up:    [cx, cy + offset, cx, cy - offset],
            down:  [cx, cy - offset, cx, cy + offset],
        };

        const [sx, sy, ex, ey] = coords[direction] || coords.left;
        await driver.touchAction([
            { action: 'press',  x: sx, y: sy },
            { action: 'wait',   ms: 500 },
            { action: 'moveTo', x: ex, y: ey },
            { action: 'release' }
        ] as any);
        return { success: true, message: `Swipe ${direction}` };
    }

    private async presionLarga(selector: string): Promise<ExecutionResult> {
        const el = await this.dm.findElement(selector);
        await this.dm.getDriver().touchAction([
            { action: 'longPress', element: el as any },
            { action: 'release' }
        ] as any);
        return { success: true, message: `Presion larga en: ${selector}` };
    }

    private async verificarTexto(selector: string, expected: string): Promise<ExecutionResult> {
        const el   = await this.dm.findElement(selector);
        const text = await el.getText();
        if (text.includes(expected)) {
            return { success: true, message: `Texto "${expected}" verificado` };
        }
        return { success: false, message: `Esperado: "${expected}" | Actual: "${text}"` };
    }

    private async verificarExiste(selector: string): Promise<ExecutionResult> {
        try {
            const el      = await this.dm.findElement(selector);
            const visible = await el.isDisplayed();
            return visible
                ? { success: true,  message: `Elemento existe: ${selector}` }
                : { success: false, message: `Elemento no visible: ${selector}` };
        } catch {
            return { success: false, message: `Elemento no encontrado: ${selector}` };
        }
    }

    private async verificarNoExiste(selector: string): Promise<ExecutionResult> {
        try {
            const el = await this.dm.findElement(selector);
            const exists = await el.isExisting();
            return exists
                ? { success: false, message: `Elemento encontrado (se esperaba que no existiera)` }
                : { success: true,  message: `Elemento no existe (correcto)` };
        } catch {
            return { success: true, message: `Elemento no existe (correcto)` };
        }
    }

    private async volver(): Promise<ExecutionResult> {
        await this.dm.getDriver().pressKeyCode(4); // KEYCODE_BACK
        return { success: true, message: 'Boton volver presionado' };
    }

    private async esperar(seconds: number): Promise<ExecutionResult> {
        await new Promise(r => setTimeout(r, seconds * 1000));
        return { success: true, message: `Esperado ${seconds}s` };
    }

    private async screenshot(): Promise<ExecutionResult> {
        const base64 = await this.dm.takeScreenshot();
        const fs     = await import('fs');
        const name   = `screenshot_${Date.now()}.png`;
        fs.mkdirSync(projectPaths.screenshots, { recursive: true });
        fs.writeFileSync(path.join(projectPaths.screenshots, name), base64, 'base64');
        return { success: true, message: `Captura guardada: ${name}` };
    }
}
