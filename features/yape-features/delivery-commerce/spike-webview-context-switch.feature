Feature: Cambio de contexto WebView en Yape Tienda

@spikeCambioContextoWebView
Scenario: Cambiar a WebView en Tienda, interactuar y volver a nativo
    Given el usuario Carlos Barboza TFT inicia sesión en Yape
    And el usuario selecciona la opcion tienda
    And se listan los contextos disponibles y se cambia a WebView
    And el usuario hace click en un elemento de la webview
    And se cambia de nuevo al contexto nativo
    Then se valida que el usuario está de vuelta en la app nativa
