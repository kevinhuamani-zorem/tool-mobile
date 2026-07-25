@marketplace

Feature: Tracking de pedido en la tienda de Yape

    @smokeTestMarketplace
    @Order
    Scenario Outline: Verificar el tracking de pedido
        * el usuario <username> inicia sesión en Yape
        * el usuario selecciona la opcion tienda
        * validar dirección
            | Jirón Lima | Barranco | 2 |
        * realiza la busqueda de un producto o categoria: <search>
        * el usuario agrega producto al carrito desde buscador
        * ingresa al carrito y continua con la compra
        * se valida el detalle de compra
        * se selecciona el tipo de pago: <payment_type>
        * selecciona el boton de pago
        * se valida el winstate de pago
        Given el usuario ingresa a la opción de Mis Pedidos del menu inferior
        When selecciona el pedido
        Then Verficamos el tracking del pedido
        Examples:
        | username           | search   | payment_type |
        | Giancarlo Ciscon Foundation | No Editar Audifonos K | Yape         |

    @Cancel_Order
    Scenario Outline: Cancelar pedido y verificar pantalla de ayuda
        * el usuario <username> inicia sesión en Yape
        * el usuario selecciona la opcion tienda
        * validar dirección
            | Jirón Lima | Barranco | 2 |
        Given el usuario ingresa a la opción de Mis Pedidos del menu inferior
        When selecciona el pedido
        Then el usuario selecciona icono de ayuda
        Examples:
        | username           |
        | Giancarlo Ciscon Foundation |
