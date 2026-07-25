
@squad-pago-de-servicios-recargas @all-payment-methods @payment-services
Feature: Pago de Servicios - Métodos de Pago

    Como usuario de la aplicación Yape,
    Quiero poder realizar el pago de servicios utilizando diferentes métodos de pago,
    Para completar mi pago con el método que prefiera.

    Background:
        Given el usuario recharge_e2e inicia sesión en Yape


    @monto-minimo @Regression @Working
    Scenario Outline: Pago de servicios fraccionado en soles con monto mínimo
        And que se activa el pago fraccionado para la empresa "<tipo_servicio>"
        And que el usuario navega a la seccion de pago de servicios
        When busca la empresa "<empresa>"
        And selecciona el recibo con codigo "<codigo>" tipo "<tipo_servicio>" de la empresa "<empresa>" con modalidad "<modalidad>"
        Then se visualiza la pantalla WinState de pago de servicio

        Examples:
            | empresa | codigo  | tipo_servicio                                        | modalidad    |
            | Entel   | wqwedas | Pago con número de recibo - Servicios Fijos Empresas | Monto mínimo |

    @otro-monto @Regression @Working
    Scenario Outline: Pago de servicios fraccionado en soles con otro monto
        And que se activa el pago fraccionado para la empresa "<tipo_servicio>"
        And que el usuario navega a la seccion de pago de servicios
        When busca la empresa "<empresa>"
        And selecciona el recibo con codigo "<codigo>" tipo "<tipo_servicio>" de la empresa "<empresa>" con modalidad "<modalidad>"
        Then se visualiza la pantalla WinState de pago de servicio

        Examples:
            | empresa | codigo  | tipo_servicio                                        | modalidad  |
            | Entel   | fsvxfdf | Pago con número de recibo - Servicios Fijos Empresas | Otro monto |

    @parcial-soles @Regression @Working
    Scenario Outline: Pago de servicios parcial en soles
        And que el usuario navega a la seccion de pago de servicios
        When busca la empresa "<empresa>"
        And selecciona el recibo con codigo "<codigo>" de la empresa "<tipo_servicio>"
        Then se visualiza la pantalla WinState de pago de servicio

        Examples:
            | empresa | codigo | tipo_servicio        |
            | Mibanco | 124323 | Cuota Préstamo Soles |


    @TC-5711 @Regression @Working
    Scenario Outline: Validar winstate detalle de pago completo - soles
        And que el usuario navega a la seccion de pago de servicios
        When busca la empresa "<empresa>"
        And selecciona el recibo con codigo "<codigo>" de la empresa
        Then se visualiza la pantalla WinState de pago de servicio

        Examples:
            | empresa  | codigo |
            | Adinelsa | 7737   |

    @TC-5733 @Regression @Working
    Scenario Outline: Validar generacion de reporte de pago desde movimientos
        And que el usuario navega a la seccion de pago de servicios
        When busca la empresa "<empresa>"
        And selecciona el recibo con codigo "<codigo>" de la empresa
        And navega desde la pantalla WinState a movimientos generando el reporte de pago
        Then se visualiza el envio del reporte

        Examples:
            | empresa  | codigo |
            | Adinelsa | 7737   |

    @TC-5712
    Scenario Outline: Validar winstate detalle de pago completo - dolares
        And se configura la personality "pds_bill_payment_dollar" del usuario
        And que el usuario navega a la seccion de pago de servicios
        When busca la empresa "<empresa>"
        And selecciona el recibo en dolares con codigo "<codigo>" de la empresa
        And se finaliza el pago en dolares
        Then se visualiza la pantalla WinState de pago de servicio

        Examples:
            | empresa  | codigo  |
            | Adinelsa | DOL1234 |
