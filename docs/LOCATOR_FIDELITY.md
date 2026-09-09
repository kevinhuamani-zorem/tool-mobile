# Fidelidad de locators

El selector original, su plataforma y la pareja `locatorType`/`locatorValue`
constituyen una sola identidad. El framework guarda el valor en JSON y el tipo
en el getter: validar únicamente uno de los dos no garantiza la ejecución.

## Implementación por fases

1. **Regresión reproducible.** `locatorFidelity.test.js` cambia ANDROID a XPATH
   manteniendo idéntico el JSON, tanto para create como reuse. No se dispone
   del paquete de la otra PC: el fixture reproduce el defecto reportado.
2. **Evidencia persistida.** `recordedLocator` conserva datos explícitos,
   diagnostica contradicciones o pares incompletos y comprueba composición con
   el framework local. La lectura y preparación no reescriben el recording.
   En legacy se admite inferencia inequívoca, incluidos resource-id; nunca se
   asigna XPath a texto ambiguo como salida válida. Los valores conservan
   espacios interiores y diacríticos.
3. **Generación.** La pareja alimenta la generación determinista. Los argumentos
   del getter siguen la firma real de getElement, en Android/iOS o iOS/Android.
   La plataforma activa de un locator reutilizado exige un tipo conocido.
   Zorem recibe la misma regla. El Recorder corrige un enum equivocado solo
   si el getter/import/referencia son comprobables y el valor coincide exactamente.
   Esta operación no consume otra pasada de agente.
4. **Validación y revisión.** Se inspeccionan tipos de getters nuevos y
   reutilizados aunque el JSON no cambie. Se reconocen completions autorizados.
   Una reutilización autorizada puede sustituir un selector débil: se verifica
   contra el valor sin modificar del framework y su estrategia comprobable,
   siguiendo su sintaxis nativa o una declaración única del getter.
   Los baselines QA y el contenido revisado no se normalizan automáticamente.
   Un valor diferente, tipo ambiguo o evidencia contradictoria no autoriza una
   corrección por inferencia. Se conserva el diagnóstico y la exportación F3.
5. **Pruebas y medición.** La matriz incluye Android UiSelector, resource-id,
   XPath, accesibilidad, iOS predicate/class chain, legacy, firmas en ambos
   órdenes y salida original del proveedor antes del handoff. Las pruebas se
   versionan; los golden ya aprobados conservan sus bytes. Una nueva referencia
   solo se incorpora con aprobación QA explícita.

## Informes

`agents/zorem/locator-fidelity.json` registra por pasada el plan, la composición
del framework local, las acciones comprobadas, las que coincidieron antes de
corregir, los hallazgos, verificaciones pendientes y las correcciones aplicadas.
La importación automática escribe su propio `locator-fidelity.json` en la raíz
del paquete. Ambos informes se capturan en el historial; la salida del proveedor
se conserva antes de normalizar. El preview informa los enums corregidos.

`agents:evaluate` expone `metrics.locatorFidelity`: fidelidad previa a la
corrección del Recorder (coincidencias / acciones comprobadas por pasada), getters
corregidos, observaciones sin verificar e intentos sin medición. No confundir
estas observaciones por pasada con cantidad de casos ni con éxito funcional.
El resultado estático final y la salida inicial del agente son datos distintos.

## Validación funcional pendiente por entorno

Después de actualizar ambas PCs, generar el mismo recording contra sus ramas
respectivas, comparar los informes y ejecutar el caso en el dispositivo. Una
firma diferente debe producir argumentos adecuados a esa firma; una estrategia
no soportada debe producir diagnóstico. Los fixtures de esta suite no acreditan
esta ejecución ni sustituyen una revisión QA/golden.
