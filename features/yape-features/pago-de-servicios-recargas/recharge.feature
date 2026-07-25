@squad-pago-de-servicios-recargas @recharge
Feature: Modulo Recargas

    Como usuario de la aplicación Yape,
    Quiero poder realizar recargas de saldo a mi número o al de otra persona desde la app,
    Para gestionar recargas de forma rápida, recibir confirmación del resultado y consultar el historial desde mis movimientos.

    Background:
        Given el usuario recharge_e2e inicia sesión en Yape


    @TC-5709 @Regression @Working
    Scenario Outline: Validar recarga exitosa BITEL con flujo de recurrencia
        And que el usuario navega a la seccion de recargas con opcion "<opcion_recarga>"
        When realiza una recarga a mi numero exitosa con un monto "<compania>" "<monto>"
        Then se visualiza la pantalla WinState de recarga

        Examples:
            | opcion_recarga | compania | monto |
            | mi numero      | Bitel    | 3     |


    @TC-5710 @Regression @Working
    Scenario Outline: Validar correo de confirmacion de recarga con datos completos
        And que el usuario navega a la seccion de recargas con opcion "<opcion_recarga>"
        When realiza una nueva recarga a otro numero con "<compania>" "<monto>"
        Then se visualiza la pantalla WinState de recarga

        Examples:
            | opcion_recarga | compania | monto |
            | otra persona   | Bitel    | 3     |

    @TC-5708 @Regression @Working
    Scenario Outline: Validar pantalla winstate rediseñada de recarga con todos los campos
        And que el usuario navega a la seccion de recargas con opcion "<opcion_recarga>"
        When realiza una recarga a mi numero exitosa con un monto "<compania>" "<monto>"
        Then se visualiza la pantalla WinState de recarga
        And se muestran todos los atributos del winstate correctamente para "<compania>"

        Examples:
            | opcion_recarga | compania | monto |
            | mi numero      | Bitel    | 3     |

    @TC-5707 @Regression @Working
    Scenario Outline: Validar visualizacion de montos sugeridos en pantalla de recarga
        And que el usuario navega a la seccion de recargas con opcion "<opcion_recarga>"
        When realiza una recarga con monto sugerido "<compania>" "<monto>"
        Then se visualiza la pantalla WinState de recarga
        And se muestran todos los atributos del winstate correctamente para "<compania>"

        Examples:
            | opcion_recarga | compania | monto |
            | otra persona      | Bitel    | 6     |

    @TC-5706 @Regression @Working
    Scenario Outline: Validar consistencia de winstate entre movimientos y ver todos - recarga
        And que el usuario navega a la seccion de recargas con opcion "<opcion_recarga>"
        When realiza una recarga con monto sugerido "<compania>" "<monto>"
        Then se muestran todos los atributos del winstate correctamente para "<compania>"
        And se visualiza el winstate en movimientos
        And se visualiza el winstate en ver todos

        Examples:
            | opcion_recarga | compania | monto |
            | mi numero      | Bitel    | 6     |


    @TC-5705 @Regression @Working
    Scenario: Validar boton Recargar habilitado al ingresar numero con 2+ digitos
        When digita un numero de 2 o mas digitos "12"
        Then el boton de recargar se mantiene habilitado
        And se visualiza el error por monto minimo
        And se visualiza el error por monto maximo


    @TC-10451 @Regression @Working
    Scenario Outline: Validar compartir recarga exitosa desde winstate
        And que el usuario navega a la seccion de recargas con opcion "<opcion_recarga>"
        When realiza una recarga a mi numero exitosa con un monto "<compania>" "<monto>"
        Then se visualiza la pantalla WinState de recarga
        And se comparte la recarga exitosamente

        Examples:
            | opcion_recarga | compania | monto |
            | mi numero      | Bitel    | 3     |

    @TC-10452 @Regression @Working
    Scenario Outline: Validar nueva recarga desde winstate
        And que el usuario navega a la seccion de recargas con opcion "<opcion_recarga>"
        When realiza una nueva recarga a otro numero con "<compania>" "<monto>"
        Then se visualiza la pantalla WinState de recarga
        And presiona nueva recarga y se redirige a la pantalla de opciones
        When realiza una nueva recarga a otro numero desde el WinState con "<compania>" "<monto>"
        Then se visualiza la pantalla WinState de recarga

        Examples:
            | opcion_recarga | compania | monto |
            | otra persona | Bitel | 3 |