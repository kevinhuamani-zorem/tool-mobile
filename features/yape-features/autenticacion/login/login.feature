Feature: Login Yape Happy Path

  @login
  Scenario Outline: [CDP_01][Happy Path][AUTO-FRONT] Login Exitoso BCP con manejo de data externa
    Given el usuario está registrado en Yape y presiona el boton "Ya tengo una cuenta"
    And poblamos los datos del usuario <username>
    And el usuario <username> ingresa su correo y password
    And el usuario ingresa su código OTP, obtenido del celular
    And el usuario ingresa su código OTP de dispositivo, si se le solicita al <username>
    And el usuario hace tap en entendido y es redireccionado al unlock
    And el usuario <username> realiza unlock en Yape luego de redirección
    And cierra el popup de bienvenida siempre y cuando se muestre
    And se debe mostrar el boton yapear en el home

    Examples:
      | username                   |
      | Alejandro Ramos Foundation |

  @one_step_login @smoke_mobile @TC-9541
  Scenario Outline: [CDP_02][Happy Path][AUTO-FRONT] Login Exitoso BCP en un solo paso
    Given el usuario <username> inicia sesión en Yape

    Examples:
      | username      |
      | Login E2E BCP |

  @old_login
  Scenario Outline: [CDP_01][Happy Path][AUTO-FRONT] Login Exitoso BCP
    Given el usuario está registrado en Yape y presiona el boton "Ya tengo una cuenta"
    And el usuario ingresa su <username> y <password>
    And el usuario ingresa su código OTP, que le llega al <phone>
    And el usuario ingresa su código OTP de dispositivo, si se le solicita al <username>
    And cierra el popup de bienvenida siempre y cuando se muestre
    And se debe mostrar el boton yapear en el home

    Examples:
      | username                   | password | phone     |
      | LOGINE2EBCP@MAILINATOR.COM |   999999 | 993555011 |

  Scenario Outline: Login con pin directamente
    Given el usuario ingresa a yape solo con su "<pin>"

    Examples:
      | pin    |
      | 999999 |
