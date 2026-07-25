@interop
Feature: Verificación de datos en el onboarding de TAPP - Happy Path
  Yo como usuario de Yape
  Quiero visualizar la pantalla de verificación de datos durante el onboarding de TAPP

  Rule: Mostrar correctamente la pantalla de verificación de datos tras asociar SIM

    @TC-14101 @smoke_mobile
    Scenario Outline: [CDP_05][Happy Path][AUTO-FRONT][Android] Validar pantalla de verificación de datos de TAPP - Usuario BCP y TD
      Given el usuario <username> inicia sesión en Yape
      When el usuario presiona el shortcut de TAPP desde el Home
      And el usuario presiona el botón Empezar
      And el usuario presiona el botón Continuar del modal de verificación
      And el usuario presiona el botón Continuar de la pantalla asociar SIM
      And el usuario presiona el botón Enviar SMS
      Then se muestra la pantalla de verificación de datos de TAPP correctamente

      Examples:
        | username                   |
        | Interop Automation NumReal |

