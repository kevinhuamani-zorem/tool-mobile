Feature: Validar opciones para ayudante
  Yo como usuario de Yape
  Quiero validar que las opciones de ayudante estén disponibles como ayudante
  Para poder utilizar las funcionalidades correspondientes a mi rol de ayudante

  Rule: Validar que las opciones de ayudante estén disponibles como ayudante

    @helper_acceptance @YAPEEG-19948 @nexus_user_menu
    Scenario Outline: Validar opciones de ayudante
      Given el usuario <username> inicia sesión en Yape
      When ingresa a la opción "Ver más" de los Home Items
      Then verifica si se encuentra la opción "Ver ventas del día" en Ver más
      When ingresa al mundo de ayudantes
      Then verifica si se encuentra la opción "Ver ventas del día" en el mundo de ayudantes

      Examples:
        | username             |
        | Nexus 29 BCPAccepted |
