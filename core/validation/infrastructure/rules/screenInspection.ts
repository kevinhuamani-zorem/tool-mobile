/**
 * Lecturas del Screen Object y de los Steps mediante el AST de TypeScript:
 * que TypeLocator referencia cada getter (`screenLocatorTypes`), que getters
 * consume cada metodo (`screenMethodUsage`), la aridad declarada y las claves
 * que quedarian vacias en la plataforma grabada.
 *
 * Son consultas puras sobre el codigo propuesto; las reglas que las usan viven
 * en `locatorContractRules`, `syntaxRules` y `codeStructureRules`.
 */
import ts from 'typescript';
import { FrameworkContract } from '../../../workspace';
import { screenObjectNames } from '../../../automation/contracts';

export { screenLocatorTypes } from './screenLocatorTypes';
export { screenMethodGetterUsage } from './screenMethodUsage';

/**
 * Nombre de la clase que declara un Screen Object. Un `update` sobre un
 * archivo escrito a mano por el equipo (`class movementScreen extends
 * BaseScreen`) no lleva el nombre que el recorder derivaria de la ruta
 * (`MovementsScreen`), y las reglas que inspeccionan getters y metodos
 * tienen que mirar la clase real, no la convencional: si no, ningun getter
 * "existe" y todo el contrato de locators falla por un motivo ajeno al agente.
 */
export function declaredScreenClassName(content: string, baseScreenClass?: string): string | undefined {
    const source = String(content || '');
    const withBase = baseScreenClass
        ? source.match(new RegExp(`class\\s+([A-Za-z_$][\\w$]*)\\s+extends\\s+${baseScreenClass}\\b`))
        : undefined;
    const any = withBase || source.match(/class\s+([A-Za-z_$][\w$]*)\s+extends\s+[A-Za-z_$][\w$]*/);
    return any?.[1];
}

export function screenClassNameFor(content: string, filePath: string, baseScreenClass?: string): string {
    return declaredScreenClassName(content, baseScreenClass) || screenObjectNames(filePath).className;
}

/** El archivo importa el modulo aunque sea por ruta relativa o con otra extension. */
export function importsModuleLike(content: string, source: string): boolean {
    const wanted = source.split('/').pop()!.replace(/\.(?:ts|js)$/, '');
    return [...String(content || '').matchAll(/(?:from\s+|import\s+)['"]([^'"]+)['"]/g)]
        .some(match => match[1].split('/').pop()!.replace(/\.(?:ts|js)$/, '') === wanted);
}

export function plannedAlias(file: string, root: string, alias: string): string | undefined {
    const normalized = file.replace(/\\/g, '/').replace(/^\.\//, '');
    const prefix = `${root.replace(/^\/+|\/+$/g, '')}/`;
    return normalized.startsWith(prefix) ? `${alias}/${normalized.slice(prefix.length)}` : undefined;
}

/**
 * Claves que el Screen Object referencia y que quedarian vacias en la
 * plataforma de la grabacion.
 *
 * Es el cierre del contrato de cobertura: un getter contra "" compila, pasa el
 * review y falla al ejecutar. Se evalua el archivo COMO QUEDARA, aplicando las
 * completions declaradas, para no marcar como roto lo que el propio paquete va
 * a rellenar.
 */
export function emptyOnRecordedPlatform(
    screenContent: string,
    platform: 'android' | 'ios',
    documentFor: (identifier: string) => Record<string, any> | undefined,
    completed: Set<string>
): string[] {
    const problems: string[] = [];
    const seen = new Set<string>();
    // `LocatorHome.homeAndroid.shortcutTapp` y `Locators["blockIos"].name`.
    const references = [
        ...screenContent.matchAll(/\b([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)/g),
        ...screenContent.matchAll(/\b([A-Za-z_$][\w$]*)\s*\[\s*['"]([^'"]+)['"]\s*\]\s*\.\s*([A-Za-z_$][\w$]*)/g),
    ];
    for (const [, identifier, block, key] of references) {
        if (!block.toLowerCase().endsWith(platform)) continue;
        const unique = `${identifier}.${block}.${key}`;
        if (seen.has(unique)) continue;
        seen.add(unique);
        const document = documentFor(identifier);
        if (!document) continue;
        const target = document[block];
        if (!target || typeof target !== 'object') continue;
        if (!Object.prototype.hasOwnProperty.call(target, key)) continue;
        if (String(target[key] || '').trim()) continue;
        if (completed.has(unique)) continue;
        problems.push(unique);
    }
    return problems;
}

export function importsFrom(content: string, source: string): boolean {
    return [...content.matchAll(/(?:from\s+|import\s+)['"]([^'"]+)['"]/g)]
        .some(match => match[1] === source);
}

export function screenMethodArities(content: string): Map<string, { required: number; maximum: number }> {
    const source = ts.createSourceFile('screen.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const result = new Map<string, { required: number; maximum: number }>();
    const visit = (node: ts.Node): void => {
        if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
            const required = node.parameters.filter(parameter =>
                !parameter.questionToken && !parameter.initializer && !parameter.dotDotDotToken
            ).length;
            result.set(node.name.text, {
                required,
                maximum: node.parameters.some(parameter => parameter.dotDotDotToken)
                    ? Number.POSITIVE_INFINITY
                    : node.parameters.length,
            });
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return result;
}

export function stepScreenMethodCalls(content: string): Array<{ method: string; arguments: number }> {
    const source = ts.createSourceFile('steps.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const calls: Array<{ method: string; arguments: number }> = [];
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            calls.push({ method: node.expression.name.text, arguments: node.arguments.length });
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return calls;
}
