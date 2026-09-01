import fs from 'fs';
import path from 'path';
import { projectPaths } from '../../workspace';
import { buildValidationRuleContractFromSource } from '../application/buildValidationRuleContract';
import type { ValidationRuleContract } from '../domain/validationRule';

export function buildValidationRuleContractFromFile(filePath: string): ValidationRuleContract {
    const source = fs.readFileSync(filePath, 'utf8');
    return buildValidationRuleContractFromSource(source);
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
