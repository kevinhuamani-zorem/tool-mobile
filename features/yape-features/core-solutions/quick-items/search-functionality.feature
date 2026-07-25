Feature: Búsqueda por funcionalidad
  Yo como usuario de Yape
  Quiero realizar búsquedas dentro del aplicativo
  Para acceder rápidamente a funcionalidades disponibles según el keyword ingresado

  Rule: Validar el comportamiento del buscador desde el Home

    @search_functionality @YAPEEG-17310 @nexus_user_menu
    Scenario Outline: Validar la búsqueda por funcionalidad
      Given el usuario <username> inicia sesión en Yape
      And el usuario ingresa al buscador desde el Home
      Then se busca y valida cada funcionalidad en el buscador
        | Yapear servicios     |
        | Entradas             |
        | Gaming               |
        | Promos               |
        | Viajar en bus        |
        | Tienda               |
        | SOAT                 |
        | Remesas              |
        | Seguros              |
        | Dólares              |
        | Recargar celular     |
        | Codigo de aprobación |
        | Biometría digital    |

      Examples:
        | username                |
        | Nexusaut 09 BCPAdvanced |
