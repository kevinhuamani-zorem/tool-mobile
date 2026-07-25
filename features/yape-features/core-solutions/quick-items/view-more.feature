Feature: Mostrar el modal "Ver todo"
  Yo como usuario de Yape
  Quiero visualizar correctamente el modal "Ver todo"
  Para acceder a la lista completa de mundos y funcionalidades disponibles según mi perfil

  Rule: Mostrar correctamente los elementos del modal "Ver Más" desde el Home

    @view_more @YAPEEG-14311 @nexus_user_menu
    Scenario Outline: Validar elementos del modal Ver Más
      Given el usuario <username> inicia sesión en Yape
      And ingresa a la opción "Ver más" de los Home Items
      Then se muestra el modal con la lista de mundos y funcionalidades para el usuario de acuerdo a su perfil
      And se cierra el modal
      Then se muestra nuevamente la pantalla del "Home"

      Examples:
        | username             |
        # | Andree 004 OEFNiubiz |
        # | Andree 02 BCPSinDni  |
        | Nexusaut 09 BCPAdvanced |


