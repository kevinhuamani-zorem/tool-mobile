import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { behaviorHash } from '../domain/behaviorContract';
import profiles from './behaviorHelperProfiles.json';

/** Whitespace/comments are irrelevant; changing an executable token invalidates the proof. */
export function helperBodyHash(body: string): string {
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, body);
    const tokens: string[] = [];
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
        tokens.push(`${token}:${scanner.getTokenText()}`);
    }
    return behaviorHash(tokens.join('|'));
}

export function verifiedFrameworkHelpers(root: string): Set<string> {
    const verified = new Set<string>();
    for (const profile of profiles) {
        const file = path.join(root, profile.file);
        if (!fs.existsSync(file)) continue;
        const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
        for (const declaration of source.statements) {
            if (!ts.isClassDeclaration(declaration) || declaration.name?.text !== profile.className) continue;
            for (const member of declaration.members) {
                if (!ts.isMethodDeclaration(member) || member.name.getText(source) !== profile.method || !member.body) continue;
                if (helperBodyHash(member.getText(source)) === profile.bodyHash) verified.add(profile.binding);
            }
        }
    }
    return verified;
}
