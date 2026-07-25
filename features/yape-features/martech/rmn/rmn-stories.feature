@regression @squad-martech @rmn
Feature: Historias - Deep Link Navigation

  Background:
    Given el usuario Login E2E BCP inicia sesión en Yape

  @TC-13305 @smoke @happy-path @working
  Scenario Outline: Validar navegación mediante deep link con sus interacciones
    When el usuario abre la URL <url> mediante deep link
    Then la aplicación navega correctamente a la página solicitada
    And se realiza la interacción <interaction> dentro de la webview

    Examples:
      | url                                                      | interaction |
      | yape://yape.com.pe/app/marketing?path=%2Frmn%2Fautomatizacion      | close       |
      | yape://yape.com.pe/app/marketing?path=%2Frmn%2Fautomatizacion      | volume      |
      | yape://yape.com.pe/app/marketing?path=%2Frmn%2Fautomatizacion      | like      |

  @TC-13117 @smoke @happy-path @working
  Scenario Outline: Validar los diferentes redireccionamientos a través de los CTA
    When el usuario abre la URL <url> mediante deep link
    Then la aplicación navega correctamente a la página solicitada
    And se realiza el redireccionamiento a través del siguiente CTA <cta> desde la historia <content_number>

    Examples:
      | url                                                      | cta | content_number |
      | yape://yape.com.pe/app/marketing?path=%2Frmn%2Fautomatizacion      | CTA_internal_redirect_yapear_servicios | 0 |
      | yape://yape.com.pe/app/marketing?path=%2Frmn%2Fautomatizacion      | CTA_external_redirect | 1 |
      | yape://yape.com.pe/app/marketing?path=%2Frmn%2Fautomatizacion      | CTA_webview_redirect | 2 |

  @TC-13116 @unhappy-path @working
  Scenario Outline: Validar la pantalla de error y su redireccionamiento
    When el usuario abre la URL <url> mediante deep link
    Then la aplicación muestra la pantalla de error con el mensaje <mensaje>
    And decide dar click en el boton Ir a inicio y regresar a home yape
    
    Examples:
      | url                                                            | mensaje |
      | yape://yape.com.pe/app/marketing?path=%2Frmn%2Fyape_error      | Ocurrió un inconveniente |