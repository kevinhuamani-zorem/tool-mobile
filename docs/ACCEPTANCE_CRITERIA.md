# Criterios de aceptación y resultado del caso

La revisión del Recorder distingue tres comprobaciones: estructura técnica,
implementación de los criterios acordados por el QA y resultado funcional de
la ejecución. Una validación técnica sin errores no acredita que el caso pase
en el dispositivo.

## Definir criterios desde el Recorder

En **Análisis**, conserva el objetivo y el resultado esperado del caso. El
bloque **Criterios de aceptación** permite añadir comprobaciones concretas sin
escribir JSON ni nombres de métodos:

- **Resultado de negocio · revisión del QA:** describe una condición cuya
  implementación requiere revisión humana. Permanece sin evaluar por el
  Recorder; la respuesta del agente no la aprueba.
- **Comprobación grabada:** selecciona la acción de verificación correspondiente.
  La comprobación estática contrasta su implementación con la evidencia grabada.
- **Fecha de movimientos dentro del rango:** selecciona la comprobación de fecha
  y los últimos días esperados. El soporte inicial reconoce aserciones del
  framework que comprueban la fecha más antigua dentro del rango. Mostrar una
  fecha no basta; una implementación desconocida queda sin evaluar.

Marca **Es indispensable para considerar correcto el caso** para señalar un
criterio crítico. Un criterio añadido debe tener descripción y los datos que
requiere su tipo; se puede quitar para continuar sin él. No se añaden criterios
ni resultados de negocio automáticamente a una grabación anterior.

Los criterios se guardan al iniciar la generación dentro de
`scenario.request.acceptanceChecks`. Mantienen ID, descripción, tipo, carácter
crítico y, cuando corresponda, secuencia y días. Retomar la grabación o abrir
una regeneración restablece estos campos. Reanalizar usa la edición del QA;
un caso nuevo limpia los criterios del anterior. El texto `acceptanceCriteria`
continúa admitido para grabaciones y clientes anteriores.

## Interpretar la revisión

**Validación técnica** informa los diagnósticos de las reglas estáticas. No
presenta el score técnico como un porcentaje de éxito del caso.

**Implementación de los criterios** muestra cada criterio como implementado,
con fallos o sin evaluar, junto a su evidencia. El porcentaje describe la
implementación comprobada de los criterios; no es una tasa de ejecución exitosa.
Los criterios indispensables fallidos se identifican por separado. Sin criterios
ni evaluación disponible, la interfaz muestra **sin evaluar**.

**Ejecución funcional: pendiente** significa que las comprobaciones de código
no demuestran el resultado en el dispositivo. La declaración del QA al revisar
el golden permanece separada del diagnóstico automático. No se deduce ejecución
exitosa de la aprobación del golden ni de un score técnico.

La evaluación corresponde a los bytes de la revisión validada. Editar los
archivos cambia su estado a **pendiente de revalidar**; **Revalidar** solicita la
evaluación de la versión actual. Los errores de calidad y los criterios
pendientes no añaden barreras a **Exportar al framework** ni a la aprobación
explícita del golden. Se conservan las comprobaciones de rutas, token y cambios
concurrentes que protegen la escritura.

## Verificación de interfaz

`tests/rendererAcceptanceCriteria.test.js` cubre la captura de formularios,
serialización sin compartir objetos mutables, recuperación de IDs y secuencias,
selección de verificaciones válidas, render seguro del texto QA, estados sin
evaluar, exportación con criterios críticos fallidos y el flujo real de abrir
regeneración y reanalizar hasta el payload IPC. Las pruebas de montaje comprueban
que los listeners se retiran y no se duplican al remontar.
