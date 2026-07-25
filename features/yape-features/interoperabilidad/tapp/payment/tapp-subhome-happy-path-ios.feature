@interop
Feature: Pantalla principal de TAPP onboardeada - Happy Path iOS
  Yo como usuario de Yape
  Quiero validar los elementos de la pantalla principal de TAPP luego de completar el onboarding

  Rule: Mostrar correctamente la pantalla principal de TAPP con sus secciones y acciones rápidas

    @TC-29936 @smoke_mobile
    Scenario Outline: [CDP_01][Happy Path][AUTO-FRONT][iOS] Validar pantalla de subhome - Usuario BCP y TD
      Given el usuario <username> inicia sesión en Yape
      When el usuario presiona el shortcut de TAPP desde el Home
      And el usuario presiona el botón Empezar
      And el usuario presiona el botón Continuar del modal de verificación
      And el usuario presiona el botón Continuar de la pantalla asociar SIM
      And el usuario presiona el botón Enviar SMS
      And el usuario presiona el botón Añadir cuenta
      And el usuario selecciona su banco
      And el usuario selecciona su cuenta de banco
      And el usuario presiona el botón Ingresar datos de tarjeta
      Then se muestra la pantalla principal de TAPP correctamente

      Examples:
        | username             |
        | Interop E2E BCP Real |
