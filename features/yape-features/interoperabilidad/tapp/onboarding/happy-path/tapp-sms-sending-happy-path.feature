Feature: Envío de SMS en el onboarding de TAPP - Happy Path
  Yo como usuario de Yape
  Quiero completar el envío de SMS durante el onboarding de TAPP

  Rule: Completar correctamente el flujo de envío de SMS

    @interop @TC-13554
    Scenario Outline: [CDP_04][Happy Path][AUTO-FRONT][iOS] Validar pantalla de envío de SMS - Usuario BCP y TD
      Given el usuario <username> inicia sesión en Yape
      When el usuario presiona el shortcut de TAPP desde el Home
      And el usuario presiona el botón Empezar
      And el usuario presiona el botón Continuar del modal de verificación
      And el usuario presiona el botón Continuar de la pantalla asociar SIM
      Then se muestra la pantalla de envío de SMS correctamente

      Examples:
        | username             |
        | Interop Automation NumReal |

      @interop @TC-13162
    Scenario Outline: [CDP_04][Happy Path][AUTO-FRONT][Android] Validar pantalla de envío de SMS - Usuario BCP y TD
      Given el usuario <username> inicia sesión en Yape
      When el usuario presiona el shortcut de TAPP desde el Home
      And el usuario presiona el botón Empezar
      And el usuario presiona el botón Continuar del modal de verificación
      And el usuario presiona el botón Continuar de la pantalla asociar SIM
      Then se muestra la pantalla de envío de SMS correctamente

      Examples:
        | username             |
        | Interop Automation NumReal |