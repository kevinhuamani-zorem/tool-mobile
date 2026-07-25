Feature: Validar derivacion de keywords por mundo de funcionalidades
    Yo como usuario de Yape
    Quiero buscar funcionalidades mediante keywords
    Para acceder correctamente a funcionalidades según el mundo y mi tipo de usuario

  @nexus_user_menu @derivation_keywords @TC-11503 @Payments
  Scenario Outline: Validar derivación al Home de la funcionalidad del mundo Payments <functionalityName> <username>
    Given el usuario <username> inicia sesión en Yape
    And el usuario ingresa al buscador desde el Home
    When el usuario busca el keyword de una funcionalidad <functionalityName> del mundo <Mundo> para realizar la derivación
    Then se muestra la pantalla de inicio de la funcionalidad correspondiente al keyword buscado del mundo <Mundo>

    Examples:
      | username                | Mundo    | functionalityName |
      | Nexusaut 09 BCPAdvanced | Payments | Yapear servicios  |
      | Andree 19 TDYape        | Payments | Yapear servicios  |
      | Nexusaut 09 BCPAdvanced | Payments | Aprobar compras   |
      | Nexusaut 09 BCPAdvanced | Payments | Recargar celular  |
      | Nexusaut 09 BCPAdvanced | Payments | Dólares           |
      | Andree 19 TDYape        | Payments | Aprobar compras   |
      | Andree 19 TDYape        | Payments | Recargar celular  |
      | Andree 20 TDReceptor    | Payments | Dólares           |

  @nexus_user_menu @derivation_keywords @TC-11502 @Finance
  Scenario Outline: Validar derivación al Home de la funcionalidad del mundo Finance <functionalityName> <username>
    Given el usuario <username> inicia sesión en Yape
    And el usuario ingresa al buscador desde el Home
    When el usuario busca el keyword de una funcionalidad <functionalityName> del mundo <Mundo> para realizar la derivación
    Then se muestra la pantalla de inicio de la funcionalidad correspondiente al keyword buscado del mundo <Mundo>

    Examples:
      | username             | Mundo   | functionalityName |
      | Andree 003 BCPConDni | Finance | Créditos          |
      | Andree 003 BCPConDni | Finance | SOAT              |
      | Andree 003 BCPConDni | Finance | Remesas           |
      | Andree 003 BCPConDni | Finance | Mundo Protección  |
      | Andree 20 TDReceptor | Finance | Créditos          |
      | Andree 20 TDReceptor | Finance | SOAT              |
      | Andree 20 TDReceptor | Finance | Remesas           |
      | Andree 20 TDReceptor | Finance | Mundo Protección  |

  @nexus_user_menu @derivation_keywords @TC-14105 @Help
  Scenario Outline: Validar derivación al Home de la funcionalidad del mundo Help <functionalityName> <username>
    Given el usuario <username> inicia sesión en Yape
    And el usuario ingresa al buscador desde el Home
    When el usuario busca el keyword de una funcionalidad <functionalityName> del mundo <Mundo> para realizar la derivación
    Then se muestra la pantalla de inicio de la funcionalidad correspondiente al keyword buscado del mundo <Mundo>

    Examples:
      | username                | Mundo | functionalityName |
      | Nexusaut 09 BCPAdvanced | Help  | Centro de ayuda   |
      | Andree 19 TDYape        | Help  | Centro de ayuda   |

  @nexus_user_menu @derivation_keywords @TC-14106 @Menu
  Scenario Outline: Validar derivación al Home de la funcionalidad del mundo Menu <functionalityName> <username>
    Given el usuario <username> inicia sesión en Yape
    And el usuario ingresa al buscador desde el Home
    When el usuario busca el keyword de una funcionalidad <functionalityName> del mundo <Mundo> para realizar la derivación
    Then se muestra la pantalla de inicio de la funcionalidad correspondiente al keyword buscado del mundo <Mundo>

    Examples:
      | username             | Mundo | functionalityName          |
      | Andree 003 BCPConDni | Menu  | Mi QR                      |
      | Andree 003 BCPConDni | Menu  | Notificaciones por yapeo   |
      | Andree 003 BCPConDni | Menu  | Mis datos                  |
      | Andree 003 BCPConDni | Menu  | Biometría digital          |
      | Andree 003 BCPConDni | Menu  | Compras por internet y POS |
      | Andree 003 BCPConDni | Menu  | Límites transaccionales    |
      | Andree 003 BCPConDni | Menu  | Confirmación de yapeo alto |
      | Andree 20 TDReceptor | Menu  | Mi QR                      |
      | Andree 20 TDReceptor | Menu  | Notificaciones por yapeo   |
      | Andree 20 TDReceptor | Menu  | Mis datos                  |
      | Andree 20 TDReceptor | Menu  | Biometría digital          |
      | Andree 20 TDReceptor | Menu  | Compras por internet y POS |
      | Andree 20 TDReceptor | Menu  | Límites transaccionales    |
      | Andree 20 TDReceptor | Menu  | Confirmación de yapeo alto |
