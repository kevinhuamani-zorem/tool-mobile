@squad-pago-de-servicios-recargas @payment-services @payment-modalities
Feature: Modulo Pago de Servicios

    Como usuario de la aplicación Yape,
    Quiero poder realizar el pago de servicios desde la app,
    Para gestionar mis pagos de forma rápida y recibir confirmación del resultado.

    Background:
        Given el usuario recharge_e2e inicia sesión en Yape
        And que se activa el pago fraccionado para la empresa "Pago con número de recibo - Servicios Fijos Empresas"


    @TC-5702 @Regression @Working
    Scenario Outline: Validar boton YAPEAR SERVICIO habilitado - monto minimo
        And que el usuario navega a la seccion de pago de servicios
        When busca la empresa "<empresa>"
        And selecciona el recibo con codigo "<codigo>" de la empresa "<empresa>" con modalidad "<modalidad>" y tipo "<tipo_servicio>"
        Then se visualiza la pantalla WinState de pago de servicio

        Examples:
            | empresa | codigo | tipo_servicio                                        | modalidad    |
            | Entel   | 124323 | Pago con número de recibo - Servicios Fijos Empresas | Monto mínimo |

    @TC-5703 @Regression @Working
    Scenario Outline: Validar boton YAPEAR SERVICIO apagado - otro monto
        And que el usuario navega a la seccion de pago de servicios
        When busca la empresa "<empresa>"
        And selecciona el recibo con codigo "<codigo>" tipo "<tipo_servicio>" de la empresa "<empresa>" con modalidad "<modalidad>" y monto "<monto>"
        Then se visualiza el mensaje de error de montos
        And el boton YAPEAR SERVICIO se encuentra deshabilitado

        Examples:
            | empresa | codigo | tipo_servicio                                        | modalidad  | monto  |
            | Entel   | 124323 | Pago con número de recibo - Servicios Fijos Empresas | Otro monto | 900, 2 |


    @TC-5704 @Regression @Working
    Scenario Outline: Validar pantalla recibo para pago fraccionado con recibo menor al monto minimo
        And que el usuario navega a la seccion de pago de servicios
        When busca la empresa "<empresa>"
        And selecciona el recibo con codigo "<codigo>" tipo "<tipo_servicio>" de la empresa "<empresa>" con modalidad "<modalidad>" y monto "<monto>"
        Then se visualiza el mensaje de error de montos
        And el boton YAPEAR SERVICIO se encuentra deshabilitado

        Examples:
            | empresa | codigo | tipo_servicio                                        | modalidad  | monto |
            | Entel   | 124323 | Pago con número de recibo - Servicios Fijos Empresas | Otro monto | 2     |

    @TC-5701 @Regression @Working
    Scenario Outline: Validar boton YAPEAR SERVICIO encendido para tipo de pago Monto total
        And que el usuario navega a la seccion de pago de servicios
        When busca la empresa "<empresa>"
        And selecciona el recibo con codigo "<codigo>" tipo "<tipo_servicio>" de la empresa "<empresa>" con modalidad "<modalidad>"
        Then se visualiza la pantalla WinState de pago de servicio
        And se visualiza la informacion de pago con empresa en el WinState
        And se visualiza en recientes la glosa de pago con empresa "<empresa>"

        Examples:
            | empresa | codigo | tipo_servicio                                        | modalidad   |
            | Entel   | 124323 | Pago con número de recibo - Servicios Fijos Empresas | Monto total |