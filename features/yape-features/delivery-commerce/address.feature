@marketplace
@address
Feature: Agregar dirección en Yape
  Como usuario de Yape
  Quiero agregar una dirección a mi perfil
  Para poder recibir servicios personalizados

  Scenario Outline: Validar dirección de usuario
    Given el usuario Carlos Barboza TFT inicia sesión en Yape
    When el usuario selecciona la opcion tienda
    Then validar dirección
      | Jirón Lima | Barranco | 2 |
