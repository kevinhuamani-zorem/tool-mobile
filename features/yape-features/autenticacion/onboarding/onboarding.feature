@reset
Feature: Onboarding Yape Happy Path

  @onboarding
  Scenario Outline: [CDP_01][Happy Path][AUTO-FRONT] Onboarding Exitoso BCP
    Given el usuario no está registrado en Yape y presiona el boton "Crear una cuenta"
    And poblamos los datos del usuario <username>
    And el usuario <username> ingresa su celular
    And el usuario ingresa el código otp, obtenido de su celular
    And el selecciona el tipo de documento e ingresa sus datos en Yape
    And el usuario selecciona el tipo de cuenta a crear
    And el usuario ingresa los datos de su tarjeta
    And el usuario ingresa el pin de su tarjeta
    And el usuario <username> realiza unlock en Yape luego de redirección
    #And hace tap para ir al home de Yape
    And cierra el popup de bienvenida siempre y cuando se muestre
    And se debe mostrar el boton yapear en el home

    Examples:
      | username            |
      | Onboarding Dni Bcp  |
      | Onboarding Ruc Bcp  |
      | Onboarding Pass Bcp |
      | Onboarding Ce Bcp   |
