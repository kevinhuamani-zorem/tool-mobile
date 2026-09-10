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

El almacenamiento es `tests/golden/` del repositorio Git del recorder, tanto en
desarrollo como en la app instalada. Se detecta el checkout del recorder o se
selecciona desde **Revisión QA y golden → Ver casos golden → Repositorio compartido**. La selección local
persiste en `config/golden-repository.json` del runtime y no se versiona. Si falta
el checkout, la generación/exportación continúa sin ejemplos; guardar golden
requiere seleccionarlo. No se utiliza `runtime/golden` como fallback. Ver el
[flujo para compartir por Git](../tests/golden/README.md).

Se versionan snapshots y publicaciones al incluirlos en un commit/PR del recorder;
los demás QA los reciben al actualizar su rama. Guardar no hace operaciones Git.
El almacenamiento contiene:

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

## Almacenamiento compacto, sin cambiar la aprobación

Cada versión conserva físicamente `manifest.json`, los archivos propios del caso
bajo `expected/` y un `evidence.pack.gz`. Las publicaciones permanecen fuera de la
versión. Los archivos planificados, asociados al recibo o renombrados desde una
ruta planificada son propios; recorrer relaciones de login o helpers no los
convierte en nuevas capas del caso.

El archivo comprimido contiene un inventario de nombres lógicos y blobs por SHA-256,
codificados en base64 y comprimidos con gzip. Contenidos idénticos se guardan una
sola vez. Conserva catálogo, baselines, dependencias, respuestas, correcciones y
procedencia completos. El manifiesto sigue describiendo todos los artefactos
lógicos originales, aunque ya no exista un archivo físico por cada entrada.

`GoldenSnapshotReader` lee ambos formatos y verifica los hashes. Un archivo suelto
alterado no se oculta recurriendo a una copia comprimida. No cambian los bytes del
manifiesto, la versión, los eventos, las fechas, la declaración QA ni sus hashes.
La migración no es una nueva aprobación y tampoco activa versiones retiradas.

```sh
npm run golden:compact
npm run golden:seed-memory
```

`golden:compact -- --root <dataset>` permite indicar otro dataset. Verifica cada
versión aprobada, prepara y comprueba el archivo comprimido, lo publica antes de
retirar duplicados y vuelve a verificar. Es repetible y conserva versiones
históricas. Los nuevos golden se guardan compactos de origen. Actualiza el recorder
antes de recibir snapshots compactos: versiones anteriores no saben leerlos.

Para inspeccionar un artefacto lógico desde el repositorio compilado:

```sh
node -e "const {GoldenSnapshotReader}=require('./dist/core/automation'); process.stdout.write(new GoldenSnapshotReader(process.argv[1]).require(process.argv[2]))" <directorio-version> qa-changes.json
```

La compactación comprueba integridad; no acredita equivalencia de replay. El
catálogo de aprobación puede diferir del catálogo del plan original y los módulos
compartidos pueden estar guardados como proyecciones. Conserva y reporta esas
discrepancias con `golden:replay`, sin ajustar los esperados aprobados.

## Interfaz del Recorder

La biblioteca **Casos golden** usa el tema oscuro del Recorder. Permite buscar
por caso, squad o QA y filtrar referencias o casos reservados para evaluación.
Cada tarjeta muestra su uso y aprobación; la versión y la acción de retirada
quedan en **Detalles de la versión**. **Repositorio compartido** muestra la ruta
y permite cambiar el checkout.

El inicio distingue **Grabar y automatizar** de **Revisión QA y golden**. Este
segundo apartado reúne **Revisar cambios del framework**, **Ver casos golden** y
**Actualizar referencias**, con descripciones y una guía para preparar, aprobar y
compartir un caso. Está disponible sin dispositivo; el contexto de framework y
squad permanece visible en ambos apartados.

**Actualizar referencias**, disponible también dentro de la biblioteca, ejecuta
el mismo rebuild aprobado y refresh de referencias que `npm run golden:seed-memory`
mediante `preload`/IPC, sin procesos de terminal. Informa progreso, casos aprobados,
reservas y problemas de ambos índices. Un problema de recuperación no desaparece
al refrescar la lista. Deshabilita envíos duplicados y permite reintentar o elegir
el repositorio ante errores. No aprueba casos, descarga Git, ejecuta pruebas ni
reactiva memoria legacy. La compatibilidad con cada caso se verifica al consultar
las referencias durante la generación.

En la revisión del caso, **Revisar y guardar golden** abre los archivos propios;
las dependencias y los diagnósticos se despliegan por separado. El QA declara
el resultado en dispositivo, elige el uso y marca la aprobación explícita antes
de guardar. La exportación mantiene su flujo independiente. Los resultados y
notas opcionales del panel se conservan al abrir esta revisión. Escape cierra
el modal y devuelve el foco al control de origen; durante una escritura no se
cierra ni se envía una segunda aprobación.
