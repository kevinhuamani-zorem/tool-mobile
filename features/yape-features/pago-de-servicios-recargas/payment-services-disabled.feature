@squad-pago-de-servicios-recargas @payment-services-disabled @payment-services
Feature: Pago de Servicios - Apagado General

    Como usuario de la aplicación Yape,
    Quiero ver una pantalla de mantenimiento cuando el módulo está apagado,
    Para saber que el servicio no está disponible temporalmente.


    Background:
        Given el usuario recharge_e2e inicia sesión en Yape

    @TC-5728 @Regression @Working
    Scenario: Validar pantalla de error cuando existe apagado general en la carga del Home
        And se apaga el modulo de pago de servicios en Redis
        When que el usuario navega a la seccion de pago de servicios
        Then se visualiza la pantalla de mantenimiento con mensaje "Yapear servicios está en mantenimiento"
        And se visualiza el submensaje "Estamos trabajando con fuerza para volver lo más pronto posible. Mientras tanto, descubre qué más tiene Yape para ti."

    @TC-5730 @Regression @Working
    Scenario Outline: Validar modal de empresa apagada al seleccionarla desde el buscador
        And se desactiva la empresa "<empresa>" en Redis
        When que el usuario navega a la seccion de pago de servicios
        And busca la empresa "<empresa>"
        Then se visualiza el mensaje "La funcionalidad de Pago de servicios no está disponible."
        And se visualiza el boton "Entendido"

        Examples:
            | empresa |
            | Seal    |

    @TC-5729 @Regression @Working
    Scenario: Validar mensaje de error cuando la empresa esta fuera de horario
        And se configura fuera de horario para una empresa con offHour en Redis
        When que el usuario navega a la seccion de pago de servicios
        And busca la empresa configurada fuera de horario
        Then se visualiza el submensaje "Mientras tanto, puedes yapear otros servicios fácilmente"
        And se visualiza el boton "Entendido"