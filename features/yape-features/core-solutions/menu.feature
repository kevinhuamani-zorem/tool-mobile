Feature: Validar componentes del menú del usuario de Yape
  Yo como usuario de Yape 
  Quiero visualizar correctamente el menú del usuario
  Y las funcionalidades disponibles según el perfil del usuario

  Rule: Mostrar todas las funcionalidades disponibles para el usuario de Yape en el menú

    @nexus_user_menu @YAPEEG-16615
    Scenario Outline: Validar existencia de elementos visibles en el menú lateral según perfil
      Given el usuario <username> inicia sesión en Yape
      And el usuario abre el menu hamburguesa
      Then se muestra correctamente el menu del usuario
      And se muestran las opciones "Mi Cuenta" y "Ajustes" y sus sub-opciones para el usuario de acuerdo a su perfil
      And se muestra la version de Yape, el tipo de cuenta, el nombre comercial y el RUC
      And se muestran los Términos y Condiciones, la Política de privacidad y Cerrar sesión

      Examples:
        | username                   |
        | Andree 02 BCPSinDni        |
        | Andree 004 OEFNiubiz       |
        | Andree 19 TDYape           |
        | Andree 29 BCPNegocio       |

    @nexus_user_menu @YAPEEG-19741 @YAPEEG-19742
    Scenario Outline: Verificar las funcionalidades en el menú para los perfiles Yape Hijos
      Given el usuario <username> inicia sesión en Yape
      And el usuario ingresa al home
      And el usuario visualiza su nombre en el home
      When el usuario abre el menu hamburguesa del home
      Then el usuario visualiza las siguientes funcionalidades en su mundo correspondiente del menu de Yape Hijos:
        | mundo     | funcionalidades            |
        | Ajustes   | Biometría digital          |
        | Ajustes   | Confirmación de yapeo alto |
        | Mi cuenta | Mis datos                  |
        | Mi cuenta | Mi QR                      |
        | Mi cuenta | Cambiar mi clave           |

      Examples:
        | username            |
        | Carol 51 YAPEHIJOS  |
        | Carol 52 YAPEHIJOS  |   