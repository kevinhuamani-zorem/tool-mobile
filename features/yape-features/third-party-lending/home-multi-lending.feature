@squad-third-party-lending @regression @mibanco
Feature: Esta funcionalidad es para validar el credito de Mibanco para la home de Lending

    @TC-13564 @happy-path @home-tplending
    Scenario Outline: Verificar titulo, oferta y preguntas frecuentes para usuario con campaña de crédito
        Given el usuario <username> inicia sesión en Yape
        When el usuario selecciona la opción de créditos del sidebar de la home
        Then se valida el ingreso a créditos por la opción de Ver más
        And se busca y valida la sección de créditos desde la home de yape

        Examples:
            | username                                  |
            | YAPERO CERTI MIBANCO4 THIRD PARTY LENDING |
