Feature: Validar búsqueda de keywords por mundo de funcionalidades
  Yo como usuario de Yape
  Quiero buscar funcionalidades mediante keywords
  Para acceder correctamente a funcionalidades según el mundo y mi tipo de usuario

  Rule: Validar búsqueda de keywords de las funcionalidades del mundo Yapeos

    @nexus_user_menu @search_keywords @yapeos @YAPEEG-20238
    Scenario Outline: Validar búsqueda de keywords de las funcionalidades del mundo Yapeos
      Given el usuario <username> inicia sesión en Yape
      And el usuario ingresa al buscador desde el Home
      When el usuario busca keywords de las funcionalidades del mundo Yapeos
      Then se muestran las funcionalidades correspondientes al mundo Yapeos
      And cuando el usuario busca una keyword inexistente del mundo Yapeos se muestra el estado sin resultados

      Examples:
        | username                |
        | Nexusaut 09 BCPAdvanced |
        | Andree 19 TDYape        |

  Rule: Validar búsqueda de keywords de las funcionalidades del mundo Finanzas

    @nexus_user_menu @search_keywords @finanzas @YAPEEG-20238
    Scenario Outline: Validar búsqueda de keywords de las funcionalidades del mundo Finanzas
      Given el usuario <username> inicia sesión en Yape
      And el usuario ingresa al buscador desde el Home
      When el usuario busca keywords de las funcionalidades del mundo Finanzas
      Then se muestran las funcionalidades correspondientes al mundo Finanzas
      And cuando el usuario busca una keyword inexistente del mundo Finanzas se muestra el estado sin resultados

      Examples:
        | username                |
        | Nexusaut 09 BCPAdvanced |
        | Andree 19 TDYape        |

  Rule: Validar búsqueda de keywords de las funcionalidades del mundo Compras

    @nexus_user_menu @search_keywords @compras @YAPEEG-20238
    Scenario Outline: Validar búsqueda de keywords de las funcionalidades del mundo Compras
      Given el usuario <username> inicia sesión en Yape
      And el usuario ingresa al buscador desde el Home
      When el usuario busca keywords de las funcionalidades del mundo Compras
      Then se muestran las funcionalidades correspondientes al mundo Compras
      And cuando el usuario busca una keyword inexistente del mundo Compras se muestra el estado sin resultados

      Examples:
        | username                |
        | Nexusaut 09 BCPAdvanced |
        | Andree 19 TDYape        |