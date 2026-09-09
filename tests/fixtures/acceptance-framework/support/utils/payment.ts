
export class ConstantsPayment {

    static TEXT_YAPEAR: string = "Yapear";
    static TEXT_YAPEASTE_WINSTATE: string = "¡Yapeaste!";
    static TEXT_CONFIRMAR_TU_YAPEO_ALTO: string = "Confirma tu yapeo alto";
    static TEXT_YAPEAR_INTEROP: string = "Vas a yapear a:";
    static TEXT_MOVEMENTS: string = "Movimientos";
    static TEXT_SENDEMAIL: string = "Tu correo se estará enviando en los próximos minutos.";
    static TEXT_VENTAS: string = "Ventas";
    static TEXT_SENDEMAIL_BUSINESS: string = "Recibirás tu reporte en unos minutos";
    static TEXT_SENDEMAIL_BUSINESS_ANDROID: string = "El reporte se enviará a los correos autorizados dentro de los próximos 5 minutos.";
    static TEXT_TITLE_ENVIAR_REPORTE: string = "Enviar reporte de ventas";
}

const SPANISH_MONTHS: Readonly<Record<string, number>> = {
    ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
    jul: 6, ago: 7, set: 8, sep: 8, oct: 9, nov: 10, dic: 11
};

/**
 * Parses a movement date label such as "01 set. 2026 - 12:18 pm", "Hoy 11:56 am" or "Ayer 11:30 am - p2p-bcp".
 * Returns the date normalized to midnight, or null when the format is not recognized.
 */
export function parseMovementDate(rawText: string, referenceDate: Date = new Date()): Date | null {
    const text: string = rawText.trim().toLowerCase();
    const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());

    if (text.startsWith('hoy')) {
        return today;
    }

    if (text.startsWith('ayer')) {
        today.setDate(today.getDate() - 1);
        return today;
    }

    const match = /^(\d{1,2})\s+([a-zá-ú]{3,})\.?\s+(\d{4})/.exec(text);

    if (!match) {
        return null;
    }

    const day: number = Number(match[1]);
    const month: number | undefined = SPANISH_MONTHS[match[2].slice(0, 3)];
    const year: number = Number(match[3]);

    if (month === undefined) {
        return null;
    }

    const parsedDate = new Date(year, month, day);

    if (parsedDate.getDate() !== day || parsedDate.getMonth() !== month) {
        return null;
    }

    return parsedDate;
}

/** Returns true when the given date falls within the last `days` days, today included. */
export function isWithinLastDays(date: Date, days: number, referenceDate: Date = new Date()): boolean {
    const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
    const lowerBound = new Date(today);
    lowerBound.setDate(lowerBound.getDate() - (days - 1));

    return date.getTime() >= lowerBound.getTime() && date.getTime() <= today.getTime();
}
