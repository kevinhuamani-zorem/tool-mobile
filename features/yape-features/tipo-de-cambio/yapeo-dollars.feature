@squad-tipo-de-cambio @regression @yapeo-dollars
Feature: Realizamos las validaciones para las operaciones de yapear dólares

    @TC-18935 @smoke @happy-path @working @yapeo-dollars-successful
    Scenario Outline: Usuario realiza la operación yapear dólares sin OTP a no contacto
        Given el usuario <username> inicia sesión en Yape
        And el usuario ingresa a cambiar dólares desde el home de yape
        And selecciona yapear dólares desde el home de tipo de cambio
        And usuario selecciona celular del usuario destino <destinationUser>
        When usuario selecciona el monto <amount> y mensaje <message> para realizar yapeo dolar
        Then el usuario confirma el yapeo dolar
        And cierra pantalla con la información del yapeo dólar
        Examples:
            | username                            | destinationUser                        | amount | message |
            | Pedro Perez Certicientoochentayseis | Pedro Perez CertificacionSetentaysiete | 2      | yapeo   |

    @TC-10388 @happy-path @working @yapeo-dollars-with-otp
    Scenario Outline: Usuario realiza la operación yapear dólares con OTP a no contacto
        Given el usuario <username> inicia sesión en Yape
        And el usuario ingresa a cambiar dólares desde el home de yape
        And selecciona yapear dólares desde el home de tipo de cambio
        And usuario selecciona celular del usuario destino <destinationUser>
        When usuario selecciona el monto <amount> y mensaje <message> para realizar yapeo dolar
        Then el usuario confirma el yapeo dolar
        And realiza la confirmación de yapeo alto
        And cierra pantalla con la información del yapeo dólar
        Examples:
            | username                            | destinationUser                        | amount | message |
            | Pedro Perez Certicientocincuenta    | Pedro Perez CertificacionSetentaysiete | 2      | yapeo   |

    @TC-10402 @happy-path @working @yapeo-dollars-movements
    Scenario Outline: Usuario valida en los movimientos del Home de TDC el registro de yapeo dólares
        Given el usuario <username> inicia sesión en Yape
        And el usuario ingresa a cambiar dólares desde el home de yape
        And selecciona yapear dólares desde el home de tipo de cambio
        And usuario selecciona celular del usuario destino <destinationUser>
        When usuario selecciona el monto <amount> y mensaje <message> para realizar yapeo dolar
        Then el usuario confirma el yapeo dolar
        Then el yapeo en dólares aparece registrado en movimientos
        Examples:
            | username                              | destinationUser                      | amount | message |
            | Pedro Perez CertificacionOchentayseis | Pedro Perez CertificacionSetentaydos | 2      | yapeo   |
    
    @TC-18535 @unhappy-path @working @yapeo-dollars-otp-invalid
    Scenario Outline: Usuario realiza la operacion yapear dólares con OTP incorrecto
        Given el usuario <username> inicia sesión en Yape
        And el usuario ingresa a cambiar dólares desde el home de yape
        And selecciona yapear dólares desde el home de tipo de cambio
        And usuario selecciona celular del usuario destino <destinationUser>
        When usuario selecciona el monto <amount> y mensaje <message> para realizar yapeo dolar
        And usuario confirma yapeo y ingresa codigo de otp incorrecto
        Then se muestra un mensaje de error por OTP incorrecto
        And el yapeo de dólares no se completa

        Examples:
            | username                            | destinationUser                        | amount | message |
            | Pedro Perez Certicientocincuenta    | Pedro Perez CertificacionSetentaysiete | 2      | yapeo   |
    
    @TC-18697 @unhappy-path @working @yapeo-dollars-without-dollar-account
    Scenario Outline: Usuario intenta yapear dólares a usuario receptor sin cuenta de dólares
        Given el usuario <username> inicia sesión en Yape
        And el usuario ingresa a cambiar dólares desde el home de yape
        And selecciona yapear dólares desde el home de tipo de cambio
        And usuario selecciona celular del usuario destino <destinationUser>
        Then se muestra un mensaje de error de usuario sin cuenta dólares
        And el usuario es redirigido al home de tipo de cambio

        Examples:
            | username                            | destinationUser                        |
            | Pedro Perez Certicientocincuenta    | Pedro Perez Certidoscientosveintiuno  |