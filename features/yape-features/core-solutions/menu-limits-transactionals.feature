Feature: Validar pantalla de límites transaccionales y cambiar mi límite
  Yo como usuario de Yape 
  Quiero visualizar correctamente la pantalla de límites transaccionales
  Y las funcionalidades disponibles según lo guardado en mi perfil

  Rule: Mostrar correctamente y poder cambiar mi límite de la pantalla de "Limites Transaccionales"

    @menu_limits_transac @YAPEEG-17282
    Scenario Outline: Validar cambio de límite transaccional cuando el usuario tiene un monto mayor
      Given el usuario <username> inicia sesión en Yape
      When el usuario da click al menu del home
      And hace clic en la opción límites transaccionales del menu
      Then se muestra correctamente la pantalla de límites transaccionales
      And se visualiza el límite actual de yapeo del usuario
      When el usuario da click en el botón cambiar
      Then se completa el cambio de limite

      Examples:
        | username                   |
        | Andree 003 BCPConDni       |