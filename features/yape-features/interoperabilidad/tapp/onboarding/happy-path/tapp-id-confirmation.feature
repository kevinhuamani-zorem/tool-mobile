Feature: Confirmación de creación de Tapp ID en el onboarding de TAPP - Happy Path
  Yo como usuario de Yape
  Quiero visualizar correctamente la pantalla de confirmación de Tapp ID creado

  Rule: Mostrar correctamente la pantalla de confirmación luego del envío de SMS y validación de datos

    @interop @TC-13164
    Scenario Outline: [CDP_06][Happy Path][AUTO-FRONT][iOS] Validar pantalla de Tapp ID creado - Usuario BCP y TD
      Given el usuario <username> inicia sesión en Yape
      When el usuario presiona el shortcut de TAPP desde el Home
      And el usuario presiona el botón Empezar
      And el usuario presiona el botón Continuar del modal de verificación
      And el usuario presiona el botón Continuar de la pantalla asociar SIM
      And el usuario presiona el botón Enviar SMS
      Then se muestra la pantalla de confirmación de Tapp ID correctamente

      Examples:
        | username             |
        | Interop E2E BCP Real |