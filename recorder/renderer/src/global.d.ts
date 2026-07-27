export {};

declare global {
    interface Window {
        api: Record<string, (...args: any[]) => Promise<any>>;
    }
}
