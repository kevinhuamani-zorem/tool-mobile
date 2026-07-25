Feature: Validar el flujo de yape hijos
  Yo como usuario de Yape 
  Quiero añadir a mi cuentas relacionadas correctamente como hijos
  Y poder ver las funcionalidades disponibles desde mi home yape hijos

    @squad-core-solutions
    Scenario Outline: Confirmación exitosa al afiliar un hijo por primera vez siendo usuario padre
      Given el usuario <username> inicia sesión en Yape
      And selecciona el atajo "Hijos" en el home
      And selecciona el botón "Empezar" de la pantalla informativa de Yape Hijos
      And selecciona la cuenta a migrar como hijo
      And selecciona el botón "Continuar" de la pantalla de listado de cuentas
      And ingresa el alias del hijo "Carol Hijo"
      And selecciona la fecha de nacimiento del hijo
      And marca la casilla de declaración jurada
      And selecciona el botón "Continuar" de la pantalla de confirmación de datos
      And ingresa el código OTP
      And selecciona el botón "Continuar" de la pantalla de confirmación del OTP
      Then verifica que se muestre la pantalla de confirmación exitosa
      Examples:
        | username                   |
        | Carol 13 BCPUsuarioPiloto  |
