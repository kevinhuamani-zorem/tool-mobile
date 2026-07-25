Feature: Mostrar los datos del usuario en la opción "Biometría digital"
  Yo como usuario de Yape 
  Quiero visualizar correctamente los elementos de "Biometría digital"

  Rule: Mostrar correctamente los elementos de pantalla de "Biometría digital"

    @digital_biometrics @YAPEEG-12741 @nexus_user_menu
    Scenario Outline: Validar que aparezca la sección Biometría Digital para los diferentes perfiles
      Given el usuario <username> inicia sesión en Yape
      And el usuario abre el menu hamburguesa
      Then el usuario ingresa a la opción "Biometría digital"
      And se muestra correctamente la pantalla "Biometría digital"    

      Examples:
        | username            |
        | Andree 004 OEFNiubiz|
        | Andree 02 BCPSinDni |