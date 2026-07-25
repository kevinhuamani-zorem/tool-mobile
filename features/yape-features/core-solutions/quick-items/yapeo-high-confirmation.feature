Feature: Confirmación de yapeo alto
  Yo como usuario de Yape
  Quiero validar el correcto funcionamiento de la "confirmación de yapeo alto"

  Rule: Configurar correctamente la confirmación de yapeo alto del usuario de Yape

    @squad-core-solutions
    Scenario Outline: Validar limites en el monto ingresado Minimo 1 Maximo 500
      Given el usuario <username> inicia sesión en Yape
      And el usuario abre el menu hamburguesa
      When el usuario ingresa a la opción "Confirmación de yapeo alto"
      Then se muestran correctamente los elementos de la pantalla
      And se valida que la confirmación de Yapeo Alto funcione correctamente al activar y desactivar la opción

      Examples:
        | username             |
        | Andree 29 BCPNegocio |
        | Andree 004 OEFNiubiz       |
        | Andree 19 TDYape           |
        | Andree 02 BCPSinDni        |
        
    @squad-core-solutions
    Scenario Outline: TC-11874 - Deshabilitar confirmacion de yapeo alto
      Given el usuario <username> inicia sesión en Yape
      And el usuario abre el menu hamburguesa
      When el usuario ingresa a la opción "Confirmación de yapeo alto"
      And la confirmacion de yapeo alto se encuentran habilitada
      When el usuario deshabilita la Confirmación de yapeo alto
      Then se muestra el mensaje de confirmación de guardado

      Examples:
        | username             |
        | Andree 004 OEFNiubiz |
        | Andree 19 TDYape     |
        | Andree 02 BCPSinDni  |