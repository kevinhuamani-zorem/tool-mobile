@squad-pago-de-servicios-recargas @payment-yapeo-high @payment-services
Feature: Pago de Servicios - Yapeo Alto OTP

    Como usuario de la aplicación Yape,
    Quiero poder realizar el pago de servicios desde la app,
    Para gestionar mis pagos de forma rápida y recibir confirmación del resultado.

    Background:
        Given el usuario recharge_e2e configura el umbral de yapeo alto
        And el usuario recharge_e2e inicia sesión en Yape


    @TC-5727 @Regression @Working
    Scenario Outline: Validar solicitud de OTP cuando monto excede umbral de yapeo alto
        And que se activa el pago fraccionado para la empresa "<tipo_servicio>"
        And que el usuario navega a la seccion de pago de servicios
        When busca la empresa "<empresa>"
        And selecciona el recibo con codigo "<codigo>" tipo "<tipo_servicio>" de la empresa "<empresa>" con modalidad "<modalidad>"
        Then se visualiza la pantalla de validacion OTP
        And se visualiza la pantalla WinState de pago de servicio

        Examples:
            | empresa | codigo | tipo_servicio                                        | modalidad   |
            | Entel   | 124323 | Pago con número de recibo - Servicios Fijos Empresas | Monto total |
