@squad-tipo-de-cambio @regression @exchange-rate-home
Feature: Esta funcionalidad es para validar el home de Tipo de Cambio

  @TC-25666 @smoke @happy-path @working @access-exchange-rate-home
  Scenario Outline: Usuario ingresa al Home de Tipo de Cambio
    Given el usuario <username> inicia sesión en Yape
    And el usuario ingresa a cambiar dólares desde el home de yape

    Examples:
      | username                              |
      | Pedro Perez CertificacionOchentayseis |

  @TC-17492 @unhappy-path @working @card-blocked
  Scenario Outline: Usuario con tarjeta bloqueada intenta acceder al Home de Tipo de Cambio
    Given el usuario <username> inicia sesión en Yape
    When el usuario ingresa a cambiar dólares desde el home de yape
    Then se muestra la pantalla de error <title> con el mensaje <message>
    And el usuario puede regresar al home presionando "Ir al Inicio" desde la pantalla de error

    Examples:
      | username                              | title                                           | message                                                                                                                                          |
      | Pedro Perez Certidoscientosveinte     | Tu tarjeta está bloqueada o vencida             | Contacta al BCP o acércate a una Agencia BCP para solicitar una nueva tarjeta. Si ya tienes tu tarjeta crea tu cuenta por la página web del BCP. |