import ts from 'typescript';

export interface TypeScriptSyntaxDiagnostic {
    message: string;
    line?: number;
    column?: number;
}

export function validateTypeScriptSyntax(
    filePath: string,
    content: string,
): TypeScriptSyntaxDiagnostic[] {
    const result = ts.transpileModule(content, {
        fileName: filePath,
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
        },
        reportDiagnostics: true,
    });

    return (result.diagnostics || []).map(diagnostic => {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        if (!diagnostic.file) return { message };
        const position = ts.getLineAndCharacterOfPosition(
            diagnostic.file,
            typeof diagnostic.start === 'number' ? diagnostic.start : 0
        );
        return {
            message,
            line: position.line + 1,
            column: position.character + 1,
        };
    });
}
