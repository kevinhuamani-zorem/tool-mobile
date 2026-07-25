@squad-third-party-lending @regression @mibanco
Feature: Esta funcionalidad es para validar la proforma de la oferta de Mibanco

    @TC-13572 @happy-path @credit-preview-tplending
    Scenario Outline: Verificar la proforma del crédito de Mibanco
        Given el usuario <username> inicia sesión en Yape
        When el usuario selecciona la opción de créditos del sidebar de la home
        Then se ingresa y valida la sección de simulación de monto
        And se simula un monto <amount> de crédito disponible
        And se realiza la validación de los parámetros de la cotización
        Then se valida la hoja resumen previo al desembolso
        And el usuario abandona el flujo de desembolso

        Examples:
            | username                                  | amount |
            | YAPERO CERTI MIBANCO4 THIRD PARTY LENDING | 4000   |
