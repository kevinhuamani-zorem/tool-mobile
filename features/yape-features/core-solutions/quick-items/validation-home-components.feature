Feature: Mostrar los componentes del home para diferentes providers
  Yo como usuario de Yape
  Quiero visualizar correctamente los componentes estándar del home 

  Rule: Mostrar los componentes estándar del home según el perfil

    @home @YAPEEG-19351 @nexus_user_menu
    Scenario Outline: Validar elementos del home y visibilidad de componentes estándar
      Given el usuario <username> inicia sesión en Yape
      And se muestra correctamente la pantalla de home
      And se muestra el icono del menú
      And se muestra el icono de ayuda
      And se muestra el icono de campanita
      And se muestra el buscador como "Buscar en yape"
      And se muestra la barra de banners disponibles para el perfil
      And se muestra el saldo correspondiente
      And se muestran los movimientos recientes
      And se muestra el botón de "escanear qr"
      And se muestra el botón de "yapear"

      Examples:
        | username                 |
        | Andree 19 TDYape         |
        | Andree 29 BCPNegocio     |

  Rule: Verificar los home items configurados por perfil de usuario
      - Los usuarios de Yape pueden visualizar accesos directos (shortcuts) en el Home, para navegar directamente a las funcionalidades configuradas por perfil de usuario.

      @home_items @YAPEEG-18928

      Scenario Outline: Validar elementos de los Home Items según perfil de usuario
        Given el usuario <username> inicia sesión en Yape
        Then se muestran los home items configurados para el perfil

        Examples:
          | username           |
        | Andree 19 TDYape         |
        | Andree 29 BCPNegocio     |
