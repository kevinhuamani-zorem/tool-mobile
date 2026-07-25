@squad-pago-de-servicios-recargas @payment-services @personality
Feature: Pago de Servicios - Validaciones

    Como usuario de la aplicación Yape,
    Quiero recibir mensajes de error claros cuando ingreso un código inválido,
    Para saber que debo verificar los datos ingresados.

    Background:
        Given el usuario recharge_e2e inicia sesión en Yape

    @TC-5726 @Regression @Working
    Scenario Outline: Validar mensaje error No encontramos tu recibo - codigo depositante inexistente
        And se configura la personality "<personality>" del usuario
        And que el usuario navega a la seccion de pago de servicios
        When busca la empresa "<empresa>"
        And ingresa el idc del usuario como codigo de suministro
        Then se visualiza el modal de error con mensaje "<error>" personality

        Examples:
            | personality                                | empresa          | error                    |
            | psp_service_bill_doesnt_exist_consumerCode | Electro Sur Este | No encontramos tu recibo |

    @TC-5731 @Regression @Working
    Scenario Outline: Validar mensaje de limite diario al realizar pago de servicio que excede el limite
        And se configura la personality "service_bill_amount_exceed_limit_day" del usuario
        And que el usuario navega a la seccion de pago de servicios
        When busca la empresa "<empresa>"
        And ingresa el idc del usuario como codigo de cliente
        And selecciona el recibo y presiona Yapear Servicio
        Then se visualiza el modal de error con mensaje "<error>" personality

        Examples:
            | empresa | error                                              |
            | Bitel   | No hemos podido realizar tu yapeo a este servicio. |

    @TC-5734 @Regression @Working
    Scenario Outline: Validar correo de confirmacion de pago con todos los atributos
        And que se activa el pago fraccionado para la empresa "<tipo_servicio>"
        And que el usuario navega a la seccion de pago de servicios
        When busca la empresa "<empresa>"
        And selecciona el recibo con codigo "<codigo>" tipo "<tipo_servicio>" de la empresa "<empresa>" con modalidad "<modalidad>"
        Then se visualiza la pantalla WinState de pago de servicio
        And se visualiza la informacion de pago con empresa en el WinState


        Examples:
            | empresa | codigo | tipo_servicio                                        | modalidad   |
            | Entel   | 124323 | Pago con número de recibo - Servicios Fijos Empresas | Monto total |

    @TC-5732 @Regression @Working
    Scenario Outline: Validar busqueda de empresa por multiples keywords configuradas
        And que el usuario navega a la seccion de pago de servicios
        When ingresa al buscador y busca la keyword "<keyword>"
        Then se muestran resultados de busqueda

        Examples:
            | keyword                   |
            | agua, financiera, seguros |
