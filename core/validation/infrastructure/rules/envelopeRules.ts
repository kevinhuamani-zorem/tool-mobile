/**
 * Familia envelope: la forma del sobre de la respuesta.
 *
 * Identidad (`schemaVersion`, `recordingId`, `planId`), campos permitidos en
 * `resolutions`, `actionTrace` y `files`, y el texto UTF-8 NFC de cada archivo.
 * Es la primera familia porque un sobre mal formado invalida todo lo demas.
 */
import {
    AUTOMATION_AGENT_RESPONSE_SCHEMA_VERSION,
    FRAMEWORK_CONTEXT_QUERIES,
} from '../../../automation/contracts';
import { utf8TextProblems } from '../../../shared';
import { ResponseRuleContext, RuleReport, unexpectedFields } from './ruleContext';

export function envelopeRules(context: ResponseRuleContext, report: RuleReport): void {
    const { scenario, plan, response } = context;
    const { errors, warnings } = report;
    if ((response.schemaVersion ?? AUTOMATION_AGENT_RESPONSE_SCHEMA_VERSION) !== AUTOMATION_AGENT_RESPONSE_SCHEMA_VERSION) {
        errors.push({ code: 'schema', message: 'schemaVersion no soportado' });
    }
    if (response.recordingId !== scenario.recordingId) errors.push({ code: 'recording-id', message: 'recordingId no coincide' });
    if (response.planId !== plan.planId) errors.push({ code: 'plan-id', message: 'planId no coincide' });
    response.resolutions.forEach((resolution, index) => {
        // `reason` es la traza que lee el QA: se acepta y se publica en el
        // esquema. Lo que no se acepta es inventar campos.
        const extras = unexpectedFields(resolution, ['gapId', 'decision', 'reason', 'needs']);
        if (extras.length) {
            errors.push({
                code: 'resolution-shape',
                message: `resolutions[${index}] contiene campos no permitidos: ${extras.join(', ')}`,
            });
        }
        if (resolution.needs !== undefined) {
            if (!Array.isArray(resolution.needs) || !resolution.needs.length) {
                errors.push({
                    code: 'resolution-needs-shape',
                    message: `resolutions[${index}].needs debe ser un arreglo no vacío cuando se declara.`,
                });
            } else {
                resolution.needs.forEach((need, needIndex) => {
                    const needExtras = unexpectedFields(need, ['query', 'args']);
                    if (needExtras.length) {
                        errors.push({
                            code: 'resolution-needs-shape',
                            message: `resolutions[${index}].needs[${needIndex}] contiene campos no permitidos: ${needExtras.join(', ')}`,
                        });
                        return;
                    }
                    if (!FRAMEWORK_CONTEXT_QUERIES.includes(need.query as any)) {
                        errors.push({
                            code: 'resolution-needs-query',
                            message: `resolutions[${index}].needs[${needIndex}].query no es soportada: ${String((need as any).query)}.`,
                        });
                    }
                    if (!need.args || typeof need.args !== 'object' || Array.isArray(need.args)) {
                        errors.push({
                            code: 'resolution-needs-args',
                            message: `resolutions[${index}].needs[${needIndex}].args debe ser un objeto.`,
                        });
                    }
                });
            }
        }
    });
    response.actionTrace.forEach((trace, index) => {
        const extras = unexpectedFields(trace, ['sequence', 'gherkinStep', 'screenMethod', 'locatorName']);
        if (extras.length) {
            errors.push({
                code: 'trace-shape',
                message: `actionTrace[${index}] contiene campos no permitidos: ${extras.join(', ')}`,
            });
        }
    });
    response.files.forEach((file, index) => {
        const extras = unexpectedFields(file, ['layer', 'path', 'content']);
        if (extras.length) {
            errors.push({
                code: 'file-shape',
                message: `files[${index}] contiene campos no permitidos: ${extras.join(', ')}`,
                file: file.path,
            });
        }
        for (const problem of utf8TextProblems(file.content)) {
            errors.push({
                code: problem.code === 'non-nfc' ? 'unicode-normalization' : 'unicode-encoding',
                message: `${problem.message} Conserva UTF-8 NFC sin BOM y los diacríticos del recording.`,
                file: file.path,
            });
        }
    });
}
