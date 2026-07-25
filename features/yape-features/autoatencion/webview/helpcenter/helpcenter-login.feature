@helpcenter_webview_login
Feature: Centro de Ayuda Webview de Login

@helpcenter_webview_login_navigation_from_cda_to_faq
Scenario: [CDP_01][Happy Path][Navigation] Navegación exitosa por las categorías, subcategorías y una pregunta frecuente del Centro de Ayuda
    Given el usuario está registrado en Yape y presiona el boton "Ya tengo una cuenta"
    And el usuario presiona en "Ingresa al Centro de Ayuda"
    And accede al "Centro de Ayuda - Login" y presiona la opción "Sobre otros productos Yape"
    And presiona la categoría "Crear tu cuenta Yape" y busca la subcategoría "Cómo crear una cuenta en Yape"
    And visualiza la descripción "Todo lo que necesitas saber para crear una cuenta en Yape y empezar a yapear."
    When presiona la pregunta frecuente "¿Con qué entidades financieras me puedo registrar en Yape?"
    And visualiza la pregunta frecuente "¿Con qué entidades financieras me puedo registrar en Yape?"
    Then presiona "Ir hacia atrás" de 1 PF, subcategoría, categoría y Centro de Ayuda
    And el usuario visualiza la pantalla de "Ingresa a tu Yape"

@helpcenter_webview_login_navigation_from_cda_to_two_faq
Scenario: [CDP_02][Happy Path][Navigation] Navegación exitosa por las categorías, subcategorías y dos preguntas frecuentes del Centro de Ayuda
    Given el usuario está registrado en Yape y presiona el boton "Ya tengo una cuenta"
    And el usuario presiona en "Ingresa al Centro de Ayuda"
    And accede al "Centro de Ayuda - Login" y presiona la opción "Sobre otros productos Yape"
    And presiona la categoría "Delivery Tambo" y busca la subcategoría "Tengo un problema"
    And visualiza la descripción "Nueva función de Delivery Tambo en el app de Yape"
    When presiona la pregunta frecuente "¿Cómo devuelvo un producto de Delivery Tambo?"
    And visualiza la pregunta frecuente "¿Cómo devuelvo un producto de Delivery Tambo?"
    And presiona el contenido de la PF "¿Qué hago si tuve un problema con mi compra en Delivery Tambo?"
    And visualiza la pregunta frecuente "¿Qué hago si tuve un problema con mi compra en Delivery Tambo?"
    Then presiona "Ir hacia atrás" de 2 PF, subcategoría, categoría y Centro de Ayuda
    And el usuario visualiza la pantalla de "Ingresa a tu Yape"

@helpcenter_webview_login_navigation_only_faq
Scenario: [CDP_03][Happy Path][Navigation] Navegación exitosa ingresando directo a una pregunta frecuente
    Given el usuario está registrado en Yape y presiona el boton "Ya tengo una cuenta"
    And el usuario presiona en "Ingresa al Centro de Ayuda"
    When accede al "Centro de Ayuda - Login" y presiona la opción "¿Cómo creo una cuenta?"
    And visualiza la pregunta frecuente "¿Cómo creo una cuenta?"
    Then presiona "Ir hacia atrás" de 1 PF y del Centro de Ayuda
    And el usuario visualiza la pantalla de "Ingresa a tu Yape"

@helpcenter_webview_login_the_most_searched
Scenario: [CDP_04][Happy Path][Search] Ingresar a una pregunta frecuente de "Lo más buscado"
    Given el usuario está registrado en Yape y presiona el boton "Ya tengo una cuenta"
    And el usuario presiona en "Ingresa al Centro de Ayuda"
    And accede al "Centro de Ayuda - Login" y presiona en "Ingresa tu consulta"
    And visualiza la descripción "Lo más buscado:"
    When presiona la pregunta frecuente "¿Cómo veo el correo que tengo registrado en Yape?"
    And visualiza la pregunta frecuente "¿Cómo veo el correo que tengo registrado en Yape?"
    Then presiona "Ir hacia atrás" de 1 PF, del buscador y el Centro de Ayuda
    And el usuario visualiza la pantalla de "Ingresa a tu Yape"

