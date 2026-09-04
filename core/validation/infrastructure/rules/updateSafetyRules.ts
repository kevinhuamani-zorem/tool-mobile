/**
 * Familia actualizacion segura: un `update` es aditivo.
 *
 * El artefacto a reutilizar tiene que seguir existiendo y la propuesta tiene
 * que conservar cada definicion, metodo y locator que el baseline ya exponia.
 */
import path from 'path';
import fs from 'fs';
import { projectPaths } from '../../../workspace';
import { responseLocatorValues } from './locatorInspection';
import { PreviewRuleContext, RuleReport } from './ruleContext';

export function updateSafetyRules(context: PreviewRuleContext, report: RuleReport): void {
    const { scenario, plan, response, preview } = context;
    const { errors, warnings } = report;
            for (const plannedFile of plan.files.filter(file => file.operation === 'update')) {
                const proposed = response.files.find(file => file.layer === plannedFile.layer)?.content || '';
                const absolute = path.join(projectPaths.frameworkRoot, plannedFile.path);
                if (!fs.existsSync(absolute)) {
                    errors.push({
                        code: 'missing-update-target',
                        message: `El artefacto a reutilizar ya no existe: ${plannedFile.path}`,
                        file: plannedFile.path,
                    });
                    continue;
                }
                const baseline = fs.readFileSync(absolute, 'utf-8');
                const requiredTokens = plannedFile.layer === 'steps'
                    ? [...baseline.matchAll(/(?:Given|When|Then)\(\/\^([^\n]+?)\$\//g)].map(match => match[1])
                    : plannedFile.layer === 'screen'
                        ? [...baseline.matchAll(/public\s+async\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1])
                        : plannedFile.layer === 'locators'
                            ? responseLocatorValues(baseline).map(locator => locator.name)
                            // Un Feature `update` suma Scenarios: los existentes se conservan.
                            : plannedFile.layer === 'feature'
                                ? [...baseline.matchAll(/^\s*Scenario(?: Outline)?:\s*(.+?)\s*$/gm)].map(match => match[1])
                                : [];
                const missingTokens = requiredTokens.filter(token => !proposed.includes(token));
                if (missingTokens.length) {
                    errors.push({
                        code: 'destructive-update',
                        message: `La actualización elimina APIs existentes: ${missingTokens.slice(0, 5).join(', ')}`,
                        file: plannedFile.path,
                    });
                }
            }
}
