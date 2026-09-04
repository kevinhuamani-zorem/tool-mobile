/**
 * Familia completions: rellenar el hueco de una clave que ya existe.
 *
 * El agente solo declara QUE clave y de QUE accion sale el valor; el selector
 * lo copia el recorder de la grabacion. Estas reglas comprueban que el target
 * este autorizado por el plan, que la accion exista y sea de la misma
 * plataforma, y que la clave exista y este vacia.
 */
import path from 'path';
import fs from 'fs';
import { projectPaths } from '../../../workspace';
import { completionTarget } from './locatorInspection';
import { ResponseRuleContext, RuleReport, unexpectedFields } from './ruleContext';

export function completionRules(context: ResponseRuleContext, report: RuleReport): void {
    const { scenario, plan, response } = context;
    const { errors, warnings } = report;
    // `completions`: adoptar una clave existente y rellenar su hueco.
    //
    // El agente solo dice QUE clave y de QUE accion sale el valor; el
    // selector lo copia el recorder de la grabacion. Asi un selector
    // inventado no puede entrar por esta via, que es justo el riesgo de
    // dejarle escribir en un archivo de otra feature.
    for (const completion of response.completions || []) {
        const extras = unexpectedFields(completion, ['file', 'name', 'platform', 'sequence']);
        if (extras.length) {
            errors.push({
                code: 'completion-shape',
                message: `Completion contiene campos no permitidos: ${extras.join(', ')}`,
            });
            continue;
        }
        const label = `${completion.file}#${completion.name} (${completion.platform})`;
        const authorizedTarget = completionTarget(plan, completion);
        if (!authorizedTarget) {
            errors.push({
                code: 'completion-unauthorized',
                message: `Completar ${label} no coincide con un target de reuse verificado para la acción.`,
            });
            continue;
        }
        const action = scenario.actions.find(step => step.sequence === completion.sequence);
        if (!action) {
            errors.push({
                code: 'completion-sequence',
                message: `Completar ${label} apunta a la accion ${completion.sequence}, que no existe en la grabacion.`,
            });
            continue;
        }
        if (!action.selector) {
            errors.push({
                code: 'completion-sequence',
                message: `Completar ${label} apunta a la accion ${completion.sequence}, que no capturo ningun elemento.`,
            });
            continue;
        }
        if (action.platform && action.platform !== completion.platform) {
            errors.push({
                code: 'completion-platform',
                message: `Completar ${label} toma el valor de una accion grabada en ${action.platform}: `
                    + 'una plataforma no se completa con el selector de la otra.',
            });
            continue;
        }
        const absolute = path.resolve(projectPaths.frameworkRoot, completion.file);
        let document: Record<string, any>;
        try {
            document = JSON.parse(fs.readFileSync(absolute, 'utf-8'));
        } catch {
            errors.push({
                code: 'completion-file',
                message: `Completar ${label} apunta a un archivo de locators que no se puede leer.`,
            });
            continue;
        }
        const block = authorizedTarget.block;
        if (
            !block
            || !document[block]
            || typeof document[block] !== 'object'
            || !Object.prototype.hasOwnProperty.call(document[block], completion.name)
        ) {
            errors.push({
                code: 'completion-key',
                message: `Completar ${label}: la clave no existe en el bloque de ${completion.platform}. `
                    + 'Ese modulo no declara el elemento para esa plataforma, asi que no se completa: '
                    + 'crea el locator en el modulo de este caso.',
            });
            continue;
        }
        if (String(document[block][completion.name] || '').trim()) {
            errors.push({
                code: 'completion-occupied',
                message: `Completar ${label}: la clave ya tiene valor en esa plataforma. `
                    + 'Completar solo llena un hueco vacio; un valor real nunca se pisa.',
            });
        }
    }
}
