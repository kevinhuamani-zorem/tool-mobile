Feature: Validar elementos de la opción "Compras por internet" del menu del usuario
  Yo como usuario de Yape
  Quiero validar los elementos de la opción "Compras por internet"
  Para confirmar que se muestre correctamente en el menú del usuario

  Rule: Mostrar correctamente la opción "Compras por internet" en el menú del usuario

    @nexus_user_menu @compras_por_internet @YAPEEG-16619
    Scenario Outline: Validar elementos de la opción Compras por internet del menu del usuario
      Given el usuario <username> inicia sesión en Yape
      And el usuario abre el menu hamburguesa
      And el usuario ingresa a la opción "Compras por internet"
      Then se verifican los elementos de la opción "Compras por internet" en el menú del usuario

      Examples:
        | username                |
        | Andree 02 BCPSinDni|
