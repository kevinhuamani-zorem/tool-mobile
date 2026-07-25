Feature: Pantalla de ingreso de datos de tarjeta en onboarding TAPP
  Yo como usuario de Yape
  Quiero validar la pantalla de datos de tarjeta luego de seleccionar una cuenta

  Rule: Mostrar correctamente la pantalla de datos de tarjeta despues de elegir una cuenta

    @squad-interoperabilidad @TC-19373
    Scenario Outline: [CDP_09][TAPP][Happy Path] Validar pantalla de ingreso de datos de tarjeta
      Given el usuario <username> inicia sesión en Yape
      When el usuario presiona el shortcut de TAPP desde el Home
      And el usuario presiona el botón Empezar
      And el usuario presiona el botón Continuar del modal de verificación
      And el usuario presiona el botón Continuar de la pantalla asociar SIM
      And el usuario presiona el botón Enviar SMS
      And el usuario presiona el botón Añadir cuenta
      And el usuario selecciona su banco
      And el usuario selecciona su cuenta de banco
      Then se muestra la pantalla de ingreso de datos de tarjeta correctamente

      Examples:
        | username             |
        | Interop Automation BCPDNI |
        | Interop Automation 02BCPsinDni |
        | Interop Automation BCPNEGOCIOS |

