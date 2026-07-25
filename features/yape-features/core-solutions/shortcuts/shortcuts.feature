Feature: Mostrar los atajos del usuario yape hijos

    @shortcuts @YAPEEG-19739 @YAPEEG-19740
    Scenario Outline: Validación de atajos para los perfiles Yape Hijos
    Given el usuario <username> inicia sesión en Yape
    And el usuario ingresa al home
    Then el usuario visualiza su nombre en el home
    And el usuario visualiza los siguientes atajos de Yape Hijos:
        | atajo               |
        | Recargar celular    |
        | Aprende con Yape    |
        | Biometría digital   |
        | Ver más             |

    Examples:
        | username            |
        | Carol 51 YAPEHIJOS  |
        | Carol 52 YAPEHIJOS  |