Feature: Mostrar los datos del usuario en la opción "Eliminar mi cuenta"
  Yo como usuario de Yape 
  Quiero visualizar correctamente los elementos de "Eliminar mi cuenta"

  Rule: Mostrar correctamente los elementos de pantalla de "Eliminar mi cuenta"

    @delete_account @YAPEEG-14240 @nexus_user_menu
    Scenario Outline: Verificar elementos de sección Eliminar mi cuenta
      Given el usuario <username> inicia sesión en Yape
      And el usuario abre el menu hamburguesa
      And el usuario ingresa a la opción "Eliminar mi cuenta"
      Then se muestra correctamente la pantalla "Eliminar mi cuenta"

      Examples:
        | username                   |
        | Andree 02 BCPSinDni        |
        | Andree 19 TDYape           |
        | Andree 004 OEFNiubiz       |
        | Andree 29 BCPNegocio       |