@interop
Feature: Registro de Consentimiento - Happy Path
  Yo como usuario de Yape
  Quiero completar el flujo de registro de consentimiento en TAPP

  Rule: Mostrar correctamente la pantalla introductoria del onboarding de TAPP

    @ios @TC-13556 @smoke_mobile
    Scenario Outline: [CDP_01][Happy Path][AUTO-FRONT][iOS] Registro de Consentimiento - Usuario BCP y TD
      Given el usuario <username> inicia sesión en Yape
      When el usuario presiona el shortcut de TAPP desde el Home
      Then se muestra la pantalla introductoria del onboarding de TAPP correctamente

      Examples:
        | username                   |
        | Interop Automation NumReal |
