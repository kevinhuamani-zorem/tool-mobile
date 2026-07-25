import fs from 'fs';
import path from 'path';
import { projectPaths } from './projectPaths';

export interface StepDefinitionInfo {
    keyword: 'Given' | 'When' | 'Then';
    expression: string;
    file: string;
}

export interface ScreenMethodInfo {
    name: string;
    file: string;
    squad: string;
}

export interface StepReuseResult {
    text: string;
    status: 'reused' | 'missing';
    match?: StepDefinitionInfo;
}

function walkTypeScript(root: string): string[] {
    if (!fs.existsSync(root)) return [];
    const output: string[] = [];
    const pending = [root];
    while (pending.length > 0) {
        const current = pending.pop()!;
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) pending.push(fullPath);
            else if (entry.isFile() && entry.name.endsWith('.ts')) output.push(fullPath);
        }
    }
    return output.sort();
}

function safeRegex(expression: string): RegExp | undefined {
    try {
        return new RegExp(expression);
    } catch {
        return undefined;
    }
}

export class ReuseAnalyzer {
    private stepDefinitions: StepDefinitionInfo[] = [];
    private screenMethods: ScreenMethodInfo[] = [];

    refresh(): void {
        this.stepDefinitions = this.indexStepDefinitions();
        this.screenMethods = this.indexScreenMethods();
    }

    analyzeSteps(texts: string[]): StepReuseResult[] {
        if (this.stepDefinitions.length === 0) this.refresh();
        return texts.map(rawText => {
            const text = rawText.trim().replace(/^(Given|When|Then|And|But)\s+/, '');
            const match = this.stepDefinitions.find(definition => {
                const regex = safeRegex(definition.expression);
                return regex ? regex.test(text) : false;
            });
            return match
                ? { text, status: 'reused', match }
                : { text, status: 'missing' };
        });
    }

    getScreenMethods(squad?: string): ScreenMethodInfo[] {
        if (this.screenMethods.length === 0) this.refresh();
        if (!squad) return this.screenMethods;
        return this.screenMethods.filter(method =>
            method.squad === squad || method.squad === 'commons'
        );
    }

    getSummary(): { stepDefinitions: number; screenMethods: number } {
        if (this.stepDefinitions.length === 0 && this.screenMethods.length === 0) this.refresh();
        return {
            stepDefinitions: this.stepDefinitions.length,
            screenMethods: this.screenMethods.length
        };
    }

    private indexStepDefinitions(): StepDefinitionInfo[] {
        const definitions: StepDefinitionInfo[] = [];
        const pattern = /\b(Given|When|Then)\s*\(\s*\/((?:\\\/|[^/])+)\/[dgimsuvy]*\s*,/g;

        for (const file of walkTypeScript(projectPaths.stepDefinitions)) {
            const content = fs.readFileSync(file, 'utf-8');
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(content)) !== null) {
                definitions.push({
                    keyword: match[1] as StepDefinitionInfo['keyword'],
                    expression: match[2].replace(/\\\//g, '/'),
                    file: path.relative(projectPaths.frameworkRoot, file)
                });
            }
        }
        return definitions;
    }

    private indexScreenMethods(): ScreenMethodInfo[] {
        const methods: ScreenMethodInfo[] = [];
        const methodPattern = /\b(?:public\s+)?async\s+([A-Za-z_$][\w$]*)\s*\(/g;

        for (const file of walkTypeScript(projectPaths.screenobjects)) {
            const relative = path.relative(projectPaths.screenobjects, file);
            const squad = relative.split(path.sep)[0];
            const content = fs.readFileSync(file, 'utf-8');
            let match: RegExpExecArray | null;
            while ((match = methodPattern.exec(content)) !== null) {
                methods.push({
                    name: match[1],
                    file: path.relative(projectPaths.frameworkRoot, file),
                    squad
                });
            }
        }
        return methods;
    }
}
