Feature: Selección de banco en el onboarding de TAPP - Happy Path
  Yo como usuario de Yape
  Quiero visualizar correctamente la pantalla Selecciona tu banco durante el onboarding de TAPP

  Rule: Mostrar correctamente la pantalla de selección de banco luego de crear el Tapp ID

    @interop @TC-14523
    Scenario Outline: [CDP_07][Happy Path][AUTO-FRONT][iOS] Validar pantalla Selecciona tu banco - Usuario BCP y TD
      Given el usuario <username> inicia sesión en Yape
      When el usuario presiona el shortcut de TAPP desde el Home
      And el usuario presiona el botón Empezar
      And el usuario presiona el botón Continuar del modal de verificación
      And el usuario presiona el botón Continuar de la pantalla asociar SIM
      And el usuario presiona el botón Enviar SMS
      And el usuario presiona el botón Añadir cuenta
      Then se muestra la pantalla Selecciona tu banco correctamente

      Examples:
        | username             |
        | Interop E2E BCP Real |
