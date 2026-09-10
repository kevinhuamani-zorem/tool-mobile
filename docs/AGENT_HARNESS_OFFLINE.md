# Operación del harness offline — H0/H1

Fecha: 2026-09-09. Estado: **primer lote implementado; cierre QA y entorno pendiente**.

Esta entrega inicia la [estrategia H0–H5](AGENT_HARNESS_STRATEGY.md). Añade una
captura de baseline, un corpus sintético y controles del validador existente.
No contiene llamadas al proveedor, ejecución mobile ni nuevas aprobaciones golden.
La política de dos pasadas y la exportación de borradores conserva su comportamiento.

## Capturar y verificar un baseline

Desde el repositorio del Recorder, con Node y npm compatibles con su package.json:

```sh
npm run harness:baseline -- --framework /ruta/al/fwk-mobile-test --framework-commit 09674ce8ba298f650ad116c8d1dd82c7e19e8577 --directory /tmp/recorder-harness-baseline-01
npm run harness:baseline -- --verify /tmp/recorder-harness-baseline-01
```

Las rutas del ejemplo se sustituyen localmente. El commit debe existir en ese
repositorio y se declara completo; `main` no es un baseline estable. El destino
debe ser nuevo y estar fuera de los checkouts del framework y Recorder. Tampoco
se permiten enlaces o submódulos sin snapshot. No se sobrescribe evidencia previa.

La captura guarda un archive del **commit elegido**, excluyendo exportaciones
y modificaciones pendientes de QA. Incluye corpus y aliases sintéticos por hash,
identidad de código fuente y compilado del Recorder, lockfiles, herramientas y
estado local de los repositorios. Un cambio de fuente sin commit tiene otra huella.
`--verify` detecta modificaciones posteriores del manifiesto, corpus o framework.

`manifest.json` separa captura correcta de preparación del piloto:

- `readiness.baselineCaptured: true` acredita la captura de entradas.
- `readiness.pilot: "not-ready"` mantiene pendientes datos/revisión QA y dependencias.
- `framework.dependencies.status: "not-provisioned"`: no se ejecuta `npm ci` ni
  se hereda `node_modules` de la máquina. El lockfile y los engines son del commit.
- `framework.engines` compara las versiones con rangos mínimos `>=x.y.z`;
  cualquier rango desconocido se marca `unverified`.
- `execution` mantiene proveedor no invocado, ejecución funcional sin evaluar y
  aprobación no concedida. Exit 0 significa captura/integridad correcta; exit 2,
  entrada o preparación inválida. No significa que el caso pase.

La captura congelada no se modifica para instalar dependencias; un futuro runner
materializará otro checkout de ejecución y registrará su entorno. H0 no convierte
este artefacto ni sus casos sintéticos en un protocolo ejecutable de `agents:pilot`.

## Corpus compartido y controles

Los tres casos en [tests/fixtures/agent-harness](../tests/fixtures/agent-harness/README.md)
representan ventas vacías, movimientos por período y selección de destinatario.
Son reducciones sintéticas de regresiones reportadas; sus datos y selectores no
se ejecutan contra la app. Cada entrada tiene hash, familia y etiquetas propuestas.
Todas conservan `qaReview.pending`, `synthetic: true` y `pilotEligible: false`.
Los ejemplos aprobados por QA siguen guardándose exclusivamente en `tests/golden`.

```sh
npm run harness:controls -- --output /tmp/recorder-harness-controls-01.json
npm run harness:controls -- --framework /ruta/al/fwk-mobile-test --framework-commit 09674ce8ba298f650ad116c8d1dd82c7e19e8577 --output /tmp/recorder-harness-target-01.json
```

La primera modalidad usa un framework sintético aislado. La segunda lee el
commit del framework a un directorio temporal; nunca modifica su checkout QA.
Si un helper o locator fijado difiere del perfil soportado, el control queda sin evaluar.
La disponibilidad o el resultado de un catálogo de usuarios también permanece
explícito. No se reemplaza una dependencia divergente por una fixture para dar
un resultado verde. Cada informe necesita una ruta nueva fuera del framework.

Los controles llaman a `AutomationResponseValidator` mediante
`evaluateControlledFixture`; no hay otro juez paralelo ni otra orquestación.
Se comprueba primero una contraparte válida. Un negativo sólo cuenta como
acierto cuando aparece **su código esperado**; fallar por otra regla es un falso
negativo. Si falla la contraparte, sus mutaciones quedan sin evaluar.

Los controles cubren tipo/valor del selector, usuario inexistente, TC y Step
duplicados, aserción ausente, Gherkin mecánico, cambio de método reutilizado,
rango 30→90 y traza de getter incompatible. Los positivos incluyen las cuatro
capas, login literal reutilizado, mensaje citado, método conservado y rango de
30 días del perfil reconocido. Son sondas independientes: `coverage.families`
asocia regresiones por familia, **no acredita haber ejecutado los tres escenarios**
ni la corrección semántica de todas sus etiquetas.

