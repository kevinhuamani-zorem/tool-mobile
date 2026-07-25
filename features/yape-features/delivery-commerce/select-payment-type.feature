@marketplace

Feature: Seleccion de tipo de pago

@smokeTestMarketplace
@seleccionTipoPago
Scenario Outline: [Hapy Path] Validar que se pueda realizar la seleccion de tipo de pago - Yape
    Given el usuario <username> inicia sesión en Yape
    And el usuario selecciona la opcion tienda
    * validar dirección
      | Jirón Lima | Barranco | 2 |
    When realiza la busqueda de un producto o categoria: <search>
    And el usuario agrega producto al carrito desde buscador
    And ingresa al carrito y continua con la compra
    And se valida el detalle de compra
    Then se selecciona el tipo de pago: <payment_type>


    Examples:
        | username           | search | payment_type|
        | Carlos Barboza TFT      | NO EDITAR - Audifonos K| Yape |


@SeleccionPagoTarjeta
Scenario Outline: [Hapy Path] Validar que se pueda realizar la seleccion de tipo de pago - Yape
    Given el usuario <username> inicia sesión en Yape
    And el usuario selecciona la opcion tienda
    * validar dirección
      | Jirón Lima | Barranco | 2 |
    When realiza la busqueda de un producto o categoria: <search>
    And el usuario agrega producto al carrito desde buscador
    And ingresa al carrito y continua con la compra
    And se valida el detalle de compra
    Then se selecciona el tipo de pago: <payment_type>


    Examples:
        | username           | search | payment_type|
        | Carlos Barboza TFT      | NO EDITAR - Audifonos K| Tarjeta |
