Feature: Mostrar los datos del usuario en la opción "Mis Datos"
  Yo como usuario de Yape 
  Quiero visualizar correctamente mis datos

  Rule: Mostrar por defecto el correo electrónico del usuario ofuscado y al hacer tap en el ojito se debe mostrar el correo electrónico sin ofuscar

    @squad-core-solutions
    Scenario Outline: TC-11631 - Validar elementos de mis datos y comportamiento del componente mostrar-ofuscar email (ojito)
      Given el usuario <username> inicia sesión en Yape
      And el usuario abre el menu hamburguesa
      And el usuario ingresa a la opción "Mis datos"
      And se muestra correctamente la pantalla "Mis datos"
      Then se muestra el nombre del usuario, número de teléfono y correo electrónico ofuscado
      And el usuario presiona el botón "ojito" y el correo electrónico del usuario se muestra sin ofuscar

      Examples:
        | username                   |
        | Andree 004 OEFNiubiz       |
        | Andree 19 TDYape           |
        | Andree 02 BCPSinDni        |