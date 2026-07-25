Feature: Validar comportamiento de Cerrar sesión
  Yo como usuario de Yape 
  Quiero poder cerrar sesión con normalidad

  Rule: Redireccionar al unlock al presionar cerrar sesión

    @logout @YAPEEG-14299 @nexus_user_menu
    Scenario Outline: Validar la opción Cerrar sesión
      Given el usuario <username> inicia sesión en Yape
      And el usuario abre el menu hamburguesa
      Then se muestra correctamente el menu del usuario
      And se muestran los Términos y Condiciones, la Política de privacidad y Cerrar sesión
      When el usuario presiona "Cerrar Sesión"
      Then se muestra la pantalla de unlock

      Examples:
        | username                   |
        | Andree 02 BCPSinDni        |
        # | Andree 004 OEFNiubiz       |
        # | Andree 19 TDYape           |
        # | Andree 29 BCPNegocio       |