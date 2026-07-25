Feature: Selección de cuenta en el onboarding de TAPP - Happy Path
  Yo como usuario de Yape
  Quiero visualizar correctamente la pantalla Elige una cuenta durante el onboarding de TAPP

  Rule: Mostrar correctamente la pantalla de selección de cuenta luego de crear el Tapp ID

    @squad-interoperabilidad @TC-16766
    Scenario Outline: [CDP_08][Happy Path][AUTO-FRONT][iOS] Validar pantalla Elige una cuenta - Usuario BCP y TD
      Given el usuario <username> inicia sesión en Yape
      When el usuario presiona el shortcut de TAPP desde el Home
      And el usuario presiona el botón Empezar
      And el usuario presiona el botón Continuar del modal de verificación
      And el usuario presiona el botón Continuar de la pantalla asociar SIM
      And el usuario presiona el botón Enviar SMS
      And el usuario presiona el botón Añadir cuenta
      And el usuario selecciona su banco
      Then se muestra la pantalla Elige una cuenta correctamente

      Examples:
        | username             |
        | Interop E2E BCP Real |
