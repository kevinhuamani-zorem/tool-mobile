# Generado por Appium Recorder
# Author: Kevinarnold.zorem
# Fecha de creación: 2026-09-09T02:17:11.222Z
# locator-module: payment/movements

@payment
Feature: Confirmacion envio correo reporte

  @correo @smoke_mobile @android
  Scenario Outline: [TC-10251][Happy Path][AUTO-FRONT] Confirmacion envio correo reporte
    Given el usuario <username> inicia sesión en Yape
    When el usuario consulta todos sus movimientos
    And el usuario selecciona envia el reporte al correo por defecto del cliente
    Then confirmacion de envio de correo

    Examples:
      | username |
      | Jose Mendoza Dni7 AutoFE |
