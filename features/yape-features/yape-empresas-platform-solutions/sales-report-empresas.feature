@squad-yape-empresas-platform-solutions @regression @sales-report-empresas
Feature: Reporte de Ventas Yape Empresas 

  @TC-10920 @happy-path 
  Scenario Outline: Verificar que un usuario empresa solicita reporte de ventas por correo electrónico
    Given el usuario <username> inicia sesión en Yape
    When el usuario selecciona la opcion ver ventas
    And el usuario selecciona la opcion reporte
    And el usuario selecciona la opcion enviar
    Then el usuario deberia visualizar el mensaje de reporte enviado
    And el usuario selecciona la opcion entendido

    Examples:
      | username             |
      | Comercial Prisma SAC |

  @TC-10919 @happy-path 
  Scenario Outline: Verificar que un usuario empresa aplica filtros por fecha, estado y medio de cobro en la sección ver ventas
    Given el usuario <username> inicia sesión en Yape
    When el usuario selecciona la opcion ver ventas
    And el usuario selecciona la opcion filtros
    And el usuario selecciona las opciones ultimos 15 días, exitosa y qr
    And el usuario selecciona opcion filtrar
    Then el usuario deberia visualizar los filtros aplicados

    Examples:
      | username             |
      | Comercial Prisma SAC |