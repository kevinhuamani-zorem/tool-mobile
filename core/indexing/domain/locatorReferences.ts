/** Claves alcanzadas como `Locators["bloqueAndroid"].clave` o `Locators.bloqueIos.clave`. */
export function locatorKeysIn(text: string): string[] {
    const keys = new Set<string>();
    for (const match of text.matchAll(/[A-Za-z_$][\w$]*\s*\[\s*["'][^"']+["']\s*\]\s*\.\s*([A-Za-z_$][\w$]*)/g)) {
        keys.add(match[1]);
    }
    for (const match of text.matchAll(/[A-Za-z_$][\w$]*\s*\.\s*[A-Za-z_$][\w$]*(?:Android|Ios)\s*\.\s*([A-Za-z_$][\w$]*)/g)) {
        keys.add(match[1]);
    }
    return [...keys];
}
