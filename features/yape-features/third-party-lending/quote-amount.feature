@squad-third-party-lending @regression @mibanco
Feature: Esta funcionalidad es para validar la cotización de la oferta de Mibanco

    @TC-13569 @happy-path @quote-tplending
    Scenario Outline: Verificar la cotización del crédito de Mibanco
        Given el usuario <username> inicia sesión en Yape
        When el usuario selecciona la opción de créditos del sidebar de la home
        Then se ingresa y valida la sección de simulación de monto
        And se simula un monto <amount> de crédito disponible
        Then se actualiza el monto <newAmount> del crédito
        And se realiza la validación de los parámetros de la cotización
        And el usuario abandona el flujo de desembolso

        Examples:
            | username                                  | amount | newAmount |
            | YAPERO CERTI MIBANCO4 THIRD PARTY LENDING | 3000   | 4000      |
