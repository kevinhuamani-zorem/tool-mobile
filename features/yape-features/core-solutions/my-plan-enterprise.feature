@reset
Feature: Mostrar los datos del usuario en la opción "Mi plan yape empresa"
  Yo como usuario de Yape 
  Quiero visualizar correctamente los elementos de "Mi plan yape empresa"

  Rule: Mostrar correctamente los elementos de pantalla de "Mi plan yape empresa"

    @Mi_plan_yape_empresa @YAPEEG-14064
    Scenario Outline: Verificar elementos de sección Mi plan yape empresa
        Given el usuario <username> inicia sesión en Yape
        And el usuario abre el menu hamburguesa del home
        And hace clic en la opción Mi plan yape empresa del menu
        Then se debe mostrar la fecha de afiliación a yape empresa
        And el Cobro por comisión

      Examples:
        | username                 |
        | Carol 29 ENTERPRISE      |

    @Mi_plan_yape_empresa @YAPEEG-14061
    Scenario Outline: Verificar el ingreso a Yape Empresa siendo usuario con type ASSISTANT_ENTERPRISE
        Given el usuario <username> inicia sesión en Yape
        When el usuario da click a la opcion ver mas
        And el usuario da click a ver ver ventas del dia
        Then el usuario visualiza correctamente la pantalla de ventas del dia
        When el usuario regresa al home
        And el usuario da click al menu del home
        And hace clic en la opción Mi plan yape empresa del menu
        Then se debe mostrar la fecha de afiliación a yape empresa
        And el Cobro por comisión

      Examples:
        | username                 |
        | Andree 29 BCPNegocio     |