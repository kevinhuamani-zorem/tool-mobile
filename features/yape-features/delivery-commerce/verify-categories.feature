@marketplace
@check_categories
Feature: Verificar que se visualice correctamente las categorías y subcategorías de Yape Tienda
    @smokeTestMarketplace
    Scenario Outline: [Happy Path] Verificar que se muestre las categorías
      Given el usuario <username> inicia sesión en Yape
      And el usuario selecciona la opcion tienda
      * validar dirección
      | Jirón Lima | Barranco | 2 |
      When el usuario ingresa a la opción de "<opcion>" del menu inferior
      And selecciona la categoría "<categoria>"
      And selecciona la subcategoría "<subcategoria>"
      Then el ve el producto "<product>"

      Examples:
        | username                    | opcion     | categoria    | subcategoria      | product |
        | Giancarlo Ciscon Foundation | Categorías | Electrohogar | Línea Blanca | Bord |
