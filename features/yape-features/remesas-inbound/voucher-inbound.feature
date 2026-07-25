@squad-remesas-inbound
Feature: Remesas Voucher Inbound - Home
    Como usuario de la aplicación Yape,
    Quiero poder acceder los vouchers de remesas,
    Y validar mis vouchers recibidos.

  Background:
    * el usuario Carla Heredia Remittance inicia sesión en Yape
    Given ingresa a la opción "Ver más" de los Home Items
    And que el usuario navega a la sección de remesas

  @TC-19
  Scenario: Validar el voucher inbound v2 en el home remesas al generar remesa C2C en soles.
    When selecciona el primer voucher de remesas
    Then se muestra el comprobante de la remesa
    And el voucher muestra el monto en soles

  @TC-20
  Scenario: Validar el voucher inbound v2  en el home remesas al generar remesa C2C en dolares.
    When selecciona el primer voucher de remesas en dólares
    Then se muestra el comprobante de la remesa
    And el voucher muestra el monto en dólares
