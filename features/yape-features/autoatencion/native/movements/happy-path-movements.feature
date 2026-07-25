@autoatencion
Feature: Esta funcionalidad es sobre la lista de movimientos mostrada dentro del centro de ayuda

  @autoatencion @regresion_lista_movimientos @dosultimosmov
  Scenario: [HP][NT][CDA] Verificar que se muestren los 2 últimos movimientos en el CDA del home
        Given el usuario Fiorela Contreras Mauricio inicia sesión en Yape
        When ingreso al CDA del home
        Then se debe mostrar solo 2 movimientos


  @autoatencion @regresion_lista_movimientos @sinmovimiento
  Scenario: [HP][NT][CDA] Verificar usuario sin movimientos en el CDA
        Given el usuario Luis Retamozo BCP sin mov inicia sesión en Yape
        When ingreso al CDA del home
        Then al seleccionar "Ayuda con un movimiento" se debe mostrar mensaje "Aún no haz hecho ningún yapeo"

    @autoatencion @regresion_lista_movimientos @nuevo_movimiento
    Scenario Outline: [HP][NT][CDA] Validar que se actualice correctamente los nuevos movimientos en CDA
        Given el usuario <username> inicia sesión en Yape
        And el usuario ingresa a la opcion de yapear
        And el usuario deberia visualizar la seleccion de contactos
        And el usuario ingresa el numero telefonico a yapear: <cellphone>
        And ingresa el monto de yapear <amount>
        And ingresa un comentario <comment>
        And selecciona yapear
        And obtengo datos de la transacción realizada
        And el usuario vuelve a Home desde winstate
        And ingreso al CDA del home
        And ingreso a ver todos los movimientos
        When selecciono actualizar
        Then se debe mostrar la transacción realiza validando la fecha y hora de la misma
        Examples:
            | username            | cellphone |highamount|amount| comment|
            | Chris Retam TD001 | 954 146 047 | 5        |0.5  | yape prueba |



    @autoatencion @regresion_lista_pautas @resuelve_problema_si
    Scenario Outline: [HP][FE][ANDROID][IOS] Ver detalle de pauta - ¿Esta información resuelve tu problema? - SI - PDS
      Given el usuario Luis Retamozo General inicia sesión en Yape
        When ingreso al CDA del home
        And ingreso a ver todos los movimientos
        And el usuario selecciona un movimiento <movimiento>
        And el usuario selecciona una pauta <pauta>
        Then el usuario visualiza la sección de consulta Esta información resuelve tu problema con las opciones NO y SI
        And el usuario selecciona la respuesta SI
        And el usuario valida que se muestra imagen de confirmación y  texto ¡Nos alegra poder ayudarte!
        Examples:
            | movimiento            | pauta |
            |Recarga a mi número|Se envió a número equivocado| 


    @autoatencion @regresion_pautas @resuelve_problema_no
    Scenario Outline: [HP][FE][ANDROID][IOS] Ver detalles de pauta - ¿Esta información resuelve tu problema? - NO - PDS
      Given el usuario Luis Retamozo General inicia sesión en Yape
        When ingreso al CDA del home
        When el usuario selecciona la opcion de Ayuda con un movimiento
        And el usuario selecciona un movimiento <movimiento>
        And el usuario selecciona una pauta <pauta>
        Then el usuario visualiza la sección de consulta Esta información resuelve tu problema con las opciones NO y SI
        And el usuario selecciona la respuesta NO
        Then el usuario visualiza un bottomsheet ¿Te quedaste con alguna duda?
        And el usuario visualiza el boton HABLAR CON UN ASESOR
          Examples:
            | movimiento            | pauta |
            |Recarga a mi número|Se envió a número equivocado| 


    @autoatencion @regresion_pautas @resuelve_problema_no_boton_back
    Scenario Outline: [HP][FE][ANDROID][IOS] Ver detalle pauta - ¿Esta información resuelve tu problema? - NO - Botón back
      Given el usuario Luis Retamozo General inicia sesión en Yape
        When ingreso al CDA del home
        And el usuario selecciona la opcion de Ayuda con un movimiento
        And el usuario selecciona un movimiento <movimiento>
        And el usuario selecciona una pauta <pauta>
        And el usuario selecciona la respuesta NO
        Then el usuario visualiza un bottomsheet ¿Te quedaste con alguna duda?
        And el usuario visualiza el boton HABLAR CON UN ASESOR
        When el usuario hace back con el botón superior o el nativo del celular
        Then el usuario valida que se ocultará el bottomsheet ¿Te quedaste con alguna duda? y permanecerá en la pantalla
          Examples:
            | movimiento            | pauta |
            |Recarga a mi número|Se envió a número equivocado| 
    
    
    @autoatencion @regresion_movimiento @ayuda_otro_movimiento
    Scenario Outline: [HP][FE][ANDROID][IOS] Usuario selecciona "NECESITO AYUDA CON OTRO MOVIMIENTO" en pantalla de movimientos - 7 movimientos
      Given el usuario Luis Retamozo General inicia sesión en Yape
        When ingreso al CDA del home
        And ingreso a ver todos los movimientos
        And el usuario selecciona la opcion Necesito ayuda con otro movimiento
        Then validar que se muestre la pantalla de Ayuda con movimiento
        And al seleccionar retroceder validar que se regrese a la pantalla de movimientos