@helpcenter_webview_login_search_qr
Scenario: [CDP_05][Happy Path][Search] Búsqueda exitosa con "QR", la única excepción con dos caracteres
    Given el usuario está registrado en Yape y presiona el boton "Ya tengo una cuenta"
    And el usuario presiona en "Ingresa al Centro de Ayuda"
    And accede al "Centro de Ayuda - Login" y presiona en "Ingresa tu consulta"
    When ingresa su consulta "qr" en el buscador
    And revisa el resultado "Sugerencias de búsqueda:"
    And presiona el resultado "¿Cómo hago un pago con QR?"
    And visualiza la pregunta frecuente "¿Cómo hago un pago con QR?"
    Then presiona "Ir hacia atrás" de 1 PF, del buscador y el Centro de Ayuda
    And el usuario visualiza la pantalla de "Ingresa a tu Yape"
 
@helpcenter_webview_login_search_twice
Scenario: [CDP_06][Happy Path][Search] Dos búsquedas exitosas con más de dos caracteres y navegación por una pregunta frecuente
    Given el usuario está registrado en Yape y presiona el boton "Ya tengo una cuenta"
    And el usuario presiona en "Ingresa al Centro de Ayuda"
    And accede al "Centro de Ayuda - Login" y presiona en "Ingresa tu consulta"
    When ingresa su consulta "Cre" en el buscador
    And revisa el resultado "Sugerencias de búsqueda:"
    And presiona el resultado "¿Cómo crear una cuenta en Yape?"
    And visualiza la pregunta frecuente "¿Cómo crear una cuenta en Yape?"
    And presiona "Ir hacia atrás" de 1 PF y regresa al buscador
    Then ingresa su consulta "Crear una cuenta" en el buscador
    And revisa el resultado "Sugerencias de búsqueda:"
    And presiona el resultado "¿Por qué no puedo crear una cuenta en dólares desde Yape?"
    And visualiza la pregunta frecuente "¿Por qué no puedo crear una cuenta en dólares desde Yape?"
    And presiona "Ir hacia atrás" de 1 PF, del buscador y el Centro de Ayuda
    And el usuario visualiza la pantalla de "Ingresa a tu Yape"

@helpcenter_webview_login_search_two_faq
Scenario: [CDP_07][Happy Path][Search] Búsqueda exitosa de pregunta completa y navegación a dos preguntas frecuentes
    Given el usuario está registrado en Yape y presiona el boton "Ya tengo una cuenta"
    And el usuario presiona en "Ingresa al Centro de Ayuda"
    And accede al "Centro de Ayuda - Login" y presiona en "Ingresa tu consulta"
    When ingresa su consulta "¿Cómo devuelvo un producto de Delivery Tambo?" en el buscador
    And revisa el resultado "Sugerencias de búsqueda:"
    And presiona el resultado "¿Cómo devuelvo un producto de Delivery Tambo?"
    And visualiza la pregunta frecuente "¿Cómo devuelvo un producto de Delivery Tambo?"
    And presiona el contenido de la PF "¿Qué hago si tuve un problema con mi compra en Delivery Tambo?"
    And visualiza la pregunta frecuente "¿Qué hago si tuve un problema con mi compra en Delivery Tambo?"
    Then presiona "Ir hacia atrás" de 2 PF, del buscador y el Centro de Ayuda
    And el usuario visualiza la pantalla de "Ingresa a tu Yape"

@helpcenter_webview_login_clear_search_with_x
Scenario: [CDP_08][Happy Path][Search] Búsqueda exitosa con restablecimiento del buscador al presionar en la "X"
    Given el usuario está registrado en Yape y presiona el boton "Ya tengo una cuenta"
    And el usuario presiona en "Ingresa al Centro de Ayuda"
    And accede al "Centro de Ayuda - Login" y presiona en "Ingresa tu consulta"
    When ingresa su consulta "Cuenta Yape" en el buscador
    And revisa el resultado "Sugerencias de búsqueda:"
    Then presiona la X del buscador
    And visualiza el buscador con "Lo más buscado:"

