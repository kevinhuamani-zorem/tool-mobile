@interop
Feature: Verificación del Modal de Confirmación de TAPP - Happy Path
  Yo como usuario de Yape
  Quiero completar el flujo de verificación al presionar Empezar en el onboarding de TAPP

  Rule: Mostrar correctamente el modal de verificación al iniciar el onboarding de TAPP

    @TC-13555 @smoke_mobile
    Scenario Outline: [CDP_02][Happy Path][AUTO-FRONT][iOS] Validar modal de verificación al presionar Empezar - Usuario BCP y TD
      Given el usuario <username> inicia sesión en Yape
      When el usuario presiona el shortcut de TAPP desde el Home
      And el usuario presiona el botón Empezar
      Then se muestra el modal de verificación de TAPP correctamente

      Examples:
        | username                   |
        | Interop Automation NumReal |
