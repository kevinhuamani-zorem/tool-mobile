@squad-yape-empresas-platform-solutions @regression @enterprise-balance-validation
Feature: Perfil Empresa - Visualizacion de saldo en home

  @TC-11543 @happy-path @broken @balance-home
  Scenario Outline: Usuario empresa puede visualizar su saldo en el home
    Given el usuario <username> inicia sesión en Yape
    When selecciona la opcion mostrar saldo
    Then el saldo del usuario con perfil empresa se visualiza en el home

    Examples:
      | username             |
      | Comercial Prisma SAC |
