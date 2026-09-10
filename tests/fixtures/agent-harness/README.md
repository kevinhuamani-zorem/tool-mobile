# Corpus técnico del harness

Este corpus contiene tres **fixtures sintéticos**, inspirados en regresiones
reportadas para ventas (`TC-10239`), movimientos (`TC-10140`) y yapeo (`TC-10240`).
Sirve para repetir controles estáticos sin dispositivo, cuentas reales ni LLM.
No son recordings completos, casos golden ni evidencia de éxito funcional.

`corpus.json` define la identidad, plataforma, origen y SHA-256 de cada
`scenario.json` y `labels.json`. También referencia el catálogo sintético de
aliases de usuario. Las rutas son relativas a esta carpeta, sin enlaces
simbólicos; el loader compartido verifica los bytes antes de congelarlos.
Los tres casos están marcados `synthetic: true`, `pilotEligible: false` y
`qaReview.status: pending`. Un baseline congelado conserva ese estado: congelar
entradas no las convierte en un piloto listo para ejecutar ni en una aprobación.

## Entradas y procedencia

| Familia | Alcance de la reducción sintética | Acciones |
| --- | --- | --- |
| `sales-empty` | Consultar ventas y comparar el mensaje de estado vacío. | 2 |
| `movements-period` | Consultar períodos de 30/90 días, sus etiquetas y fechas visibles. | 7 |
| `yapeo-recipient` | Abrir yapeo, conceder permiso, buscar un destinatario y comparar su nombre y número enmascarado. | 7 |

Los conteos, los selectores `harness:id/*`, las fechas, los textos, el contacto
y los aliases son inventados para esta reducción. Las referencias
`source.sourceRecording` conservan solamente el ID y el hash de un escenario
local relacionado con la regresión, sin contenido ni rutas personales. No
afirman que las entradas sintéticas reproduzcan todos los pasos del original.

Cada escenario sigue `AutomationScenario`: las acciones están en `actions`,
con secuencia, estrategia y valor canónicos; `request.scenarioRows` conserva
su asociación con los Steps propuestos. El permiso Android conserva el ejemplo
`id=com.android.permissioncontroller:id/permission_allow_button` junto con
`TypeLocator.ANDROID` y su valor `new UiSelector().resourceId(...)`.

`selectorVerified: true` representa la precondición simulada del contrato que
recibe el generador. **No acredita una consulta al dispositivo**: los labels lo
identifican como `synthetic-contract-only`. El Given de login representa una
dependencia reutilizable del framework sintético; no una aprobación golden.
El YAML de usuarios contiene solamente nombres inventados, sin claves,
credenciales ni cuentas ejecutables. No debe copiarse a un framework real.

## Etiquetas propuestas y controles

Los criterios, expectativas de reutilización y mutaciones de `labels.json`
están pendientes de revisión (`reviewed: false`). Ninguno se añade a
`request.acceptanceChecks`, que pertenece al QA. `expectedRuleCodes` describe
el diagnóstico que se propone comprobar; su presencia no indica que la
mutación ya se haya ejecutado o detectado. El runner publica separadamente
cuáles controles implementó y el resultado observado de cada uno.

Se proponen controles de tipo/valor de selector, usuario inexistente, TC o Step
duplicado, aserción retirada y Gherkin mecánico. Movimientos añade rango de
fechas debilitado y modificación de una implementación reutilizada; yapeo
incluye una traza de getter que contradice el plan. El control de alias no
prohíbe `allowButton`: sólo debe fallar si el plan no autorizó ese nombre.

La igualdad con una fecha visible no prueba que todos los movimientos estén
dentro de un rango. Por eso los criterios de 30/90 días son propuestas
separadas, con referencias al fixture ya documentado
`acceptance-framework/date-range-profile`, sin afirmar equivalencia aprobada.
Yapeo termina antes de ingresar monto o transferir; no acredita un pago.

## Revisión y evolución

`node --test tests/harnessCorpus.test.js` comprueba integridad, confinamiento,
contratos de selector, trazabilidad y ausencia de aprobación implícita.
Requiere el build habitual para importar los contratos del recorder.

El corpus se comparte por Git con sus hashes. `.gitattributes` conserva los
bytes exactos de JSON/YAML entre sistemas operativos. Si se modifica una entrada,
actualiza su hash después de revisar el diff; cambiar el esperado para ocultar
un fallo no es una revisión válida. Las ejecuciones, reports y baselines
congelados son salidas locales; no se agregan a esta carpeta.

Para un piloto real se necesita otro conjunto de entradas revisadas por QA,
con datos y estado de app ejecutables, criterios y reutilizaciones confirmados,
commit del framework y matriz de dispositivo fijados. Los ejemplos golden
siguen exclusivamente su flujo de aprobación explícita en `tests/golden`.
Los controles técnicos, una exportación o un resultado verde no publican
casos golden ni prueban que los agentes hayan aprendido.
