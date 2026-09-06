import type { MobilePlatform } from '../../automation/contracts';

/**
 * Nombres con los que un locator JSON existente organiza sus plataformas.
 *
 * El generador nombra los bloques desde el archivo (`yapear-otp` ->
 * `yapearOtpAndroid` / `yapearOtpIos`), pero 49 de los 82 locators del
 * framework no siguen esa convencion (`yapearAndroid`, `salesiOS`, `Android`,
 * `MarketPlaceHomeAndroid`...). Un `update` sobre esos archivos tiene que
 * extender los bloques que ya existen: crear un segundo par de bloques deja
 * las claves nuevas fuera del bloque que leen el validador y el Screen, y
 * el borrador determinista abortaba por eso (TC-10239, 05-09-2026).
 */
export interface LocatorPlatformBlocks {
    android?: string;
    ios?: string;
}

/** Como debe nombrar el generador lo que agrega a un modulo de locators existente. */
export interface LocatorNaming {
    /** Bloques por plataforma tomados del baseline; los ausentes siguen la convencion. */
    blocks?: LocatorPlatformBlocks;
    /** Identificador con el que el Screen existente ya importa ese JSON. */
    identifier?: string;
}

/**
 * Plataforma de un bloque por su sufijo, sin distinguir mayusculas: el
 * framework mezcla `Ios`, `iOS` e `IOs`. Es el mismo criterio que usa el
 * validador (`blockName.toLowerCase().endsWith(platform)`).
 */
export function locatorBlockPlatform(block: string): MobilePlatform | undefined {
    const lower = String(block).toLowerCase();
    if (lower.endsWith('android')) return 'android';
    if (lower.endsWith('ios')) return 'ios';
    return undefined;
}

/** Primer bloque de cada plataforma que ya existe en el JSON del baseline. */
export function existingLocatorBlocks(locators: Record<string, unknown>): LocatorPlatformBlocks {
    const blocks: LocatorPlatformBlocks = {};
    for (const [name, value] of Object.entries(locators || {})) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const platform = locatorBlockPlatform(name);
        if (platform && !blocks[platform]) blocks[platform] = name;
    }
    return blocks;
}

/**
 * Bloque destino para una adicion: el homonimo si existe; si no, el bloque
 * del baseline con la misma plataforma; en ultimo caso, el propuesto.
 */
export function targetLocatorBlock(
    proposed: string,
    baseline: Record<string, unknown>,
    existing: LocatorPlatformBlocks = existingLocatorBlocks(baseline),
): string {
    if (Object.prototype.hasOwnProperty.call(baseline, proposed)) return proposed;
    const platform = locatorBlockPlatform(proposed);
    return (platform && existing[platform]) || proposed;
}
