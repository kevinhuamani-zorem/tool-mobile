@squad-tipo-de-cambio @regression @open-bank-account
Feature: Esta funcionalidad permite aperturar una cuenta en dólares

    @TC-10379 @smoke @happy-path @working @open-dollar-account
    Scenario Outline: Usuario abre una cuenta en dólares
        Given el usuario <username> inicia sesión en Yape
        And el usuario ingresa a cambiar dólares desde el home de yape
        And selecciona crear cuenta dólares desde el home de tipo de cambio
        When completa la información solicitada
            | <occupation>             |
            | <employmentStatusOption> |
            | <workplace>              |
            | <region>                 |
            | <province>               |
        Then se confirma la creación de la cuenta dólar

        Examples:
            | username                             | occupation | employmentStatusOption | workplace | region | province |
            | Pedro Perez Certicientosetentaysiete | Cajero     | Estudiante             | Sunat     | LIMA   | BARRANCA |