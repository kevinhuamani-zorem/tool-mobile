Feature: Eliminar colaborador existente
  Yo como usuario de Yape
  Quiero eliminar un colaborador existente
  Para gestionar mis ayudantes en el mundo empresa

  Rule: Eliminar colaborador existente

    @helper_discard @YAPEEG-19352 @nexus_user_menu
    Scenario Outline: Eliminar colaborador cuando ya está agregado
      Given el usuario <username> inicia sesión en Yape
      When ingresa a la opción "Ver más" de los Home Items
      And ingresa al mundo "Empresa"
      And hace click en el sub mundo "Mis ayudantes"
      Then se comprueba que todos los elementos estén presentes en Mis ayudantes
      When presiona el botón "Eliminar colaborador"
      Then se comprueba que todos los elementos de eliminar colaborador estén presentes

      Examples:
        | username             |
        | Andree 29 BCPNegocio |
