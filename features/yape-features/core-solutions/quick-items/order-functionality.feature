Feature: Ordenamiento de funcionalidades recomendadas
  Yo como usuario de Yape
  Quiero visualizar las funcionalidades recomendadas en el orden correcto
  Para acceder rápidamente a las opciones más relevantes dentro del buscador

  Rule: Validar el orden de funcionalidades recomendadas desde el Home

    @order_functionality @YAPEEG-17311 @nexus_user_menu
    Scenario Outline: Validar el ordenamiento de funcionalidades recomendadas
      Given el usuario <username> inicia sesión en Yape
      And el usuario ingresa al buscador desde el Home
      Then se valida el orden de funcionalidades recomendadas

      Examples:
        | username                |
        | Andree 19 TDYape        |
        | Nexusaut 09 BCPAdvanced |
