@marketplace
Feature: Listar Productos
Yo como usuario de Yape
Quiero visualizar correctamente los productos de una categoría de Yape Tienda

  Rule: Mostrar todos los productos de la categoría seleccionada

    @listar_productos
    @smokeTestMarketplace
    Scenario Outline: [Happy Path] Listar Productos desde el Banner Principal
      Given el usuario <username> inicia sesión en Yape
      And el usuario selecciona la opcion tienda
      * validar dirección
        | Jirón Lima | Barranco | 2 |
      And selecciona el banner principal
      And se verifica que se muestre la lista de productos correctamente


      Examples:
        | username           |
        | Login E2E BCP      |


  Rule: Mostrar todos los productos de la caterogia al seleccionar "ver más"

    @listar_productos
    Scenario Outline: [Happy Path] Listar Productos al seleccionar Ver más de una categoria
      Given el usuario <username> inicia sesión en Yape
      And el usuario selecciona la opcion tienda
      * validar dirección
        | Jirón Lima | Barranco | 2 |
      When selecciona la opcion ver más
      Then se verifica que se muestre la lista de productos correctamente


      Examples:
        | username           |  functionality |
        | Carlos Barboza TFT    |  Tienda |

  Rule: Mostrar todos los productos desde seleccion de categoria

    @listar_productos
    Scenario Outline: [Happy Path] Listar Productos desde la opcion categorías del menú
      Given el usuario <username> inicia sesión en Yape
      And el usuario selecciona la opcion tienda
      * validar dirección
        | Jirón Lima | Barranco | 2 |
      And selecciona la opcion categorias en el home de tienda
      And selecciona la categoría tecnología y subcategoría celulares
      And se verifica que se muestre la lista de productos correctamente


      Examples:
        | username           |
        | Login E2E BCP      |

  Rule: Mostrar detalle del productos desde seleccion categoria y subcategoria

    @detalle_producto
    Scenario Outline: [Happy Path] Verificar secciones en detalle del producto
      Given el usuario <username> inicia sesión en Yape
      And el usuario selecciona la opcion tienda
      * validar dirección
        | Jirón Lima | Barranco | 2 |
      And selecciona la opcion categorias en el home de tienda
      And selecciona la categoría tecnología y subcategoría celulares
      And selecciona un producto
      And se verifica que se muestre los componentes del detalle del producto de la marca "<marca>"


      Examples:
        | username           |marca|
        | Login E2E BCP      |OPPO|


