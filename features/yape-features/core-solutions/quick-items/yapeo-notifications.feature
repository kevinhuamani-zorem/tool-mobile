Feature: Notificaciones por yapeo
  Yo como usuario de Yape
  Quiero validar el correcto funcionamiento de las "notificaciones por yapeo"

  Rule: Configurar correctamente las notificaciones por yapeo del usuario de Yape

    @squad-core-solutions @YAPEEG-18693 @nexus_user_menu
    Scenario Outline: Validar elementos del QuickSubItem Notificaciones por yapeo
      Given el usuario <username> inicia sesión en Yape
      And el usuario abre el menu hamburguesa
      Then ingresa a la opción "Notificaciones por yapeo"
      Then se visualizan correctamente los elementos de la pantalla "Notificaciones por yapeo"
      And se escoge el monto <amount> para las "Notificaciones por yapeo"

      Examples:
        | username            | amount |
        | Andree 02 BCPSinDni |    500 |
        | Andree 02 BCPSinDni |    100 |
        | Andree 02 BCPSinDni |     50 |
        | Andree 02 BCPSinDni |     10 |

    @squad-core-solutions
    Scenario Outline: TC-11897 - Deshabilitar notificaciones por yapeo
      Given el usuario <username> inicia sesión en Yape
      And el usuario abre el menu hamburguesa
      And ingresa a la opción "Notificaciones por yapeo"
      And las notificaciones por yapeo se encuentran habilitadas
      When el usuario deshabilita las notificaciones por yapeo
      Then se muestra el mensaje de confirmación de guardado

      Examples:
        | username            |
        | Andree 02 BCPSinDni |