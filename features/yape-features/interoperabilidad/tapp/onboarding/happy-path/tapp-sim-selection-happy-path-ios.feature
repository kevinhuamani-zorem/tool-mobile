@interop
Feature: Selección de SIM en el onboarding de TAPP - Happy Path
  Yo como usuario de Yape
  Quiero visualizar la pantalla de selección de SIM al continuar con el onboarding de TAPP

  Rule: Mostrar correctamente la pantalla de selección de SIM tras confirmar el modal de verificación

    @TC-13557 @smoke_mobile
    Scenario Outline: [CDP_03][Happy Path][AUTO-FRONT][iOS] Validar pantalla de selección de SIM - Usuario BCP y TD
      Given el usuario <username> inicia sesión en Yape
      When el usuario presiona el shortcut de TAPP desde el Home
      And el usuario presiona el botón Empezar
      And el usuario presiona el botón Continuar del modal de verificación
      Then se muestra la pantalla de selección de SIM correctamente

      Examples:
        | username                   |
        | Interop Automation NumReal |
