# Golden dataset compartido del recorder

Esta carpeta pertenece al repositorio Git del recorder. Desarrollo y la app
instalada leen y guardan aquí los casos aprobados por QA. El corpus empieza vacío:
los fixtures de las pruebas no se convierten en aprobaciones reales.

## Conectar la app

La app detecta el checkout del recorder que utiliza como origen del runtime.
En otra máquina, clona el recorder y abre **Configuración → Casos golden →
Seleccionar repositorio**. Selecciona la raíz del clon, donde está su `package.json`;
el panel muestra la ruta completa a `tests/golden`. También admite worktrees Git.
La selección se conserva localmente en `config/golden-repository.json` del runtime,
excluida de Git. No requiere reinstalar ni reiniciar la app.

Si el clon se mueve o no está disponible, vuelve a seleccionarlo. La generación y
exportación pueden continuar sin referencias golden; aprobar un golden requiere
el repositorio. No se crea otro dataset automáticamente dentro de `runtime`.

## Compartir un caso

1. Actualiza tu rama del recorder antes de aprobar. Recupera los cambios del
   framework, incluidos los realizados durante el PR, y guarda la revisión QA.
2. Revisa los archivos en **Guardar como golden verificado por QA**, declara el
   resultado de ejecución y elige **Referencia para los agentes**. Aprueba el
   preview exacto. Los casos destinados a medir calidad sin revelar la solución
   deben usar **Reservado para evaluación**.
3. En el repositorio del recorder, comprueba el dataset e incluye sus cambios:

   ```sh
   npm run golden:seed-memory
   git add tests/golden
   git diff --cached --stat
   git commit -m "test: add QA approved golden cases"
   git push
   ```

4. Envía un PR del recorder. Es independiente del PR del framework: el primero
   comparte el ejemplo; el segundo comparte el código de automatización.
5. Los demás QA actualizan la rama que consume su app con `git pull --ff-only`.
   Pueden ejecutar `npm run golden:seed-memory` o **Reconstruir índice aprobado**
   para comprobar la integridad. Cada generación consulta las publicaciones del
   checkout y selecciona únicamente referencias activas y compatibles con su
   framework. No necesita las grabaciones ni el runtime local de quien aprobó.

Guardar confirma una aprobación local; no hace commit, push, PR ni pull por sí
solo. Si después cambias el caso, recupera/revisa/aprueba otra versión y comparte
el nuevo commit. Retirar una referencia también crea un cambio para compartir.
La suite de pruebas del recorder verifica la integridad del dataset incluido en el PR.
No edites snapshots ni eventos existentes. Los hashes no se recalculan para
ocultar cambios en el código aprobado.

## Qué se versiona

- `approved/<goldenId>/versions/<versionHash>/`: código esperado por capa, paquete
  del caso, baselines, dependencias, diagnósticos y correcciones QA con procedencia.
- `approved/<goldenId>/publications/`: aprobaciones y revocaciones inmutables,
  con versión, revisión, autor, fecha, uso y declaración de ejecución.
- Este README y `.gitattributes`: preservan los bytes aprobados entre sistemas,
  incluso al usar `core.autocrlf`. No normalices saltos de línea de los snapshots.

El índice `approved-index.json`, los locks, temporales, selección de repositorio
local y archivos de runtime no se versionan. El índice se reconstruye desde los
snapshots y publicaciones; copiar solamente el índice no comparte el dataset.

## Cambios simultáneos y datos anteriores

Dos QA pueden añadir casos distintos. Si ambos aprueban el mismo caso desde la
misma publicación, sus eventos pueden tener el mismo número de secuencia aunque
Git no marque un conflicto textual. Ejecuta `npm run golden:seed-memory` sobre la
rama integrada: cualquier problema de integridad requiere revisión y el caso se
excluye de las referencias. Conserva la cadena publicada en la rama base y vuelve
a revisar/aprobar el cambio sobre esa base actualizada; no renumeres ni edites
publicaciones para unir cadenas divergentes.

Las versiones antiguas de la app podían usar `<runtimeRoot>/runtime/golden`.
Esta actualización conserva esos archivos pero deja de usarlos como destino.
Si existen, respáldalos y copia cada árbol completo `approved/<goldenId>` al nuevo
`tests/golden/approved/` solo cuando ese ID no exista en el destino. Comprueba con
`golden:seed-memory` antes del commit. Si ya existe el ID, conserva el original y
revisa/aprueba el caso en el dataset actualizado, sin sobrescribir su historial.
Los casos v1 requieren revisión y aprobación explícita; no reactives memoria legacy.

Los agentes usan estos ejemplos como contexto y correcciones recuperables; no
cambian los pesos del modelo ni quedan libres de fallos. Deben seguir respetando
las evidencias, las cuatro capas y el máximo de dos pasadas. Para métricas y
compatibilidad, consulta [F7](../../docs/AUTOMATION_GOLDEN_LEARNING.md) y el
[contrato de aprobación](../../docs/AUTOMATION_GOLDEN_APPROVAL.md).
