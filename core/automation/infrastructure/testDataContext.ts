import fs from 'fs';
import path from 'path';
import type { AutomationScenario } from '../contracts';
import { readFrameworkUserCatalog, availableSquadUsers } from '../../workspace';
import { featureLoginUsers } from '../../validation';
import { readJsonUtf8, writeJsonUtf8 } from '../../shared';

/** Exposes requested-name checks and eligible squad names, never fixture credentials or contents. */
export function prepareTestDataContext(packageDirectory: string): void {
    const scenario = readJsonUtf8<AutomationScenario>(path.join(packageDirectory, 'scenario.json'));
    const baselinePath = path.join(packageDirectory, 'baseline-response.json');
    const baseline = fs.existsSync(baselinePath) ? readJsonUtf8<any>(baselinePath) : undefined;
    const names = new Set<string>([scenario.request?.dataName, scenario.request?.examples?.username].filter((name): name is string => Boolean(name)));
    for (const file of baseline?.files || []) if (file.layer === 'feature') {
        featureLoginUsers(file.content, scenario.request?.caseId).forEach(name => names.add(name));
    }
    const catalog = readFrameworkUserCatalog();
    writeJsonUtf8(path.join(packageDirectory, 'test-data-context.json'), {
        schemaVersion: 2, status: catalog.status, source: 'resources/data/**/*.yml', filesRead: catalog.filesRead,
        users: [...names].map(name => ({ name, exists: catalog.names.has(name.toUpperCase()) ? true : catalog.status === 'available' ? false : null })),
        squad: scenario.squad || scenario.request?.squad || '',
        selection: scenario.request?.testDataSelection || { mode: 'requested', name: scenario.request?.dataName || '' },
        availableUsers: availableSquadUsers(catalog, scenario.squad || scenario.request?.squad || ''),
        instructions: 'Solo se comprueba existencia, no ejecución, saldo ni movimientos. availableUsers contiene únicamente nombres únicos del squad y su archivo de origen, sin credenciales. Si selection.mode es automatic, usa el usuario seleccionado o uno de availableUsers si existe evidencia para preferirlo; nunca inventes un nombre ni condiciones de la cuenta. Si QA indicó el usuario, consérvalo y reporta si no existe. Conserva los Examples del caso QA al regenerar; no añadas otra fila para conciliar datos contradictorios. Sin candidatos, deja el dato pendiente para QA; la exportación sigue disponible.',
    });
}
