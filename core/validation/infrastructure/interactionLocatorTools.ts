import fs from 'fs';
import path from 'path';
import type { InteractionLocatorEvidence } from './rules/interactionLocatorCheck';

/** Copy only portable validators. Their only external dependency is TypeScript. */
export function writeInteractionLocatorTools(directory: string, evidence: InteractionLocatorEvidence, typescriptPath: string | null): void {
    fs.writeFileSync(path.join(directory, 'locator-evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
    const modules = ['interactionLocatorCheck', 'screenLocatorTypes', 'screenMethodUsage', 'screenAst'];
    for (const name of modules) {
        const source = fs.readFileSync(path.join(__dirname, 'rules', `${name}.js`), 'utf8');
        // Do not resolve node_modules from the agent workspace or framework.
        fs.writeFileSync(path.join(directory, `${name}.js`), source.replace(/require\(["']typescript["']\)/g,
            `require(${JSON.stringify(typescriptPath)})`), 'utf8');
    }
}
