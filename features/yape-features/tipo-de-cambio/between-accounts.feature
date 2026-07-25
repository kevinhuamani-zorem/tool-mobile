@squad-tipo-de-cambio @regression @between-accounts
Feature: Realizamos las validaciones para las operaciones de entre cuentas

  @TC-18933 @smoke @happy-path @working @currency-exchange-transaction
  Scenario Outline: Usuario realiza la operacion Quiero Soles y Quiero Dólares
    Given el usuario <username> inicia sesión en Yape
    And el usuario ingresa a cambiar dólares desde el home de yape
    And selecciona cambiar dólares desde el home de tipo de cambio
    When selecciona tab <tab> realiza la cotización <operation> <amount>
    And el usuario confirma la transacción Yape
    Then se muestra pantalla con la información de la operación realizada

    Examples:
      | username                               | tab            | operation                 | amount |
      | Pedro Perez CertificacionSetentaysiete | Quiero soles   | quiero Soles Si cambias   | 1.3    |
      | Pedro Perez CertificacionSetentaysiete | Quiero soles   | quiero Soles Recibirás    | 5      |
      | Pedro Perez CertificacionSetentaysiete | Quiero dólares | quiero dólares Si cambias | 5      |
      | Pedro Perez CertificacionSetentaysiete | Quiero dólares | quiero dólares Recibirás  | 2      |
  
  @TC-10401 @happy-path @working @between-accounts-movements
  Scenario Outline: Usuario valida en los movimientos del Home de TDC las operaciones de Quiero Soles y Quiero Dólares
    Given el usuario <username> inicia sesión en Yape
    And el usuario ingresa a cambiar dólares desde el home de yape
    And selecciona cambiar dólares desde el home de tipo de cambio
    When selecciona tab <tab> realiza la cotización <operation> <amount>
    And el usuario confirma la transacción Yape
    Then la operación entre cuentas aparece registrado en movimientos

    Examples:
      | username                               | tab            | operation                 | amount |
      | Pedro Perez CertificacionSetentaysiete | Quiero soles   | quiero Soles Si cambias   | 1.3    |
      | Pedro Perez CertificacionSetentaysiete | Quiero soles   | quiero Soles Recibirás    | 5      |
      | Pedro Perez CertificacionSetentaysiete | Quiero dólares | quiero dólares Si cambias | 5.4    |
      | Pedro Perez CertificacionSetentaysiete | Quiero dólares | quiero dólares Recibirás  | 2      |

  @TC-17931 @unhappy-path @working @user-with-no-dollar-balance
  Scenario Outline: Usuario realiza la operacion Quiero Soles Si cambias con saldo insuficiente
    Given el usuario <username> inicia sesión en Yape
    When el usuario ingresa a cambiar dólares desde el home de yape
    And selecciona cambiar dólares desde el home de tipo de cambio
    And selecciona tab <tab> realiza la cotización <operation> <amount>
    And el usuario confirma la transacción Yape
    Then se muestra la pantalla de error <title> con el mensaje <message>
    And el usuario puede regresar al home de tdc presionando "IR AL INICIO" desde la pantalla de error

    Examples:
      | username                               | tab            | operation                 | amount | title                         | message |
      | Pedro Perez CertificacionSetentaysiete | Quiero soles   | quiero Soles Si cambias   | 5      | No tienes dólares suficientes | Para esta operación necesitas más dólares en tu cuenta. Asegúrate tener el dinero suficiente.|