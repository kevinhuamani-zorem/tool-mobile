@marketplace
Feature: Seleccion de tipo de pago

@smokeTestMarketplace
@marketplaceE2EYape
Scenario Outline: [Hapy Path] Validar el flujo de compra yape
    Given el usuario <username> inicia sesión en Yape
    And el usuario selecciona la opcion tienda
    * validar dirección
      | Jirón Lima | Barranco | 2 |
    When realiza la busqueda de un producto o categoria: <search>
    And el usuario agrega producto al carrito desde buscador
    And ingresa al carrito y continua con la compra
    And se valida el detalle de compra
    And se selecciona el tipo de pago: <payment_type>
    And se acepta terminos y condiciones
    Then selecciona el boton de pago
    And se valida el winstate de pago


    Examples:
        | username           | search | payment_type|
        | Antonia Castells Foundation | NO EDITAR - Audifonos Automa | Yape |
