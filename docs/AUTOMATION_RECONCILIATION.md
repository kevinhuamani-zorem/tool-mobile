# F5 — Regeneración y reexportación con correcciones QA

El mismo recording puede recorrer exportación → corrección en el framework →
regeneración → revisión → reexportación, también durante o después del PR.
Cada solicitud crea una revisión y un intento nuevos con las dos pasadas de F2.
Exportar sigue sin aprobar un golden ni enseñar mediante memoria legacy.

## Uso

1. Selecciona el caso en **Reprocesar / refinar** y describe la mejora, o retoma
   la grabación para añadir acciones y vuelve a preparar el caso.
2. El recorder recupera el código actual del checkout antes de armar el paquete.
   No exige score 100, cuatro capas exportadas, commit, conexión a GitHub o merge.
   Si hubo movimientos ambiguos, usa primero **Recuperar cambios del framework**
   y guarda la asociación explícita. Los pendientes de recuperación se conservan.
3. El agente recibe el código QA como base y las rutas vigentes del plan. Lorem
   recibe Feature/Steps; Zorem, Screen/Locators y dependencias recuperadas.
   `baseline-response.json` tiene prioridad sobre el borrador determinista.
4. Revisa el resultado. Los cambios compatibles con el framework actual se
   combinan antes de mostrar el preview. Si ambos editaron la misma región,
   aparecen marcadores `PROPUESTA`, `BASELINE_QA` y `FRAMEWORK` en el editor.
   Conserva la versión deseada, elimina los marcadores y pulsa **Revalidar**.
5. **Exportar al framework** escribe exactamente los bytes revisados. Los
   diagnósticos de calidad siguen visibles y no exigen score 100. Un conflicto
   pendiente o un cambio del destino posterior al preview requiere otra revisión.
6. Repite cuando llegue otro comentario del PR. Después de cambiar de rama,
   rebase o merge, prepara o reimporta usando el checkout seleccionado.

Una revisión QA recuperada no representa una ejecución exitosa: la aprobación
funcional y la publicación golden siguen separadas y corresponden a F6.

## Base y autoridad

`AutomationPackageBuilder.prepareRegeneration` recupera el framework mediante
F4 cuando hay recibo de exportación. Conserva el historial antes de limpiar los
outputs de la corrida anterior. Si se prepara de nuevo un intento todavía no
exportado, vuelve a leer las rutas de su base anterior; una ruta movida pendiente
necesita asociación antes de escribir. La regrabación vuelve a resolver las
acciones actuales y mantiene las rutas del caso recuperado.

El nuevo `generation-plan.json` contiene `reconciliation.revisionId`.
`framework-baseline.json` guarda recordingId/planId, revisión fuente, contexto
local de Git/PR, contenido del checkout, alcance por símbolo y pendientes.
Tiene un artefacto inmutable en `history/v1` con etapa `regeneration:baseline`; el
importador verifica su hash e identidad. Ni la copia mutable del paquete ni los
checkpoints posteriores pueden reemplazar esa autoridad.

`baseline-response.json` es contexto de código con `origin: qa-framework`.
No se copia como respuesta de un agente nuevo ni se reutiliza el resultado de un
intento anterior. Las acciones grabadas originales siguen siendo evidencia;
modificar métodos o parámetros no fabrica nuevos eventos Appium.

## Reconciliación y concurrencia

`automationReconciliation.ts` compara la base capturada al preparar, la propuesta
y el contenido actual. En módulos compartidos limita la propuesta a símbolos del
caso y adiciones; conserva los métodos y locators ajenos. Un archivo inicialmente
creado por el recorder puede convertirse en compartido al incorporar otros casos.
La asociación explícita de todo el archivo debe hacerse desde la recuperación.

La combinación de texto utiliza `git merge-file --diff3` sobre archivos
temporales aislados. No ejecuta checkout, merge, rebase, commit ni comandos sobre
el historial Git del framework. Regiones que Git no puede combinar quedan para
revisión; no se elige automáticamente entre dos cambios solapados.

`AutomationApplier` prepara los bytes completos, los hashes de los destinos y el
contexto de repo/rama/commit antes de emitir un token. Resolver un conflicto exige
el preview anterior y comprueba que el framework siga igual. Aplicar vuelve a
comprobarlo inmediatamente antes de escribir. También protege symlinks, rutas
fuera del plan, creaciones concurrentes y cambios de checkout.

El flujo legacy conserva `requireUnchangedAppliedFiles`. La ruta F5 usa su
baseline histórico y la comparación de tres versiones para incorporar cambios
externos legítimos; mantiene la comprobación concurrente final. Si una ruta se
movió desde la preparación, se recupera de nuevo antes de escribir.

Todos los destinos, completions, registry y metadatos participan en el rollback
existente. El recibo conserva diagnósticos y capas faltantes; los eventos previos
de fallo siguen intactos. El registro no adopta como propios módulos compartidos
que ya pertenecían al framework.

## Validación

`tests/automationReconciliation.test.js` cubre dos ciclos reales por los servicios
IPC de importación/aplicación, cambios QA sin commit, rutas renombradas,
regrabación con acciones nuevas, conflictos editables, concurrencia, protección
por símbolo, exportación parcial, Unicode en contexto por autor, integridad del
baseline y rollback. También verifica otra solicitud sin exportar, preservando
helpers y trazas sin heredar salidas. Incluye repositorios temporales con rebase
y merge reales.
El piloto con Copilot, dispositivo y `.app` sigue en F7.
