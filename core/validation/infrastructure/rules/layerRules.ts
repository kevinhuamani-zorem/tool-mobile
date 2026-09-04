/**
 * Familia capas: la respuesta trae exactamente las capas planificadas, en las
 * rutas planificadas, sin duplicados, sin extras y sin archivos vacios.
 */
import { ResponseRuleContext, RuleReport } from './ruleContext';

export function layerRules(context: ResponseRuleContext, report: RuleReport): void {
    const { scenario, plan, response } = context;
    const { errors, warnings } = report;
    const planned = new Map(plan.files.map(file => [file.layer, file.path]));
    const receivedLayers = new Set(response.files.map(file => file.layer));
    for (const [layer, expectedPath] of planned) {
        const file = response.files.find(candidate => candidate.layer === layer);
        if (!file) errors.push({ code: 'missing-layer', message: `Falta capa ${layer}` });
        else if (file.path !== expectedPath) errors.push({ code: 'path', message: `Ruta no planificada para ${layer}`, file: file.path });
    }
    if (receivedLayers.size !== response.files.length) errors.push({ code: 'duplicate-layer', message: 'Hay capas duplicadas' });
    for (const file of response.files) {
        if (!planned.has(file.layer)) errors.push({ code: 'extra-layer', message: `Capa no solicitada: ${file.layer}`, file: file.path });
        if (!file.content.trim()) errors.push({ code: 'empty-file', message: 'Archivo vacío', file: file.path });
    }
}
