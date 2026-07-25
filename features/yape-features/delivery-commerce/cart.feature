@marketplace
@agregarCarrito1
Feature: Gestión del carrito de compras en la tienda de Yape

    Background: Login y pasos previso para cada escenario
        * el usuario Antonia Castells Foundation inicia sesión en Yape
        * el usuario selecciona la opcion tienda
        * validar dirección
            | Jirón Lima | Barranco | 2 |
        * el usuario ingresa a la opción de "Categorías" del menu inferior
        
    @smokeTestMarketplace
    Scenario Outline: Agregar productos al carrito y eliminar productos del carrito
        * selecciona la categoría <categoria>
        Given el usuario agrega 1 producto al carrito
        When ingresamos al carrito de compras
        Then el carrito de compras debería mostrar 1 producto
        And decide vaciar carrito
        And el carrito de compras debería mostrar el mensaje <mensaje>
        Examples:
        | categoria  | mensaje                                   |
        | Electrohogar | Todavía no tienes productos en tu carrito |
