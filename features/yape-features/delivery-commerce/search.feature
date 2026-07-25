@marketplace
Feature: Listar Productos desde buscador
Yo como usuario de Yape
Quiero visualizar correctamente los productos de una categoría de Yape Tienda

    Rule: Mostrar los productos desde filtro en boton buscador

        @buscador_filtro
        @smokeTestMarketplace
        Scenario Outline: [Happy Path] Validar que el botón Ver Resultados de Filtrar funcione correctamente desde el menú buscador
            Given el usuario <username> inicia sesión en Yape
            And el usuario selecciona la opcion tienda
#            * validar dirección
#                | Jirón Lima | Barranco | 2 |
            When realiza la busqueda de un producto o categoria: <search>
            Then selecciona la opcion filtro para acotar la busqueda
            And se mantiene los filtros buscados
            Examples:
            | username           | search |
            | Carlos Barboza TFT      | celulares |


    Rule: Validar que se mantengan los filtros al seleccion un producto y retornar

        @buscador_order_filtro
        Scenario Outline: [Happy Path]Validar que el buscador luego de un ordenamiento y filtrado de marcas y seleccion de un producto al retornar se mantengan los filtros
            Given el usuario <username> inicia sesión en Yape
            And el usuario selecciona la opcion tienda
            * validar dirección
                | Jirón Lima | Barranco | 2 |
            When realiza la busqueda de un producto o categoria: <search>
            And realiza el filtro por orden: <order>
            And filtro de marca: <brand>
            And selecciona un producto
            And regresa a la lista de busqueda
            Then se mantiene los filtros buscados

            Examples:
                | username           | search |  brand | order  |
                | Carlos Barboza TFT      | Celular | APPLE | Menor precio |

        @buscador_filtro_fix
        Scenario Outline: [Happy Path] Validar busqueda de producto <search> con filtro aplicado
            Given el usuario <username> inicia sesión en Yape
            And el usuaro ingresa a Yape Tienda
            Examples:
                | username           | search |
                | Carlos Barboza TFT      | celulares |
