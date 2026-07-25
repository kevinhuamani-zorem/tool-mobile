export interface StoreCategoryKeywords {
    categoryName: string;
    keywords: string[];
}

export interface MacroCategoryConfig {
    categories: StoreCategoryKeywords[];
    invalidKeyword: string;
}

// Only 3 test keywords are being considered per store category
export const SEARCH_STORE_CATEGORIES_CATALOG: Record<string, MacroCategoryConfig> = {
    Tecnología: {
        categories: [
            {
                categoryName: 'iPhones',
                keywords: ['iphone', 'iphone 15', 'iphone 13']
            },
            {
                categoryName: 'Apple',
                keywords: ['iphone', 'iphone 15', 'iphone 13']
            },
            {
                categoryName: 'Samsung',
                keywords: ['galaxy a06', 'galaxy a56', 'galaxy s24']
            },
            {
                categoryName: 'Xiaomi',
                keywords: ['redmi note', 'redmi', 'redmi a5']
            },
            {
                categoryName: 'Celulares',
                keywords: ['iphone', 'iphone 15', 'xiaomi']
            },
            {
                categoryName: 'Audio',
                keywords: ['xiaomi', 'lenovo', 'amazon echo']
            },
            {
                categoryName: 'Televisores',
                keywords: ['lg', 'televisor lg', 'samsung']
            },
            {
                categoryName: 'Computación',
                keywords: ['laptop lenovo', 'hp', 'amd']
            },
            {
                categoryName: 'Relojes',
                keywords: ['tommy hilfiger', 'reloj guess', 'reloj casio']
            }
        ],
        invalidKeyword: 'xyznoexiste_tech'
    },
    Hogar: {
        categories: [
            {
                categoryName: 'Electrodomésticos',
                keywords: ['cuatricombo', 'imaco', 'pentacombo']
            },
            {
                categoryName: 'Juegos de Dormitorio',
                keywords: ['juego de dormitorio', 'dormitorio', 'forli']
            },
            {
                categoryName: 'Cocina',
                keywords: ['cocina a gas', 'electrolux', 'midea']
            },
            {
                categoryName: 'Secadoras, Recortadoras y más',
                keywords: ['wahl', 'secadora siegen', 'secadora revlon']
            },
            {
                categoryName: 'Refrigeración',
                keywords: ['refrigeradora hisense', 'blanco', 'bord']
            },
            {
                categoryName: 'Parrillas y más',
                keywords: ['cilindro', 'parrilla', 'caja china']
            },
            {
                categoryName: 'Lavado',
                keywords: ['samsung', 'carga superior', 'eco bubble']
            }
        ],
        invalidKeyword: 'xyznoexiste_hogar'
    },
    Consumo: {
        categories: [
            {
                categoryName: 'Proteínas y suplementos',
                keywords: ['proteínas', 'kevin levrone', 'proteína whey']
            },
            {
                categoryName: 'Vitaminas y suplementos',
                keywords: ['omega 3', 'glicinato de magnesio', 'ashwagandha']
            },
            {
                categoryName: 'Belleza',
                keywords: ['cyzone', 'antonio banderas', 'dior']
            },
            {
                categoryName: 'Dermocosmética',
                keywords: ['cerave', 'isdin', 'frezyderm']
            },
            {
                categoryName: 'Licores y Bebidas',
                keywords: ['flor de caña', 'ron zacapa', 'johnnie walker']
            },
            {
                categoryName: 'Calzado',
                keywords: ['zapatillas urbanas', 'zapatillas deportivas', 'zapatillas niño']
            },
            {
                categoryName: 'Mascotas',
                keywords: ['bravecto', 'atrevia xr', 'proteggo']
            }
        ],
        invalidKeyword: 'xyznoexiste_consumo'
    }
};
