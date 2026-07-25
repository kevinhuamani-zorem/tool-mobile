Feature: Yapeo regularQR Happy Path


  @yapeoregularporqr @TC-13582 @smoketest @regresion
  Scenario Outline: [CP_01][Happy Path][AUTO-FRONT] Yapear de un yapero regular a otro yapero no contacto por qr sin otp
   Given el usuario <username> inicia sesión en Yape
   When el usuario ingresa a la opcion de escanear QR
   And el usuario selecciono la opcion subir una imagen con QR
   And el usuario selecciono la imagen que desea escanear
   And ingresa el monto de yapear <amount>
   And ingresa un comentario <comment>
   And selecciono el boton yapear
   And el usuario deberia visualizar el winstate del yapeo
   Then el usuario vuelve a Home desde winstate

    Examples:
      | username            |amount| comment|
      | Merlina Morgan Tdd1 | 1.2  | test tdd to qr bcp no otp |
  

  @yapeoregularporqrotp @TC-17386 @smoketest @regresion
  Scenario Outline: [CP_01][Happy Path][AUTO-FRONT] Yapear de un yapero regular a otro yapero no contacto por qr con otp
   Given el usuario <username> inicia sesión en Yape
   When el usuario ingresa a la opcion de escanear QR
   And el usuario selecciono la opcion subir una imagen con QR
   And el usuario selecciono la imagen que desea escanear
   And ingresa el monto de yapear <amount>
   And ingresa un comentario <comment>
   And selecciono el boton yapear
   And se valida con codigo OTP
   And selecciona el boton de validacion
   Then el usuario deberia visualizar el winstate del yapeo
   And el usuario vuelve a Home desde winstate

    Examples:
      | username            |amount| comment|
      | Merlina Morgan Tdd1 | 500  | test tdd to qr bcp with otp |