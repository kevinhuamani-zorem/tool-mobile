@reset
Feature: Consulta de Saldo

  @balance
  Scenario Outline: [CDP_01][Happy Path][AUTO-FRONT] Consulta de Saldo - Usuario BCP y TDD
    Given el usuario <username> inicia sesión en Yape
    When el usuario selecciona la opcion Mostrar Saldo
    Then se muestra el saldo al usuario
    When el usuario selecciona la opcion Ocultar Saldo
    Then el usuario dejara de ver su saldo en la pantalla principal

    Examples:
      | username          |
      | Backfunds E2E BCP |
      | Backfunds e2e Td  |
