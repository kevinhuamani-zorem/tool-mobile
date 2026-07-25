@reset
Feature: Consulta de Saldo

  @balance
  Scenario: [CDP_02][Unhappy Path][AUTO-FRONT] Consulta de Saldo - Usuario No BCP
    Given el usuario Backfunds E2E VISA inicia sesión en Yape
    Then  el usuario no podra ver su saldo
