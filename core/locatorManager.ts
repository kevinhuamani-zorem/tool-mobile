import * as fs from 'fs';
import * as path from 'path';

export type LocatorPlatform = 'android' | 'ios';

type LocatorDocument = Partial<Record<LocatorPlatform, Record<string, string>>>;

/**
 * Carga locators explícitos desde resources/locators/<módulo>.locator.json.
 * Los locators del módulo activo prevalecen sobre el módulo global.
 */
export class LocatorManager {
    private locators = new Map<string, string>();
    private activeLocators = new Map<string, string>();

    constructor(
        private readonly rootPath = './resources/locators',
        private readonly moduleName = 'global',
        private readonly platform: LocatorPlatform = 'android'
    ) {
        this.load();
    }

    private load(): void {
        this.locators.clear();
        this.mergeModule('global');
        const active = this.readModule(this.moduleName);
        this.activeLocators = new Map(Object.entries(active));
        if (this.moduleName !== 'global') {
            for (const [name, selector] of Object.entries(active)) this.locators.set(name, selector);
        }
        console.log(`[LocatorManager] ${this.locators.size} locators — ${this.platform} — ${this.moduleName}`);
    }

    private normalizeModule(moduleName: string): string {
        const normalized = moduleName.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        if (!normalized || normalized.split('/').some(part => part === '..')) {
            throw new Error(`Módulo de locators inválido: "${moduleName}"`);
        }
        return normalized;
    }

    private moduleFile(moduleName: string): string {
        return path.join(this.rootPath, `${this.normalizeModule(moduleName)}.locator.json`);
    }

    private readModule(moduleName: string): Record<string, string> {
        const filePath = this.moduleFile(moduleName);
        if (!fs.existsSync(filePath)) {
            if (moduleName === 'global') return {};
            throw new Error(`No existe el módulo de locators: ${filePath}`);
        }
        const document = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as LocatorDocument;
        const locators = document[this.platform] || {};
        for (const [name, selector] of Object.entries(locators)) {
            if (typeof selector !== 'string' || !selector.trim()) {
                throw new Error(`Locator inválido: ${moduleName}.${name}`);
            }
        }
        return locators;
    }

    private mergeModule(moduleName: string): void {
        for (const [name, selector] of Object.entries(this.readModule(moduleName))) {
            this.locators.set(name, selector);
        }
    }

    private saveActiveModule(): void {
        const filePath = this.moduleFile(this.moduleName);
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
        let document: LocatorDocument = {};
        if (fs.existsSync(filePath)) document = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as LocatorDocument;
        document[this.platform] = Object.fromEntries(this.activeLocators);
        fs.writeFileSync(filePath, JSON.stringify(document, null, 2) + '\n', 'utf-8');
    }

    add(name: string, selector: string): void {
        if (!name || !selector) throw new Error('Nombre y selector son obligatorios');
        this.activeLocators.set(name, selector);
        this.locators.set(name, selector);
        this.saveActiveModule();
        console.log(`[LocatorManager] Guardado: ${this.moduleName}.${name} → ${selector}`);
    }

    resolve(variable: string): string {
        const key = variable.replace(/[{}]/g, '');
        const separator = key.lastIndexOf('.');
        if (separator > 0) {
            const moduleName = key.slice(0, separator).replace(/\./g, '/');
            const locatorName = key.slice(separator + 1);
            const selector = this.readModule(moduleName)[locatorName] || this.readModule('global')[locatorName];
            if (selector) return selector;
            throw new Error(`Locator no encontrado: ${key} (${this.platform})`);
        }
        const selector = this.locators.get(key);
        if (!selector) throw new Error(`Locator no encontrado: ${this.moduleName}.${key} (${this.platform})`);
        return selector;
    }

    exists(name: string): boolean {
        try { this.resolve(name); return true; } catch { return false; }
    }

    getAll(): Record<string, string> { return Object.fromEntries(this.locators); }
    getFilePath(): string { return this.moduleFile(this.moduleName); }
    getModuleName(): string { return this.moduleName; }
}
