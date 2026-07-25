@squad-pago-de-servicios-recargas @payment-services @deeplinks @payment-services
Feature: Pago de Servicios - Deep Links

    Como usuario de la aplicación Yape,
    Quiero acceder a secciones de Pago de Servicios mediante deep links,
    Para navegar directamente a la funcionalidad deseada.

    @TC-5718 @Regression @Working
    Scenario Outline: Validar deeplink a listado de empresas con categoria preseleccionada
        Given el usuario abre el deeplink de categoria "<categoria>" con id "<categoryId>"
        When el usuario recharge_e2e inicia sesión en Yape
        Then la categoria "<categoria>" esta pre-seleccionada

        Examples:
            | categoria | categoryId                           |
            | Luz       | 21bb6d86-2846-4907-a9dd-488746e0ddc3 |
            | Telefonía | 27101d71-9c93-4e6e-a6ee-670103be703b |

    @TC-5719 @Regression @Working
    Scenario: Validar deeplink de redireccion al home de PdS
        Given el usuario abre el deeplink de pago de servicios
        When el usuario recharge_e2e inicia sesión en Yape
        Then se visualiza la pantalla de Home de Pago de Servicios

    @TC-5720 @Regression @Working
    Scenario: Validar deeplink de redireccion a pantalla de ingreso de monto
        Given el usuario abre el deeplink de pago de servicio con empresa pre-seleccionada
        When el usuario recharge_e2e inicia sesión en Yape
        Then se visualiza la empresa "Backus" esta pre-seleccionada

    @TC-5721 @Regression @Working
    Scenario: Validar deeplink enriquecido cuando cliente no tiene deuda
        Given se prepara el usuario recharge_e2e para deeplink
        And se configura la personality "service_bill_doesnt_exist_debt" del usuario
        And el usuario abre el deeplink enriquecido de Movistar sin deuda
        When el usuario recharge_e2e inicia sesión en Yape
        Then se muestra un mensaje indicando que no se encontro deuda
