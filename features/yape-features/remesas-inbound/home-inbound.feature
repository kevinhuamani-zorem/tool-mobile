@squad-remesas-inbound
Feature: Remesas Inbound - Home
    Como usuario de la aplicación Yape,
    Quiero poder acceder al menu de remesas,
    Para visualizar mis remesas recibidas, consultar mi número de cuenta USD,
    Y gestionar la visualización de mis saldos en diferentes monedas.

  Background:
    * el usuario Carla Heredia Remittance inicia sesión en Yape
    Given ingresa a la opción "Ver más" de los Home Items
    And que el usuario navega a la sección de remesas

  @TC-12
  Scenario: Validar boton de compartir en home#remesas
    When hace click en la opción Compartir
    Then se muestra el modal de compartir con el texto "Compartir texto"

  @TC-11
  Scenario: Validar que el boton atrás en remesas te redirija al home
    Given el usuario está en la sección de remesas
    When selecciona el botón "Atras"
    Then se debe mostrar el boton yapear en el home

  @TC-13
  Scenario: Validar campo numero de cuenta en USD para home#remesas
    Given el usuario está en la sección de remesas
    When se muestra el campo de número de cuenta en USD
    Then el número de cuenta debe tener el formato correcto

  @TC-14
  Scenario: Validar que existan el tag de dolares y el tag de soles en la vista de remesas
    Then se visualiza el tag de "Dólares"
    And se visualiza el tag de "Soles"

  @TC-15
  Scenario: Validar boton Mostrar dolares en Home#Remesas
    When hace click en el botón "Mostrar dólares"
    Then se muestra la información de remesas en dólares

  @TC-16
  Scenario: Validar boton Quiero recibir en Home#Remesas
    When hace click en el botón "Quiero recibir"
    Then se muestra la pantalla de información para recibir remesas
