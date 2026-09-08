# Generación por capas en dos pasadas — F2

Cada solicitud explícita de generación en el pipeline `layered` abre un intento
y dispone de dos pasadas: inicial y una corrección. Cada rol participa como
máximo una vez en cada pasada. No son dos llamadas globales: una ejecución puede
necesitar Lorem, Zorem y Sumrak en cada pasada (hasta seis sesiones), u omitir
roles cuyas entregas siguen sirviendo.

## Coordinación

- Lorem y Zorem pueden iniciar en paralelo con el contrato del borrador. Derek
  espera ambas terminaciones, incluso si una falla antes que la otra.
- Si Lorem cambia la interfaz provisional, la sincronización de Zorem se hace
  en la segunda pasada y comparte el límite con el feedback de integración.
- La revisión de diseño usa la participación inicial de Lorem. Si falla, el
  fallback de autoría utiliza la segunda pasada, sin una llamada adicional.
- Un error se dirige por archivo/código de regla y conserva el diagnóstico
  disponible, con esperado/observado cuando el validador los informa. No se
  inventan detalles que la regla no haya proporcionado.
- Una sesión entrega una versión. `stopAfterFirstOutput` termina el proveedor
  después de dos observaciones estables del archivo, incluso si el JSON es
  ilegible. Derek valida después de cerrarla: entrega no significa éxito.
  No se publican correcciones en vivo ni se abren sesiones `feedback-N`.
- Hang stop e idle stop permanecen activos. Un timeout o una segunda respuesta
  inválida termina con observaciones y archivos recuperables. Volver a generar
  por decisión del QA abre otro intento con su propio límite.

El protocolo anterior `deterministic/legacy` se conserva para diagnóstico y
compatibilidad; esta entrega cambia el pipeline por capas predeterminado del
wizard. Sus protocolos de consultas y reparación no son las pasadas de Lorem,
Zorem y Sumrak.

## Entregas recuperables

`layered-draft.json` es una vista de revisión del intento actual. Contiene
`files`, `missingLayers` y `diagnostics`. Cada archivo conserva su ruta exacta
del plan, contenido, origen (`agent`, `deterministic` o `qa`) y pasada conocida.
Solo se incorporan objetos recuperables; rutas ajenas, capas duplicadas,
identidades ajenas o JSON ilegible no permiten deducir archivos.

El borrador determinista aporta las capas que todavía no tienen una entrega del
agente. Una versión posterior ilegible no elimina la última capa recuperable.
Los originales, incluidos los inválidos, permanecen en el historial F1. No se
recuperan respuestas de intentos anteriores como si fueran nuevas entregas.

IPC devuelve ese borrador aunque falte Feature o falle Sumrak. Revisión abre el
editor automáticamente y muestra origen, capas faltantes y diagnósticos. El
payload no recibe un token de aplicación ni convierte el fallo autónomo en
éxito. Exportar con diagnósticos se implementa en F3; no se presenta F2 como una
exportación ya habilitada.

## Forma y tamaño

Antes de normalizar o analizar una entrega se comprueban el archivo local y un
límite de transporte de 4 MiB, hasta cuatro archivos, hasta 2000 trazas o
resoluciones y las formas de los campos recorridos. Estos son límites del
envelope recibido, independientes de los objetivos informativos de contexto.
No se trunca el código para aceptarlo: los bytes originales quedan en disco y
se informa el problema. El subconjunto completo del schema sigue en F7.

## Evidencia automatizada

Las pruebas cubren errores persistentes, reparación dirigida, cambio de
interfaz seguido de error de integración, timeout, autor lento paralelo, entrega
ilegible, campos `null`, arrays fuera de límite, rutas/identidades ajenas y
conservación de las cuatro capas cuando falla Sumrak. Se comprueban también el
adapter, la importación, el payload IPC y el editor sin Feature. Los proveedores
son simulados; el piloto real con QA, dispositivo y `.app` sigue en F7.
