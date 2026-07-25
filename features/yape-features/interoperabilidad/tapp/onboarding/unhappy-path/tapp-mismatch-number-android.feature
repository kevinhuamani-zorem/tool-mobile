@interop
Feature: Verificación del modal Tu número no coincide con el de Yape - Unhappy Path Android
  Yo como usuario de Yape
  Quiero validar el modal informativo cuando el número no coincide con mi cuenta Yape

  Rule: Mostrar el modal de bloqueo cuando el número no coincide con Yape

    @smoke_mobile @TC-28567
    Scenario Outline: [CDP_09][Unhappy Path][AUTO-FRONT][ANDROID] Validar modal de número no coincide
      Given el usuario <username> inicia sesión en Yape
      When el usuario presiona el shortcut de TAPP desde el Home
      And el usuario presiona el botón Empezar
      And el usuario presiona el botón Continuar del modal de verificación
      And el usuario presiona el botón Continuar de la pantalla asociar SIM
      Then se muestra el modal de número no coincide con Yape correctamente

      Examples:
        | username             |
        | Interop E2E BCP Real |
