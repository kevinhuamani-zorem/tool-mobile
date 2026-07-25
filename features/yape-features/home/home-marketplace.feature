Feature: Pagina de inicio de Yape
  Yo como usuario de Yape
  Quiero visualizar correctamente los productos agrupados en la página de inicio
  Para poder navegar a las categorías de productos que me interesan

Background:
  * el usuario Login_e2e_lb inicia sesión en Yape

@agrupacionesProductosHomex
Scenario: Validar que se muestre diferentes agrupaciones de productos en el Home
  Given que el usuario ingresa a tienda
  When vea la pantalla de Home
  Then debería ver las siguientes agrupaciones de productos
    | Accesorios Moda |
    | Celulares |
