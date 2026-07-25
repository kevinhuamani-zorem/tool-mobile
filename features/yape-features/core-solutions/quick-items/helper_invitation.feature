Feature: Validar notificación de invitación a ser ayudante
  Yo como usuario de Yape
  Quiero validar la notificación de invitación a ser ayudante
  Para poder aceptar o rechazar la invitación correctamente

  Rule: Mostrar correctamente la notificación de invitación a ser ayudante

    @helper_invitation @YAPEEG-18535 @nexus_user_menu
    Scenario Outline: Validar notificación de invitación a ser ayudante
      Given el usuario <username> inicia sesión en Yape
      Then se muestra la notificación de invitación a ser ayudante
      And la notificación contiene los elementos correctos
      And se puede aceptar o rechazar la invitación

      Examples:
        | username       |
        | Nexus 29 BCPNI |
