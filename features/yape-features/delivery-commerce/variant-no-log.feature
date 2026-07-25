@marketplace
@variantesLog
    Feature: Agregar al carrito de compras en la tienda de Yape un producto con variantes
        Background: Login y pasos previso para cada escenario
        * el usuario Login E2E BCP inicia sesión en Yape

    @smokeTestMarketplace
    Scenario Outline: Agregar productos al carrito
        Given el usuario selecciona la opcion tienda
        * validar dirección
            | Jirón Lima | Barranco | 2 |
        When realiza la busqueda de un producto o categoria: <search>
        And el usuario agrega productos al carrito con varible: <caracteristicaProducto>

     Examples:
        | search         |  caracteristicaProducto |
        | NO EDITAR - Camisetas Polo |  Naranja                |

