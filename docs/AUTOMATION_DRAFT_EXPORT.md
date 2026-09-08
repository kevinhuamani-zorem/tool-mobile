# F3 — Exportar borradores con observaciones

El QA usa **Exportar al framework** desde Revisión. Puede exportar una propuesta
con errores de TypeScript, Gherkin, aserciones o parámetros, y también las capas
recuperadas tras las dos pasadas de F2. No requiere score 100 ni un modo avanzado.
El resultado sigue pendiente de ejecución y aprobación QA.

## Preparación y límites de escritura

La importación informa dos resultados independientes: `validation.valid` describe
la calidad; `exportReady`, `previewToken` y `exportBlockers` describen si se puede
escribir el conjunto revisado. `success: false` de generación/importación puede
incluir un `draft` exportable. El fallo autónomo no se convierte en éxito.

Cada archivo debe pertenecer a la capa/ruta del plan, sin duplicados, y la
respuesta debe corresponder al recording y plan activos. Un JSON ilegible se
conserva como evidencia; solo se exportan capas recuperables con destinos conocidos.
Un conjunto vacío no tiene token. No se crean archivos vacíos para completar capas.

`AutomationApplier.prepare` calcula el contenido final antes de mostrarlo. En un
archivo compartido incorpora únicamente adiciones y completions autorizados por
el plan; conserva las implementaciones previas. Un update sin adiciones conserva
el baseline, incluso si la propuesta intenta reemplazarlo. El QA ve el resultado
final y el diff antes de exportar. Si una edición del preview no puede preservarse
por el merge aditivo, se requiere revalidar y revisar ese resultado final.

La aplicación vuelve a comprobar paquete, token, rutas, hashes y contenidos del
destino. Rechaza symlinks, incluidos enlaces rotos, archivos ajenos que se pretendan
reemplazar y cambios concurrentes. Un conflicto de escritura no exige corregir los
errores de calidad. Se mantienen escritura atómica por archivo y rollback de las
capas, registry, recibo y metadatos de aplicación si falla escritura/finalización.
La transacción no es una garantía de recuperación tras corte de energía.

El contenido se escribe exactamente como fue revisado, sin volver a normalizar
Unicode o reparar código al exportar. Los diagnósticos de Unicode siguen visibles.
Las comprobaciones de calidad/compilación se ejecutan y se conservan, pero sus
resultados no impiden escribir. El token se consume tras exportar.

## Recibo y resultado

`application-receipt.json` v2 conserva compatibilidad de lectura con v1/v2 previos.
Las nuevas exportaciones incluyen identidad de exportación/revisión/intento y solo
los archivos realmente incluidos, con hash previo (`null` si es nuevo), hash
exportado y símbolos añadidos reconocibles. No se atribuyen símbolos heredados de
un archivo compartido; si el código no permite reconocerlos, la lista puede estar
vacía y la ruta/hash siguen disponibles. Los completions externos autorizados
participan en el mismo recibo y transacción.

El recibo contiene las capas faltantes, validación y diagnósticos de recuperación.
Con errores o capas incompletas se registra `exported-with-observations`; una salida
sin ellos se registra `exported`. Los avisos informativos siguen en validación.
`agent-run.json` agrega `exportResult` y `exportedAt` sin reemplazar `result` del
intento. El historial guarda un evento de exportación independiente y conserva
`generation`, aprobación QA y verificación funcional como resultados separados.

**Exportar no aprueba golden ni promueve memoria.** F4 ya recupera las correcciones
del framework en una revisión QA; F5 permitirá los ciclos de regrabación/regeneración y reexportación
durante el PR; F6 incorporará aprobación golden explícita y versiones inmutables.
Los cambios externos pueden recuperarse con F4; la reconciliación para
reexportar se implementará en F5. F3 no certifica ejecución en dispositivo.

## Verificación

`automationDraftExport.test.js` prueba exportación de Screen sin Feature con método
inexistente, sintaxis inválida y bytes NFD/CRLF, revalidación sin respuesta completa,
recibos parciales, historial separado, preservación de código compartido, rutas,
symlinks, cambios concurrentes y el botón enviando código inválido al IPC.
`preparedAutomation.test.js` verifica rollback ante la segunda escritura y ante
un fallo al registrar el evento final, además de completions externos.
