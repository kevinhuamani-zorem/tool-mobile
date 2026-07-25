Feature: Mostrar el QuickItem "Ayuda"
  Yo como usuario de Yape
  Quiero visualizar correctamente la pantalla "Ayuda"

  Rule: Mostrar elementos de la pantalla "Ayuda"

    @help @YAPEEG-18929 @nexus_user_menu
    Scenario Outline: Verificar elementos de Ayuda - Centro de Ayuda
      Given el usuario <username> inicia sesión en Yape
      And el usuario abre el menu hamburguesa
      And el usuario ingresa a la opción "Ayuda"
      Then se muestra correctamente el "Centro de Ayuda"

      Examples:
        | username                   |
        | Andree 02 BCPSinDni        |
        # | Andree 004 OEFNiubiz       |
        # | Andree 19 TDYape           |
        # | Andree 29 BCPNegocio       |