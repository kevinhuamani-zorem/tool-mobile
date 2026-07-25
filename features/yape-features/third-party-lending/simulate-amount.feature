@squad-third-party-lending @regression @mibanco
Feature: Esta funcionalidad es para validar la simulación de la oferta de Mibanco

    @TC-13566 @happy-path @simulate-tplending
    Scenario Outline: Verificar la simulación del crédito de Mibanco
        Given el usuario <username> inicia sesión en Yape
        When el usuario selecciona la opción de créditos del sidebar de la home
        Then se ingresa y valida la sección de simulación de monto
        And se simula un monto <amount> de crédito disponible
        And el usuario abandona el flujo de desembolso

        Examples:
            | username                                  | amount |
            | YAPERO CERTI MIBANCO4 THIRD PARTY LENDING | 3000   |
            | YAPERO CERTI MIBANCO4 THIRD PARTY LENDING | 505    |
            | YAPERO CERTI MIBANCO4 THIRD PARTY LENDING | 300    |
