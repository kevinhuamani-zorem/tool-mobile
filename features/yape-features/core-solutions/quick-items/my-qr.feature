Feature: Mostrar el QuickItem "Mi QR"
  Yo como usuario de Yape
  Quiero visualizar correctamente el QuickItem "Mi QR"
  Y las opciones de Compartir y Descargar

  Rule: Mostrar el QR del usuario desde los QuickItems del usuario

    @mi_qr_download @YAPEEG-2860 @nexus_user_menu
    Scenario Outline: Validar mensaje de confirmación al descargar el QR
      Given el usuario <username> inicia sesión en Yape
      And el usuario abre el menu hamburguesa
      And el usuario ingresa a la opción "Mi QR"
      Then se muestra el QR del usuario y el botón "Comparte y descarga tu QR"
      And el usuario ingresa a "Comparte y descarga tu QR"
      Then Se muestra el código QR con el texto "Paga aquí con Yape", el nombre del usuario y los botones "Compartir" y "Descargar"
      And el usuario presiona el botón "Descargar" y se muestra el mensaje toast"

      Examples:
        | username                   |
        | Andree 02 BCPSinDni        |
        | Andree 004 OEFNiubiz       |
        | Andree 19 TDYape           |
        | Andree 29 BCPNegocio       |