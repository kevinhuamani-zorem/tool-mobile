/**
 * Nombres técnicos y normalización de selectores del resolver determinista:
 * alias de selector por plataforma, slug/camel, intención por acción y el
 * nombre compacto del caso.
 */
import crypto from 'crypto';
import path from 'path';
import {
    AutomationScenario,
    Action,
    RecordedStep,
    recordedStepContext,
} from '../../contracts';
import {
    TECHNICAL_STOP_WORDS,
} from '../../../shared';

export const SELECTOR_ACTIONS = new Set<Action>([
    'CLICK', 'ESCRIBIR', 'LIMPIAR', 'SCROLL_HASTA', 'PRESION_LARGA',
    'VERIFICAR_TEXTO', 'VERIFICAR_EXISTE', 'VERIFICAR_NO_EXISTE',
]);

export function normalizeSelector(value = '', platform: 'android' | 'ios'): string {
    let normalized = value.trim().replace(/\s+/g, ' ');
    if (platform === 'android' && /^new\s+UiSelector\(\)/.test(normalized)) {
        normalized = `android=${normalized}`;
    }
    return normalized;
}

export function selectorAliases(value = '', platform: 'android' | 'ios'): Set<string> {
    const normalized = normalizeSelector(value, platform);
    if (!normalized) return new Set();
    const aliases = new Set([normalized]);
    const withoutPrefix = normalized.replace(/^(?:id=|~)/, '').trim();
    if (withoutPrefix) aliases.add(withoutPrefix);
    if (normalized.startsWith('android=new UiSelector()')) {
        aliases.add(normalized.replace(/^android=/, ''));
    }
    return aliases;
}

export function words(value: string): string[] {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .split(/[^a-z0-9]+/)
        .filter(word => word.length > 1);
}

export function similarity(left: string, right: string): number {
    const a = new Set(words(left));
    const b = new Set(words(right));
    if (!a.size || !b.size) return 0;
    const common = [...a].filter(word => b.has(word)).length;
    return common / Math.max(a.size, b.size);
}

export function slug(value: string, fallback: string): string {
    const output = value.toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64)
        .replace(/-+$/g, '');
    return output || fallback;
}

export function camel(value: string, fallback: string): string {
    const parts = words(value);
    if (!parts.length) return fallback;
    return parts[0] + parts.slice(1).map(part => part[0].toUpperCase() + part.slice(1)).join('');
}

export function genericName(value: string): boolean {
    return !value.trim() || /^(?:flujo-mobile|nueva-pantalla|escenario[- ]grabado|flujo mobile)$/i.test(value.trim());
}

export function actionIntent(step: RecordedStep, sequence: number): string {
    const intent = recordedStepContext(step) || String(step.variableName || '').trim();
    const semanticIntent = /^VERIFICAR_/.test(step.action)
        ? intent.replace(/^(?:verificar|validar)(?:\s+que)?\s+/i, '')
        : intent;
    return semanticIntent || `${step.action.toLowerCase()} elemento ${sequence}`;
}

export function compactTechnicalName(scenario: AutomationScenario): string {
    const candidates = [
        scenario.acceptanceCriteria,
        ...scenario.actions.map(recordedStepContext),
        scenario.objective,
    ];
    const meaningful: string[] = [];
    for (const candidate of candidates) {
        for (const word of words(candidate)) {
            if (word.length < 3 || TECHNICAL_STOP_WORDS.has(word) || meaningful.includes(word)) continue;
            meaningful.push(word);
            if (meaningful.length === 4) break;
        }
        if (meaningful.length === 4) break;
    }
    return meaningful.join('-') || `caso-${scenario.recordingId.slice(-8)}`;
}

export function titleFromSlug(value: string): string {
    const text = value.replace(/-/g, ' ');
    const qualified = text.match(/^(filtro|lista|detalle|consulta)\s+(.+)$/i);
    if (qualified) {
        return `${qualified[1][0].toUpperCase()}${qualified[1].slice(1)} de ${qualified[2]}`;
    }
    return text ? text[0].toUpperCase() + text.slice(1) : 'Automatización móvil';
}

