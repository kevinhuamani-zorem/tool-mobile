@marketplace

Feature: Pagina de inicio de Yape
  Yo como usuario de Yape
  Quiero visualizar correctamente los productos agrupados en la página de inicio
  Para poder navegar a las categorías de productos que me interesan

Background:
  * el usuario Login_e2e_lb inicia sesión en Yape

@smokeTestMarketplace
@agrupacionesProductosHome
@listar_productos
Scenario: Validar que se muestre diferentes agrupaciones de productos en el Home
  Given el usuario selecciona la opcion tienda
  * validar dirección
    | Jirón Lima | Barranco | 2 |
  When vea la pantalla de Home
  Then debería ver las siguientes agrupaciones de productos
    | Top venta |
