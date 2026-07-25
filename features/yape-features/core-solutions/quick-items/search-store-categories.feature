Feature: Validar búsqueda de categorías de Tienda por keywords en el Buscador
  Yo como usuario de Yape
  Quiero buscar categorías de Tienda mediante keywords
  Para acceder correctamente a las categorías esperadas según la macro categoría

  Rule: Validar búsqueda por keyword de categorías de Tienda de la macro categoría Tecnología

    @nexus_user_menu @search_store_categories @YAPEEG-20233
    Scenario Outline: Validar búsqueda por keyword de categorías de Tienda - Tecnología
      Given el usuario <username> inicia sesión en Yape
      And el usuario ingresa al buscador desde el Home
      When el usuario busca keywords de las categorías de tienda de la macro categoría Tecnología
      Then se muestran las categorías correspondientes a la macro categoría Tecnología
      And cuando el usuario busca una keyword inexistente de la macro categoría Tecnología se muestra el estado sin resultados

      Examples:
        | username                |
        | Nexusaut 09 BCPAdvanced |
        | Andree 19 TDYape        |

  Rule: Validar búsqueda por keyword de categorías de Tienda de la macro categoría Hogar

    @nexus_user_menu @search_store_categories @YAPEEG-20235
    Scenario Outline: Validar búsqueda por keyword de categorías de Tienda - Hogar
      Given el usuario <username> inicia sesión en Yape
      And el usuario ingresa al buscador desde el Home
      When el usuario busca keywords de las categorías de tienda de la macro categoría Hogar
      Then se muestran las categorías correspondientes a la macro categoría Hogar
      And cuando el usuario busca una keyword inexistente de la macro categoría Hogar se muestra el estado sin resultados

      Examples:
        | username                |
        | Nexusaut 09 BCPAdvanced |
        | Andree 19 TDYape        |

  Rule: Validar búsqueda por keyword de categorías de Tienda de la macro categoría Consumo

    @nexus_user_menu @search_store_categories @YAPEEG-20236
    Scenario Outline: Validar búsqueda por keyword de categorías de Tienda - Consumo
      Given el usuario <username> inicia sesión en Yape
      And el usuario ingresa al buscador desde el Home
      When el usuario busca keywords de las categorías de tienda de la macro categoría Consumo
      Then se muestran las categorías correspondientes a la macro categoría Consumo
      And cuando el usuario busca una keyword inexistente de la macro categoría Consumo se muestra el estado sin resultados

      Examples:
        | username                |
        | Nexusaut 09 BCPAdvanced |
        | Andree 19 TDYape        |
