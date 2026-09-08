# Generado por Appium Recorder
# Author: Kevinarnold.zorem
# Fecha de creación: 2026-09-08T22:40:29.435Z
# locator-module: payment/showsales

@payment
Feature: Consulta de ventas

  @ventas @smoke_mobile @android
  Scenario Outline: [TC-10239][Happy Path][AUTO-FRONT] El usuario visualiza el mensaje de ausencia de ventas
    Given el usuario <username> inicia sesión en Yape
    When el usuario accede a la sección de ventas
    Then se muestra el mensaje de que aún no tiene ventas

    Examples:
      | username                |
      | Jose Mendoza Dni7 AutoFE |
