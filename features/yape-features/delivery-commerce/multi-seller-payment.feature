@marketplace
    Feature: Validar que se pueda realizar la seleccion de tipo de pago - Yape con varios vendedo res.
        Background: Login y pasos previso para cada escenario
        * el usuario Login E2E BCP inicia sesión en Yape

@smokeTestMarketplace
@multiseller
Scenario Outline: [Hapy Path] Validar que se pueda realizar la seleccion de tipo de pago - Yape con varios vendedres.
    And el usuario selecciona la opcion tienda
    * validar dirección
      | Jirón Lima | Barranco | 2 |
    When realiza la busqueda de un producto o categoria: <search1>
    And el usuario agrega producto al carrito desde buscador
    And el usuario regresa a tienda desde busqueda
    When realiza la busqueda de un producto o categoria: <search2>
    And el usuario agrega productos al carrito con varible: <caracteristicaProducto>
    And ingresa al carrito y continua con la compra
    And se selecciona el tipo de pago: <payment_type>
    And usuario selecciona yapear
    And el usuario confirma la compra
    Then se valida el winstate de pago

    Examples:
        | search1         | payment_type   | search2 | caracteristicaProducto |
        | NO EDITAR - Audifonos K         | Yape           | NO EDITAR - Camisetas Polo  | Naranja |