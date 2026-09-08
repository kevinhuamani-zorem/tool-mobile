# Versiones golden e índice aprobado

**Guardar como golden verificado por QA** abre una revisión de los archivos
concretos. El QA marca la aprobación y declara por separado si ejecutó el caso.
El token queda ligado al paquete, revisión, contenido y checkout. Un cambio
posterior requiere otro preview. No exige score 100, validación verde, ejecución
adicional, commit ni PR integrado. Conserva los diagnósticos tal como se obtuvieron.

Publicar golden no escribe el framework, el recibo de exportación ni la entrega
del agente. Exportar sigue siendo la operación de F3/F5. Para correcciones externas,
usa **Recuperar cambios del framework → Guardar revisión QA → Revisar como golden**.
F6 toma el artefacto inmutable de esa revisión, incluyendo las dependencias del caso,
sus asociaciones pendientes y referencia de PR. Puede repetirse después de otro PR,
regrabación o regeneración. Las trazas pendientes no se convierten en eventos Appium.

El almacenamiento es `tests/golden/` en desarrollo y `runtime/golden/` en la app:

- `approved/<goldenId>/versions/<versionHash>/`: snapshot inmutable con manifiesto
  v2, paquete, baselines, código esperado, dependencias, diagnósticos, entregas de
  agentes y eventos históricos verificados. `qa-changes.json` conserva contenido y
  hashes antes/después. `catalog.json` es el catálogo consultado durante el preview
  de aprobación; no afirma reconstruir un catálogo del resolver que no se guardó.
- `approved/<goldenId>/publications/`: eventos encadenados por hash de aprobación
  o revocación. Fijan versión/manifiesto, revisión, actor local, fecha, declaración
  QA de ejecución y notas. Son la autoridad; se publican después de escribir y
  comprobar el snapshot. Nunca se reemplaza un evento previo.
- `approved-index.json`: proyección descartable. Incluye solo la última versión
  aprobada activa por caso, con ámbito, plataforma, contrato y procedencia. Cada
  lectura comprueba publicaciones, hashes y artefactos; un caso corrupto se excluye
  con un diagnóstico, sin rescatar silenciosamente una aprobación anterior.

La versión depende del código aceptado, dependencias, recording y contexto
congelado (incluidos los diagnósticos). Repetir la aprobación del mismo snapshot
no duplica versiones. Otra declaración de ejecución/notas puede publicar una
aprobación nueva sobre la misma versión; el historial conserva ambas declaraciones.
Cambiar código o contexto crea otra versión y sustituye la referencia activa.
Un cambio de reglas conserva sus nuevos diagnósticos aunque el código coincida.

Un fallo previo a la publicación no activa el snapshot; un reintento puede adoptar
una versión íntegra ya escrita. Si falla solo la proyección del índice o el evento
auxiliar en el historial del recording, la aprobación permanece confirmada y se
informa el problema. Los archivos temporales y el índice no se versionan en Git.
Los hashes verifican integridad local, no identidad remota del QA ni éxito funcional.
`execution.json` describe la primera declaración del snapshot; para la declaración
vigente se lee su publicación. No se fabrica evidencia de ejecución automática.

**Casos golden**, en Configuración, permite retirar versiones del índice,
reconstruirlo y revisar casos legacy v1 para aprobarlos explícitamente. Su score,
existencia o estado del PR nunca los promueve automáticamente. Los originales
legacy permanecen intactos y su manifiesto viaja como procedencia al promoverlos.

`ApprovedGoldenStore.compatible` comprueba ámbito/contrato y hashes actuales del
framework antes de ofrecer referencias. Para una recuperación compartida verifica
el hash completo observado por F4, conservando la proyección del caso como ejemplo.
Es conservador: una edición externa exige recuperación/revisión. El fingerprint
cambia al aprobar, sustituir, revocar o detectar corrupción; cualquier caché futura
debe depender de él. Las lecturas legacy siguen vacías. F7 implementa la selección de
referencias por capa y fragmentos con relaciones verificadas; ver
[AUTOMATION_GOLDEN_LEARNING.md](AUTOMATION_GOLDEN_LEARNING.md).

Desde terminal:

```sh
npm run golden:save -- <grabación>
# Revisar el código, contexto y diagnósticos impresos; copiar approvalDigest.
npm run golden:save -- <grabación> --approve <approvalDigest> --executed passed --notes "Validado por QA"
npm run golden:seed-memory
npm run test:golden
```

`--source recovery` selecciona la revisión QA recuperada. `golden:seed-memory`
conserva su nombre como alias de reconstrucción del índice aprobado; no reactiva
memoria legacy. Informa conteos e integridad y falla si detecta corrupción.
F7 incorpora negativos/equivalencias y el comando de replay. El corpus QA y
el piloto real siguen pendientes; guardar con aprobación QA no garantiza que el agente no falle.