Exit 0 significa que todos los controles requeridos se evaluaron correctamente;
exit 1, falso positivo/negativo; exit 2, cobertura incompleta o entrada no evaluable.
El informe mantiene numeradores, denominadores, códigos esperados/observados,
huellas y controles no soportados. Sus tasas sólo describen este corpus técnico.

## Auditoría de los golden existentes

El [informe de procedencia](reports/harness-h0-golden-audit.json) fija hashes del
corpus y del código utilizado. Sus hashes físicos antes/después son idénticos.
Se usaron los runners existentes y archives temporales, sin modelos ni dispositivos.

| Golden | Resultado comprobado | Uso permitido por la evidencia |
| --- | --- | --- |
| TC-10251 | Replay matched; control válido y dos defectos detectados por su regla. Sus cuatro archivos son update y el baseline ya contiene el TC. | Control de regeneración; creación inicial no acreditada. |
| TC-10239 | Replay integral sin evaluar: dependencias compartidas parciales. La sonda del resolver encuentra plan/catalogo incoherentes. | Mantener historial y revisión QA; no usar como control técnico positivo. |

Ambos fijan framework `57e60c58b28ad4981e9a0b20ec50563c36ff854c`; no se sustituyen
por el `09674ce8…` del nuevo baseline. Ventas conserva Feature `create` y locators
`salesButton`/`noSalesMessage` en resolución `create`, mientras el catálogo capturado
ya contiene el caso y esos selectores: reproducirlo lleva a Feature `update` y
resoluciones `reuse`. La operación update del archivo JSON es otra dimensión.

`locator-provider.ts` y `redis.helper.ts` contienen proyecciones incompletas.
`TypeLocator` sí está completo. Los `currentHash` registrados coinciden con los
módulos completos del commit, lo que permitiría implementar una recuperación
verificada en un checkout temporal; los runners actuales aún la rechazan.

Además, ventas fue aprobado con declaración QA de ejecución correcta, pero su
validación técnica histórica es fallida. Completar las dependencias no basta
para convertirlo en control positivo. Se conservan la aprobación, los bytes y
las expectativas originales, y el fallo sigue visible en la suite de software.

## Evidencia de esta entrega

El [resumen con hashes y controles](reports/harness-h0-h1-summary.json) registra
la captura, sus requisitos pendientes y los controles de ambos modos. Para la
verificación de software y comandos ejecutados, ver la sección H0/H1 en
[AGENT_EVALUATION_PROGRESS.md](AGENT_EVALUATION_PROGRESS.md). Las herramientas
del Recorder usan el runtime disponible; la ejecución del target debe satisfacer
sus engines por separado. Ningún resultado de este lote mide éxito del LLM.

## Pendientes por abordar

- **H0 — Desarrollo:** preparar Node >=24/npm >=11 y dependencias del framework
  fijado, con recibo de instalación y comprobación en un checkout de ejecución.
  Corregir la captura de contexto para nuevas revisiones golden y evaluar la
  recuperación de dependencias por hash, sin reescribir versiones aprobadas.
- **H0/H1 — QA + desarrollo:** decidir una nueva referencia coherente de ventas,
  revisar entradas reales y criterios de los tres flujos, fijar usuarios y estado
  de app, completar contrapartes válidas y reservar familias/variantes cercanas.
- **Yapeo TC-10240 — QA + desarrollo:** la regeneración del 2026-09-09 terminó
  con validación técnica correcta y conserva las cuatro capas ya exportadas.
  Revisar el Then del teléfono ofuscado: actualmente afirma `¡Yapeaste!` y
  visibilidad de detalles, sin comparar teléfono, monto ni comentario esperado.
  Completar las aserciones y los criterios estructurados, mejorar los pasos
  imperativos heredados y ejecutar en Android QA. Recuperar las correcciones y
  registrar la revisión/resultado antes de proponerlo como referencia golden.
  Esta corrida acredita regeneración; no reemplaza el piloto con baseline limpio.
- **H2:** ejecutar el piloto real con modelo fijo, con/sin golden y tres repeticiones
  por caso: 18 generaciones para tres casos, cada una con máximo de dos pasadas.
- **H3:** priorizar fallos observados y comparar baseline/candidata con el resto
  del protocolo fijado. Aún no se atribuye ninguna mejora medida al agente.
- **H4:** ejecutar inicialmente un TC de consulta de movimientos en Android local
  QA y una fila de Examples; emitir evidencia por hash y detectar cero escenarios,
  steps indefinidos, omisiones, fallos de datos e infraestructura.
- **H5:** conectar reportes a CI/UI, reproducirlos desde otra PC y mantener el ciclo
  QA → PR → recuperación → nueva revisión golden con su aprobación explícita.
