@marketplace
Feature: Detalle de productos para compra
@resumenCompra
@smokeTestMarketplace
Scenario Outline: [Hapy Path] Validar el detalle de compra
    Given el usuario <username> inicia sesión en Yape
    And el usuario selecciona la opcion tienda
    * validar dirección
      | Jirón Lima | Barranco | 2 |
    When realiza la busqueda de un producto o categoria: <search>
    And el usuario agrega producto al carrito desde buscador
    And ingresa al carrito y continua con la compra
    Then se valida el detalle de compra

    Examples:
        | username             | search   |
        | Login E2E BCP | NO EDITAR - Audifonos K  |
