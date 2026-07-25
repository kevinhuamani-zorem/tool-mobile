@squad-yape-empresas-platform-solutions @regression
Feature: Yapeo a Yape Empresas

  @TC-10907 @happy-path @yapeoempresasincontacto
  Scenario Outline: Yapear de un yapero regular a yape empresas sin numero de contacto
    Given el usuario <username> inicia sesión en Yape
    When el usuario ingresa a la opcion de yapear
    And el usuario selecciona cerrar a la informacion
    And el usuario ingresa el nuevo numero telefonico a yapear: <cellphone>
    And ingresa el monto de yapear <amount>
    And ingresa un comentario <comment>
    And selecciona yapear
    Then el usuario deberia visualizar el winstate del yapeo
    And el usuario vuelve a Home desde winstate
    And se muestra nuevamente la pantalla del "Home"

    Examples:
      | username                    | cellphone | amount | comment                          |
      | Juan Carlos Castro Castillo | 999920323 |   1.00 | pago a yape empresa sin contacto |

  @TC-10902 @happy-path @yapeoempresas
  Scenario Outline: Validar texto limite de yapeo diario hasta 3000 soles para un yape empresa
    Given el usuario <username> inicia sesión en Yape
    When el usuario ingresa a la opcion de yapear
    And el usuario selecciona cerrar a la informacion
    And el usuario ingresa el nuevo numero telefonico a yapear: <cellphone>
    Then el usuario deberia visualizar el texto de limite de yapeo diario

    Examples:
      | username             | cellphone |
      | Comercial Prisma SAC | 999993255 |
