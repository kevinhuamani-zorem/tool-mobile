import fs from 'fs';
import path from 'path';
import { TextDecoder } from 'util';
import crypto from 'crypto';

export interface Utf8TextProblem {
    code: 'invalid-utf8' | 'replacement-character' | 'probable-mojibake' | 'non-nfc';
    message: string;
}

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const REPLACEMENT_CHARACTER = /\uFFFD/;
// Secuencias habituales cuando bytes UTF-8 fueron interpretados como
// Windows-1252/Latin-1 (por ejemplo, `Botón` -> `BotÃ³n`). No se marca una Ã
// portuguesa ordinaria: el segundo carácter debe pertenecer al rango típico
// del byte continuador mal decodificado.
const PROBABLE_MOJIBAKE = /(?:Ã[\u0080-\u00BF]|Â[\u0080-\u00BF])/;

export function normalizeUnicodeText(value: string): string {
    return String(value ?? '').replace(/^\uFEFF/, '').normalize('NFC');
}

export function utf8TextProblems(value: string): Utf8TextProblem[] {
    const source = String(value ?? '');
    const problems: Utf8TextProblem[] = [];
    if (REPLACEMENT_CHARACTER.test(source)) {
        problems.push({
            code: 'replacement-character',
            message: 'El texto contiene U+FFFD (�), señal de bytes Unicode dañados.',
        });
    }
    if (PROBABLE_MOJIBAKE.test(source)) {
        problems.push({
            code: 'probable-mojibake',
            message: 'El texto contiene mojibake probable (por ejemplo, una tilde convertida en Ã…).',
        });
    }
    if (source.replace(/^\uFEFF/, '') !== normalizeUnicodeText(source)) {
        problems.push({
            code: 'non-nfc',
            message: 'El texto Unicode no está normalizado como NFC.',
        });
    }
    return problems;
}

export function decodeUtf8(bytes: Uint8Array): string {
    try {
        return normalizeUnicodeText(UTF8_DECODER.decode(bytes));
    } catch {
        const error = new Error('El archivo no contiene UTF-8 válido.');
        (error as Error & { code?: string }).code = 'INVALID_UTF8';
        throw error;
    }
}

export function readUtf8File(file: string): string {
    return decodeUtf8(fs.readFileSync(file));
}

export function normalizeJsonUnicode<T>(value: T): T {
    if (typeof value === 'string') return normalizeUnicodeText(value) as T;
    if (Array.isArray(value)) {
        return value.map(entry => normalizeJsonUnicode(entry)) as T;
    }
    if (value && typeof value === 'object') {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) return value;
        const output: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            output[normalizeUnicodeText(key)] = normalizeJsonUnicode(entry);
        }
        return output as T;
    }
    return value;
}

export function readJsonUtf8<T>(file: string): T {
    return normalizeJsonUnicode(JSON.parse(readUtf8File(file)) as T);
}

export function writeUtf8FileAtomic(file: string, content: string): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.utf8.tmp`;
    try {
        const normalized = normalizeUnicodeText(content);
        fs.writeFileSync(temporary, Buffer.from(normalized, 'utf-8'), { flag: 'wx' });
        fs.renameSync(temporary, file);
    } finally {
        if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
    }
}

export function writeJsonUtf8(file: string, value: unknown): void {
    writeUtf8FileAtomic(
        file,
        `${JSON.stringify(normalizeJsonUnicode(value), null, 2)}\n`,
    );
}