@helpcenter_webview_login_clear_search_with_back
Scenario: [CDP_09][Happy Path][Search] Búsqueda exitosa con restablecimiento del buscador al presionar "Ir hacia atrás"
    Given el usuario está registrado en Yape y presiona el boton "Ya tengo una cuenta"
    And el usuario presiona en "Ingresa al Centro de Ayuda"
    And accede al "Centro de Ayuda - Login" y presiona en "Ingresa tu consulta"
    When ingresa su consulta "Movimientos" en el buscador
    And revisa el resultado "Sugerencias de búsqueda:"
    And presiona el resultado "¿Qué hago si el yapeo que hice no se ve en mis movimientos?"
    And visualiza la pregunta frecuente "¿Qué hago si el yapeo que hice no se ve en mis movimientos?"
    Then presiona "Ir hacia atrás" de 1 PF y del buscador
    And accede al "Centro de Ayuda - Login" y presiona en "Ingresa tu consulta"
    And visualiza el buscador con "Lo más buscado:"

@helpcenter_webview_login_search_icon_action
Scenario: [CDP_10][Happy Path][Search] Ingresar al buscador desde el ícono del buscador
    Given el usuario está registrado en Yape y presiona el boton "Ya tengo una cuenta"
    And el usuario presiona en "Ingresa al Centro de Ayuda"
    And accede al "Centro de Ayuda - Login" y busca la opción "Sobre otros productos Yape"
    When presiona el ícono del buscador
    Then visualiza el buscador con "Lo más buscado:"

@helpcenter_webview_login_dont_search
Scenario: [CDP_11][Unhappy Path][Search] Que no se realice la búsqueda con dos caracteres y restablecimiento del buscador
    Given el usuario está registrado en Yape y presiona el boton "Ya tengo una cuenta"
    And el usuario presiona en "Ingresa al Centro de Ayuda"
    And accede al "Centro de Ayuda - Login" y presiona en "Ingresa tu consulta"
    When ingresa su consulta "Mo" en el buscador
    And visualiza el mensaje '"Mo" es muy corto, escribe' 'por ejemplo: "Movimientos"'
    Then presiona la X del buscador
    And visualiza el buscador con "Lo más buscado:"
 
@helpcenter_webview_login_other_users_searched
Scenario: [CDP_12][Unhappy Path][Search] Que no haya resultados de búsqueda, ingreso a una PF de "Otros usuarios buscaron" y restablecimiento del buscador
    Given el usuario está registrado en Yape y presiona el boton "Ya tengo una cuenta"
    And el usuario presiona en "Ingresa al Centro de Ayuda"
    And accede al "Centro de Ayuda - Login" y presiona en "Ingresa tu consulta"
    When ingresa su consulta "xyz" en el buscador
    And visualiza el mensaje 'No se encontraron resultados' 'para "xyz"'
    And revisa el resultado "Otros usuarios buscaron:"
    And presiona el resultado "¿Por qué no puedo yapear?"
    And visualiza la pregunta frecuente "¿Por qué no puedo yapear?"
    Then presiona "Ir hacia atrás" de 1 PF y regresa al buscador
    And visualiza el mensaje 'No se encontraron resultados' 'para "xyz"'
    And presiona la X del buscador
    And visualiza el buscador con "Lo más buscado:"

@helpcenter_webview_login_faq_status_unpublished_hidden
Scenario Outline: [CDP_13][Unhappy Path][Search] Cuando la pregunta frecuente no está publicada o está oculta, no debe mostrarse en el buscador
    Given el usuario está registrado en Yape y presiona el boton "Ya tengo una cuenta"
    And el usuario presiona en "Ingresa al Centro de Ayuda"
    And accede al "Centro de Ayuda - Login" y presiona en "Ingresa tu consulta"
    When ingresa su consulta "<text>" en el buscador
    And revisa el resultado "Sugerencias de búsqueda:"
    Then no debe visualizar en el resultado "<result>" porque la PF "<reason>"
    Examples:
      | text      | result                                      | reason            |
      | desafilio | Si me desafilio, ¿qué pasa con mi YapePOS?  | no está publicada |
      | pasaje    | ¿Cómo compro un pasaje desde Viajar en bus? | está oculta       |