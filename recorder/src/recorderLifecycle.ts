export type RecorderCleanupTask = () => void | Promise<void>;

export interface RecorderOwnedSession {
    isActive(): boolean;
    quit(): Promise<void>;
}

export class RecorderSessionInitializationCancelled extends Error {
    constructor() {
        super('La conexión se canceló porque el recorder se está cerrando');
        this.name = 'RecorderSessionInitializationCancelled';
    }
}

export class RecorderSessionOwnership {
    private manager: RecorderOwnedSession | null = null;
    private initialization: Promise<void> | null = null;
    private cancelled = false;

    async acquire(manager: RecorderOwnedSession, initialize: () => Promise<void>): Promise<void> {
        if (this.manager) throw new Error('Ya existe una sesión propiedad del recorder');
        this.manager = manager;
        this.cancelled = false;
        const initialization = initialize();
        this.initialization = initialization;
        try {
            await initialization;
            if (this.cancelled) throw new RecorderSessionInitializationCancelled();
        } catch (error) {
            if (!this.cancelled && this.manager === manager) this.manager = null;
            throw error;
        } finally {
            if (this.initialization === initialization) this.initialization = null;
        }
    }

    async close(): Promise<void> {
        const manager = this.manager;
        if (!manager) return;
        this.cancelled = true;
        const initialization = this.initialization;
        if (initialization) {
            await initialization.then(
                () => undefined,
                () => undefined,
            );
        }
        if (manager.isActive()) await manager.quit();
        if (this.manager === manager) this.manager = null;
        this.cancelled = false;
    }
}

export class RecorderRuntimeLifecycle {
    private cleanupInProgress: Promise<void> | null = null;

    constructor(private readonly tasks: RecorderCleanupTask[]) {}

    cleanup(): Promise<void> {
        if (this.cleanupInProgress) return this.cleanupInProgress;

        const cleanup = Promise.resolve().then(() => this.runTasks());
        const tracked = cleanup.finally(() => {
            if (this.cleanupInProgress === tracked) this.cleanupInProgress = null;
        });
        this.cleanupInProgress = tracked;
        return tracked;
    }

    private async runTasks(): Promise<void> {
        const failures: string[] = [];
        for (const task of this.tasks) {
            try {
                await task();
            } catch (error) {
                failures.push(error instanceof Error ? error.message : String(error));
            }
        }
        if (failures.length > 0) {
            throw new Error(`Falló la limpieza del recorder: ${failures.join('; ')}`);
        }
    }
}
