Feature: Yapeo regular Happy Path

  @yapeoregular
  Scenario Outline: [CP_01][Happy Path][AUTO-FRONT] Yapear de un yapero regular a otro yapero sin otp
    Given el usuario <username> inicia sesión en Yape
    When el usuario ingresa a la opcion de yapear
    And el usuario visualizo la seleccion de contactos
    And el usuario ingresa el numero telefonico a yapear: <cellphone>
    And ingresa el monto de yapear <amount>
    And ingresa un comentario <comment>
    And selecciona yapear
    Then el usuario deberia visualizar el winstate del yapeo
    And el usuario vuelve a Home desde winstate
    And se muestra nuevamente la pantalla del "Home"

    Examples:
      | username                   | cellphone   | amount | comment                  |
      | Carla Lima Dni             | 988 620 351 |    1.2 | prueba tdd a bcp sin otp |
      | Merlina Morgan Tdd6 Autofe | 999 621 361 |    1.2 | prueba tdd a bcp sin otp |

  @yapeoregularconotp
  Scenario Outline: [CP_01][Happy Path][AUTO-FRONT] Yapear de un yapero regular a otro yapero con otp
    Given el usuario <username> inicia sesión en Yape
    When el usuario ingresa a la opcion de yapear
    And el usuario visualizo la seleccion de contactos
    And el usuario ingresa el numero telefonico a yapear: <cellphone>
    And ingresa el monto de yapear <amount>
    And ingresa un comentario <comment>
    And selecciona yapear
    And se valida con codigo OTP
    And selecciona el boton de validacion
    Then el usuario deberia visualizar el winstate del yapeo
    And el usuario vuelve a Home desde winstate
    And se muestra nuevamente la pantalla del "Home"

    Examples:
      | username                   | cellphone   | amount | comment                  |
      | Merlina Morgan Tdd7 Autofe | 988 620 351 |    5.2 | prueba tdd a bcp con otp |
      | Merlina Morgan Tdd6 Autofe | jose tdd    |    5.2 | prueba tdd a bcp con otp |
