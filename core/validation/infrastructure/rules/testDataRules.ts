import { readFrameworkUserCatalog } from '../../../workspace';
import { responseScenarioResolutions } from './gherkinInspection';
import type { ResponseRule } from './ruleContext';

/** Only the framework login contract consumes these names as fixtures, not arbitrary username inputs. */
export function featureLoginUsers(content: string, caseId?: string): string[] {
    const scenarios = responseScenarioResolutions(content);
    const own = caseId ? scenarios.filter(scenario => scenario.title.includes(`[${caseId}]`)) : scenarios;
    const selected = own.length ? own : scenarios.length === 1 && !/\[TC-[^\]]+\]/.test(scenarios[0].title) ? scenarios : [];
    return [...new Set(selected.flatMap(scenario => scenario.lines.flatMap(line => line.expanded.flatMap(text => {
        const match = text.match(/^el usuario (.*) inicia sesión en Yape$/);
        return match && !/<[^>]+>/.test(match[1]) ? [match[1]] : [];
    }))))];
}

export const testDataRules: ResponseRule = ({ scenario, response }, report) => {
    const feature = response.files.find(file => file.layer === 'feature');
    if (!feature) return;
    const users = featureLoginUsers(feature.content, scenario.request?.caseId);
    if (!users.length) return;
    const catalog = readFrameworkUserCatalog();
    if (catalog.status === 'unavailable') {
        report.warnings.push('[test-data-unavailable] No se pudo comprobar todo resources/data/**/*.yml. Revisa los datos del caso antes de ejecutarlo.');
        return;
    }
    for (const name of users) if (!catalog.names.has(name.toUpperCase())) report.errors.push({
        code: 'test-data-user-missing', file: feature.path,
        message: !name.trim() ? 'Falta seleccionar un usuario real para el login. Revisa los usuarios del squad en resources/data; puedes exportar el borrador para completar el dato.' : `El usuario «${name}» no existe en resources/data/**/*.yml. El login fallará antes de ejecutar el caso. Corrige Examples o incorpora el dato al framework; puedes exportar el borrador para corregirlo.`,
    });
};
