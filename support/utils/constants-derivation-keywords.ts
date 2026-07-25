/**
 * Represents a functionality with its associated search keywords and screen validation data.
 * Used for testing keyword-based navigation in the Yape app.
 */
export interface FunctionalityKeywords {
    /** Display name of the functionality (e.g., 'Dólares', 'Créditos') */
    functionalityName: string;
    /** Array of keywords that should navigate to this functionality */
    keywords: string[];
    /** Expected screen title/text to validate after navigation */
    screen: string;
    /** 
     * Locator strategy to find the screen validation element.
     * - screenView: Standard screen view locator
     * - screenViewFollowing: Uses following-sibling XPath strategy
     * - screenViewBiometry: Biometric screen-specific locator
     */
    locatorType?: 'screenView' | 'screenViewFollowing' | 'screenViewBiometry';
}

/**
 * Configuration for a feature world containing multiple functionalities.
 */
export interface WorldConfig {
    /** List of functionalities available in this world */
    functionalities: FunctionalityKeywords[];
}

/**
 * Catalog of keywords for derivation testing across different Yape feature worlds.
 * Each world (Yapeos, Finanzas, Ayuda, Menú) contains functionalities with associated 
 * keywords and screen validation data.
 * 
 * @example
 * // Access a world's functionalities
 * const yapeosWorld = DERIVATION_KEYWORDS_CATALOG['Yapeos'];
 * const dolaresFunctionality = yapeosWorld.functionalities.find(f => f.functionalityName === 'Dólares');
 * 
 * @remarks
 * To add a new functionality:
 * 1. Identify the appropriate world (Yapeos, Finanzas, Ayuda, Menú)
 * 2. Add a new entry with functionalityName, keywords array, screen title, and locatorType
 * 3. Ensure corresponding locators exist in search-keywords.locator.json
 * 4. Test all keywords to verify correct navigation
 * 
 * @see {@link search-keywords.locator.json} for locator definitions
 * @see {@link derivation-keywords.steps.ts} for step implementations
 */

export const DERIVATION_KEYWORDS_CATALOG: Record<string, WorldConfig> = {
    Payments: {
        functionalities: [
            {
                functionalityName: 'Dólares',
                keywords: ['Dolares', 'Venta', 'Cambio', 'Divisa', 'Conversion', 'Cotizar'],
                screen: 'Cambiar dólares con Yape es muy fácil',
                locatorType: 'screenViewFollowing'
            },
            {
                functionalityName: 'Aprobar compras',
                keywords: ['aprobación', 'compra por internet', 'ecommerce', 'comercio electrónico', 'compra app', 'pago internet', 'código de comprobación', 'código de verificación'],
                screen: 'Aprobar compras',
                locatorType: 'screenViewBiometry'
            },
            {
                functionalityName: 'Yapear servicios',
                keywords: ['servicios', 'telefonia', 'recibo', 'postpago', 'cibertec', 'pagar servicios', 'pago en efectivo', 'banco de la nacion', 'compartamos'],
                screen: 'Yapear servicios',
                locatorType: 'screenViewBiometry'
            },
            {
                functionalityName: 'Recargar celular',
                keywords: ['Recargas', 'America Movil', 'Celular', 'Telefono'],
                screen: 'Recargar celular',
                locatorType: 'screenViewBiometry'
            }
        ],
    },
    Finance: {
        functionalities: [
            {
                functionalityName: 'Créditos',
                keywords: ['Financiamiento', 'Dinero', 'Plata', 'Tasa', 'Vencimiento', 'Objetivo', 'Empresa', 'Capital'],
                screen: 'Créditos Yape',
                locatorType: 'screenViewBiometry'
            },
            {
                functionalityName: 'Mundo Protección',
                keywords: ['Seguros', 'Seguridad', 'Accidentes', 'Muerte', 'Protección', 'Asegurado', 'Poliza de seguro'],
                screen: 'Mundo Protección',
                locatorType: 'screenViewBiometry'
            },
            {
                functionalityName: 'SOAT',
                keywords: ['Vehículo', 'Póliza', 'Comprar Seguro', 'Cobertura médica', 'Renovación de SOAT', 'soat positiva'],
                screen: '¡Ten tu SOAT hoy mismo! desde S/ 50.00',
                locatorType: 'screenView'
            },
            {
                functionalityName: 'Remesas',
                keywords: ['Internacional', 'Extranjero', 'Giro', 'Recibe dinero', 'enviar dinero'],
                screen: 'Remesas',
                locatorType: 'screenViewBiometry'
            }
        ],
    },
    Help: {
        functionalities: [
            {
                functionalityName: 'Centro de ayuda',
                keywords: ['centro de ayuda yape', 'yape soporte', 'atencion al cliente yape', 'consultas yape', 'atencion al cliente yape peru', 'whatsapp', 'telefono yape', 'llamar a yape'],
                screen: '¿Cómo te ayudamos?',
                locatorType: 'screenViewFollowing'
            }
        ],
    }, 
    Menu: {
        functionalities: [
            {
                functionalityName: 'Mi QR',
                keywords: ['Menu de yape', 'ajustes', 'menu'],
                screen: 'Mi QR',
                locatorType: 'screenViewBiometry'
            },
            {
                functionalityName: 'Notificaciones por yapeo',
                keywords: ['sonido', 'ajustes'],
                screen: 'Notificaciones por yapeo',
                locatorType: 'screenView'
            },
            {
                functionalityName: 'Mis datos',
                keywords: ['numero de cuenta', 'ajustes', 'configuracion'],
                screen: 'Datos de la cuenta',
                locatorType: 'screenViewBiometry'
            },
            {
                functionalityName: 'Biometría digital',
                keywords: ['menu yape'],
                screen: 'Activa la Biometría digital e ingresa a tu Yape, ¡al toque!',
                locatorType: 'screenViewBiometry'
            },
            {
                functionalityName: 'Compras por internet y POS',
                keywords: ['ajustes'],
                screen: 'Compras por internet',
                locatorType: 'screenViewBiometry'
            },
            {
                functionalityName: 'Límites transaccionales',
                keywords: ['configuracion'],
                screen: 'Límites transaccionales',
                locatorType: 'screenView'
            },
            {
                functionalityName: 'Confirmación de yapeo alto',
                keywords: ['menu yape'],
                screen: 'Confirmación de yapeo alto',
                locatorType: 'screenViewBiometry'
            }
        ],
    }
};
