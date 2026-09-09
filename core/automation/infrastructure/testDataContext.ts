import fs from 'fs';
import path from 'path';
import type { AutomationScenario } from '../contracts';
import { readFrameworkUserCatalog } from '../../workspace';
import { featureLoginUsers } from '../../validation';
import { readJsonUtf8, writeJsonUtf8 } from '../../shared';

/** Exposes only lookup results for names already present in this case, never the fixture contents. */
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
        schemaVersion: 1, status: catalog.status, source: 'resources/data/**/*.yml', filesRead: catalog.filesRead,
        users: [...names].map(name => ({ name, exists: catalog.names.has(name.toUpperCase()) ? true : catalog.status === 'available' ? false : null })),
        instructions: 'Solo se comprueba existencia, no ejecución ni estado de ventas. Conserva los Examples del caso QA al regenerar; no añadas otra fila para conciliar un dataName obsoleto. Si el dato solicitado no existe o contradice el baseline, informa la discrepancia. No inventes usuarios ni datos; la exportación sigue disponible para corrección QA.',
    });
}
