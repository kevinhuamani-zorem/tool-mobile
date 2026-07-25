export interface FunctionalityKeywords {
    functionalityName: string;
    keywords: string[];
    hasCategoryLayout?: boolean;
}

export interface WorldConfig {
    functionalities: FunctionalityKeywords[];
    invalidKeyword: string;
}

// Only 5 test keywords are being considered per functionality
export const SEARCH_KEYWORDS_CATALOG: Record<string, WorldConfig> = {
    Yapeos: {
        functionalities: [
            {
                functionalityName: 'Dólares',
                keywords: ['Dolar', 'Dolares', 'Venta', 'Sol', 'Cambio']
            },
            {
                functionalityName: 'Codigo de aprobación',
                keywords: ['codigo de aprobacion', 'codigo de compras', 'aprobación', 'compra por internet', 'compra online']
            },
            {
                functionalityName: 'Yapear servicios',
                keywords: ['servicios', 'telefonia', 'celular', 'recibo', 'postpago']
            },
            {
                functionalityName: 'Recargar celular',
                keywords: ['recargar celular', 'Recargas', 'Recarga', 'Claro', 'Movistar'],
                hasCategoryLayout: true
            }
        ],
        invalidKeyword: 'xyznoexiste123'
    },
    Finanzas: {
        functionalities: [
            {
                functionalityName: 'Créditos',
                keywords: ['Prestamo', 'Credito', 'Financiamiento', 'Dinero', 'Plata']
            },
            {
                functionalityName: 'Seguros',
                keywords: ['Seguro YAPE', 'Seguros Yape', 'Seguro', 'Seguros', 'Seguridad']
            },
            {
                functionalityName: 'SOAT',
                keywords: ['SOAT', 'Auto', 'Vehículo', 'Vehicular']
            },
            {
                functionalityName: 'Remesas',
                keywords: ['remesas', 'Internacional', 'Extranjero', 'Transferencia', 'Giro']
            }
        ],
        invalidKeyword: 'xyznoexiste456'
    },
    Compras: {
        functionalities: [
            {
                functionalityName: 'Tienda',
                keywords: ['apple', 'Audífonos', 'Celulares', 'Cocina', 'computadora']
            },
            {
                functionalityName: 'Gaming',
                keywords: ['Free Fire', 'Pines', 'Mobile', 'Legends', 'Valorant']
            },
            {
                functionalityName: 'Entradas',
                keywords: ['Deporte', 'Concierto', 'Teatro', 'Circo', 'Fiesta']
            },
            {
                functionalityName: 'Viajar en bus',
                keywords: ['Moderno', 'Directo', 'Autobuses', 'Interprovinciales', 'Comprar']
            },
            {
                functionalityName: 'Promos',
                keywords: ['Bembos', 'Burger King', 'Chinawok', 'Oxxo', 'Pizza']
            }
        ],
        invalidKeyword: 'xyznoexiste789'
    }
};
