import { ipcRenderer } from 'electron';

const INSPECTOR_ORIGIN = 'appium-recorder://inspector';

window.addEventListener('message', (event: MessageEvent<unknown>) => {
    const frame = document.getElementById('embedded-inspector') as HTMLIFrameElement | null;
    if (!frame || event.source !== frame.contentWindow || event.origin !== INSPECTOR_ORIGIN) return;
    ipcRenderer.send('embedded-inspector-message', event.data);
});

ipcRenderer.on('embedded-inspector-connect', (_event, value: unknown) => {
    const frame = document.getElementById('embedded-inspector') as HTMLIFrameElement | null;
    if (!frame?.contentWindow) {
        throw new Error('El frame del Inspector no está disponible');
    }
    frame.contentWindow.postMessage(value, INSPECTOR_ORIGIN);
});
