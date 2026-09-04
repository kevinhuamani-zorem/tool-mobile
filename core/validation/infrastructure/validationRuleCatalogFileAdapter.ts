import fs from 'fs';
import path from 'path';
import { projectPaths } from '../../workspace';
import { buildValidationRuleContractFromSource } from '../application/buildValidationRuleContract';
import type { ValidationRuleContract } from '../domain/validationRule';

/**
 * El catalogo que recibe el agente se construye leyendo el codigo del
 * validador. Desde que las reglas viven en familias separadas, la fuente ya no
 * es un archivo sino el orquestador mas su directorio `rules/`: leer solo el
 * primero publicaria un contrato sin la mayoria de los codigos.
 */
export function validatorRuleSourcePaths(
    filePath: string = defaultValidatorSourcePath()
): string[] {
    const rulesDirectory = path.join(path.dirname(filePath), 'rules');
    const extension = path.extname(filePath);
    const ruleFiles = fs.existsSync(rulesDirectory)
        ? fs.readdirSync(rulesDirectory)
            .filter(name => name.endsWith(extension))
            .sort()
            .map(name => path.join(rulesDirectory, name))
        : [];
    return [filePath, ...ruleFiles];
}

/** Codigo fuente completo del validador: orquestador y familias de reglas. */
export function readValidatorRuleSource(
    filePath: string = defaultValidatorSourcePath()
): string {
    return validatorRuleSourcePaths(filePath)
        .filter(candidate => fs.existsSync(candidate))
        .map(candidate => fs.readFileSync(candidate, 'utf8'))
        .join('\n');
}

export function buildValidationRuleContractFromFile(filePath: string): ValidationRuleContract {
    return buildValidationRuleContractFromSource(readValidatorRuleSource(filePath));
}

export function defaultValidatorSourcePath(): string {
    const candidates = [
        path.join(
            projectPaths.toolRoot,
            'core',
            'validation',
            'infrastructure',
            'automationResponseValidator.ts'
        ),
        path.join(
            projectPaths.toolRoot,
            'dist',
            'core',
            'validation',
            'infrastructure',
            'automationResponseValidator.js'
        ),
    ];
    return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
}
