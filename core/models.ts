export type Action =
    | 'ABRIR_APP'
    | 'CLICK'
    | 'ESCRIBIR'
    | 'LIMPIAR'
    | 'SCROLL_DOWN'
    | 'SCROLL_UP'
    | 'SCROLL_HASTA'
    | 'SWIPE'
    | 'PRESION_LARGA'
    | 'VERIFICAR_TEXTO'
    | 'VERIFICAR_EXISTE'
    | 'VERIFICAR_NO_EXISTE'
    | 'VOLVER'
    | 'ESPERAR'
    | 'SCREENSHOT';

export interface RecordedStep {
    action: Action;
    variableName?: string;
    selector?: string;
    value?: string;
    description?: string;
}

export interface VerificationResult {
    success: boolean;
    tag?: string;
    text?: string;
    error?: string;
    summary: string;
}

export interface ExecutionResult {
    success: boolean;
    message: string;
}

export interface DeviceConfig {
    deviceName: string;
    udid: string;
    platformVersion: string;
    appPackage: string;
    appActivity: string;
    appPath?: string;
}

export function toGherkinLine(step: RecordedStep, index: number): string {
    const keyword = index === 0 ? 'Given' : (index === 1 ? 'When' : 'And');
    const locator = step.variableName ? `{${step.variableName}}` : (step.selector || '');

    switch (step.action) {
        case 'ABRIR_APP':
            return `${keyword} el usuario abre la app "${step.value}"`;
        case 'CLICK':
            return `${keyword} el usuario hace click en "${locator}"`;
        case 'ESCRIBIR':
            return `${keyword} el usuario escribe "${step.value}" en "${locator}"`;
        case 'LIMPIAR':
            return `${keyword} el usuario limpia el campo "${locator}"`;
        case 'SCROLL_DOWN':
            return `${keyword} el usuario hace scroll hacia abajo`;
        case 'SCROLL_UP':
            return `${keyword} el usuario hace scroll hacia arriba`;
        case 'SCROLL_HASTA':
            return `${keyword} el usuario hace scroll hasta "${locator}"`;
        case 'SWIPE':
            return `${keyword} el usuario hace swipe "${step.value}"`;
        case 'PRESION_LARGA':
            return `${keyword} el usuario hace presion larga en "${locator}"`;
        case 'VERIFICAR_TEXTO':
            return `Then el usuario verifica el texto "${step.value}" en "${locator}"`;
        case 'VERIFICAR_EXISTE':
            return `Then el elemento "${locator}" es visible`;
        case 'VERIFICAR_NO_EXISTE':
            return `Then el elemento "${locator}" no es visible`;
        case 'VOLVER':
            return `${keyword} el usuario presiona volver`;
        case 'ESPERAR':
            return `${keyword} el usuario espera "${step.value}" segundos`;
        case 'SCREENSHOT':
            return `${keyword} el usuario toma una captura "${step.value || 'screenshot'}"`;
        default:
            return `${keyword} ${step.description || ''}`;
    }
}

export function stepSummary(step: RecordedStep): string {
    const loc = step.variableName ? `{${step.variableName}}` : (step.selector || '');
    switch (step.action) {
        case 'ABRIR_APP':           return `📱 ABRIR APP → ${step.value}`;
        case 'CLICK':               return `👆 CLICK → ${loc}`;
        case 'ESCRIBIR':            return `✏️ ESCRIBIR "${step.value}" → ${loc}`;
        case 'LIMPIAR':             return `🧹 LIMPIAR → ${loc}`;
        case 'SCROLL_DOWN':         return `⬇️ SCROLL DOWN`;
        case 'SCROLL_UP':           return `⬆️ SCROLL UP`;
        case 'SCROLL_HASTA':        return `🔍 SCROLL HASTA → ${loc}`;
        case 'SWIPE':               return `👉 SWIPE ${step.value}`;
        case 'PRESION_LARGA':       return `👇 PRESION LARGA → ${loc}`;
        case 'VERIFICAR_TEXTO':     return `✅ VERIFICAR TEXTO "${step.value}" → ${loc}`;
        case 'VERIFICAR_EXISTE':    return `👁️ VERIFICAR EXISTE → ${loc}`;
        case 'VERIFICAR_NO_EXISTE': return `🚫 VERIFICAR NO EXISTE → ${loc}`;
        case 'VOLVER':              return `◀️ VOLVER`;
        case 'ESPERAR':             return `⏳ ESPERAR ${step.value}s`;
        case 'SCREENSHOT':          return `📸 SCREENSHOT`;
        default:                    return step.description || step.action;
    }
}
