Feature: Validar pantalla de mis direcciones 
  Yo como usuario de Yape 
  Quiero visualizar correctamente la sección de mis direcciones
  Y las funcionalidades disponibles según lo guardado en mi perfil

  Rule: Mostrar correctamente la información de la pantalla de "Mis direcciones"

    @menu_my_addresses @YAPEEG-17132
    Scenario Outline: Validar pantalla de mis direcciones cuando existen direcciones guardadas
      Given el usuario <username> inicia sesión en Yape
      When el usuario da click al menu del home
      And hace clic en la opción Mis direcciones del menu
      Then se muestra correctamente la pantalla de Mis direcciones
      And se visualizan las direcciones guardadas 
      
      Examples:
        | username                   |
        | Andree 20 TDReceptor       |

    @menu_my_addresses @YAPEEG-17133
    Scenario Outline: Validar pantalla de mis direcciones cuando se añade una nueva dirección usando ubicación actual
      Given el usuario <username> inicia sesión en Yape
      When el usuario da click al menu del home
      And hace clic en la opción Mis direcciones del menu
      Then se muestra correctamente la pantalla de Mis direcciones
      When se hace click en el boton nueva direccion
      And se completa el formulario de nueva direccion usando la ubicacion actual
      Then se visualiza la nueva direccion en la lista de mis direcciones
      
      Examples:
        | username                   |
        | Andree 19 TDYape           |

    @menu_my_addresses @YAPEEG-17134
    Scenario Outline: Validar pantalla de mis direcciones cuando se añade una nueva dirección usando otra ubicación
      Given el usuario <username> inicia sesión en Yape
      When el usuario da click al menu del home
      And hace clic en la opción Mis direcciones del menu
      Then se muestra correctamente la pantalla de Mis direcciones
      When se hace click en el boton nueva direccion
      And se completa el formulario de nueva direccion usando otra ubicacion
      Then se visualiza la nueva direccion en la lista de mis direcciones
      
      Examples:
        | username                   |
        | Andree 19 TDYape           |
    
    @menu_my_addresses @YAPEEG-17135
    Scenario Outline: Validar pantalla de mis direcciones cuando se modifica una dirección pre existente
      Given el usuario <username> inicia sesión en Yape
      When el usuario da click al menu del home
      And hace clic en la opción Mis direcciones del menu
      Then se muestra correctamente la pantalla de Mis direcciones
      And se visualizan las direcciones guardadas 
      When se hace click en el boton editar direccion
      Then se visualiza la direccion modificada en la lista de mis direcciones
      
      Examples:
        | username                   |
        | Andree 20 TDReceptor       |