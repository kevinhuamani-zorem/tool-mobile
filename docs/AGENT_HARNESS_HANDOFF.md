# Continuar el harness y crear golden desde otra PC

Fecha de traspaso: 2026-09-10. Base de código: `f26c6e8`.
Repositorio: `kevinhuamani-zorem/tool-mobile`.
Rama con H0/H1: `feature/multi-agent-generation-pipeline`.
Responsable receptor: QA por asignar. Continuar en otra PC es parte de la
validación pendiente de H5; aún no se acredita una ejecución en esa máquina.

## Qué es el harness

Es el conjunto de componentes que permite ejecutar y evaluar a los agentes
con entradas, herramientas y reglas conocidas. En el Recorder tiene dos partes:

- **Generación:** prepara recording, catálogo del framework y referencias;
  coordina las cuatro capas, limita a dos pasadas, valida y conserva los archivos
  con sus diagnósticos para revisión/exportación.
- **Evaluación:** fija commits y entradas, comprueba los validadores con defectos
  conocidos y compara generaciones repetidas. La ejecución funcional y su
  integración completa con los reportes siguen pendientes.

Por ejemplo, si una generación cambia un selector Android por XPath, los
controles deben detectar esa diferencia y registrar el fallo. Otro control
comprueba que una implementación correcta no sea rechazada por equivocación.

Los **golden** son ejemplos aprobados por QA que los agentes pueden consultar.
Forman parte del contexto y del corpus de evaluación; no son el harness ni
actualizan los pesos del modelo. Crear referencias QA puede avanzar mientras se
completa el harness. H2–H5 no son requisitos para exportar ni aprobar un golden.

## Qué recibe el otro QA

| Ya compartido por Git del Recorder | Requiere preparación o traspaso separado |
| --- | --- |
| Código y herramientas H0/H1, fixtures, documentación y resúmenes | Dependencias, app instalada y configuración de la máquina |
| Golden aprobados, sus publicaciones, archivos y evidencia comprimida | Grabaciones originales, historial y recibos locales de runtime |
| Checklist de H0–H5 y problemas conocidos | Cambios sin commit en el repositorio del framework |

Las rutas del equipo anterior no son una configuración compartida. Los índices
se reconstruyen localmente. Consumir los golden publicados no requiere copiar
los recordings de quien los aprobó.

**TC-10240 en particular:** el Feature y los Steps del framework local siguen
sin seguimiento en Git; Screen y Locators contienen modificaciones locales.
Subir el Recorder no los publica. Para continuar exactamente ese caso hay que
acordar el traspaso de sus cuatro capas y de la grabación con su historial/recibos.
No existe un flujo de traslado de recordings documentado que garantice retomar
esa sesión automáticamente. El QA puede comenzar casos nuevos grabándolos en su PC.

## Preparar la otra PC

1. Obtener acceso a ambos repositorios y clonar/actualizar el Recorder en la
   rama indicada. El README general usa main; para retomar este trabajo usar
   `feature/multi-agent-generation-pipeline`, que contiene H0/H1. Conservar en
   el clon del framework los commits fijados por los experimentos y los golden:
   el lote usa `09674ce8ba298f650ad116c8d1dd82c7e19e8577` y los golden actuales
   fijan `57e60c58b28ad4981e9a0b20ec50563c36ff854c`. Un clon sin esos objetos
   deja sus replays sin evaluar hasta recuperar el historial correspondiente.
2. Instalar las dependencias de cada repositorio según sus lockfiles.
   Recorder declara Node >=22/npm >=10; el framework inspeccionado exige
   Node >=24/npm >=11. Usar el entorno compatible del framework para sus pruebas.
3. Preparar el Recorder según [Desarrollo](DEVELOPMENT.md) y el README.
   Autenticar el Copilot CLI propio para generar con agentes. Para Android local,
   preparar Java 17+, SDK/ADB y el dispositivo. iOS local requiere macOS y Xcode.
   El empaquetado documentado de la app es macOS; otro sistema requiere verificar
   su instalación y ejecución, sin asumir que la app de macOS sea portable.
4. Seleccionar el framework local desde el Recorder. En **Configuración →
   Casos golden → Seleccionar repositorio**, elegir la raíz del clon del
   Recorder, donde está package.json. El destino mostrado termina en tests/golden.
5. Ejecutar `npm run harness:controls` en el Recorder para comprobar el conjunto
   sintético. Luego seguir [Harness offline](AGENT_HARNESS_OFFLINE.md) para
   preparar un baseline por commit fuera de los checkouts fuente.

El conjunto sintético tiene tres casos propuestos y no está aprobado por QA.
Pasar sus controles no convierte esos fixtures en golden ni en pruebas mobile.

## Trabajo del QA: crear y compartir referencias

1. Grabar un flujo real con usuario y estado de app conocidos. Definir objetivo,
   criterios y verificaciones del efecto de negocio, además de acciones técnicas.
2. Generar y revisar las cuatro capas. Al finalizar las dos pasadas, las capas
   disponibles pueden exportarse con diagnósticos.
3. Ejecutar y corregir el caso en el framework. Para yapeo TC-10240, completar
   las comparaciones de monto, teléfono ofuscado y comentario; mejorar el Gherkin
   heredado. Su score técnico 100 no acredita estas condiciones de negocio.
4. Usar **Recuperar cambios del framework → Guardar revisión QA** para traer las
   correcciones. Revisar los archivos exactos, declarar el resultado de ejecución
   y aprobar explícitamente la nueva versión golden.
5. Elegir **Referencia para los agentes** para ejemplos de generación. Reservar
   otras familias/variantes con **Reservado para evaluación** para medir resultados
   sin entregar la solución al agente.
6. Compartir dos cambios según corresponda: PR del framework para la automatización;
   commit/push/PR del Recorder para tests/golden. Guardar golden no publica Git
   automáticamente. Actualizar la rama antes de aprobar evita trabajar con
   publicaciones desactualizadas.
7. Comprobar la integridad con `npm run golden:seed-memory`; otro QA recibe el
   dataset al actualizar su clon. Una corrección posterior abre otra revisión y
   aprobación, conservando el historial.

Esta es la revisión recomendada para producir referencias útiles. El contrato de
la app no exige score 100, validación verde, ejecución adicional ni PR integrado
para guardar un golden; conserva la aprobación y declaración QA por separado.
Detalles en [compartir golden](../tests/golden/README.md).

## Trabajo técnico pendiente del harness

| Fase | Próxima entrega | Perfil que puede retomarla |
| --- | --- | --- |
| H0 | Entorno/dependencias reproducibles; corregir captura de contexto y recuperación de dependencias por hash; nueva referencia coherente de ventas | QA de automatización + desarrollo |
| H1 | Casos reales con etiquetas QA independientes, usuarios/precondiciones fijos y familias reservadas | QA de cada flujo + QA de automatización |
| H2 | Piloto con modelo fijo, con/sin golden y tres repeticiones por caso | QA de automatización |
| H3 | Corregir fallos medidos y comparar baseline/candidata con el resto del protocolo fijado | Desarrollo + QA de automatización |
| H4 | Adaptador de ejecución Android local QA, inicialmente movimientos, con evidencia ligada a los archivos | Desarrollo + QA mobile |
| H5 | Informes CI/UI, reproducción en otra PC y mantenimiento de revisiones/PR/golden | Desarrollo + equipo QA |

Para evaluar creación inicial, usar un baseline sin salidas previas del mismo caso.
La última ejecución de TC-10240 produjo las mismas cuatro capas ya exportadas:
sirve para estudiar regeneración, no para acreditar generación inicial.

Problemas conocidos a conservar al comparar resultados:

- Suite del lote H0/H1: 1030/1031 pruebas aprobadas. La discrepancia de TC-10239
  entre plan y catálogo sigue abierta; no modificar sus esperados para ocultarla.
- Ventas contiene dependencias compartidas parciales; aprobar una referencia no
  garantiza que pueda usarse como control positivo de replay. Registrar integridad,
  reproducibilidad y ejecución funcional como resultados distintos.
- Diez negativos y tres positivos se evaluaron en modo sintético. Sobre el commit
  actual del framework, el control de rango y su contraparte quedan sin evaluar
  por una diferencia con el fixture mínimo. No interpretar exit 2 como aprobado.
- El piloto con proveedor real y la ejecución funcional del harness siguen
  pendientes. Cualquier nueva medición conserva commit, modelo, entradas y hashes.

El receptor actualiza [Avance y evidencia](AGENT_EVALUATION_PROGRESS.md) con
comandos, resultados, exclusiones y nuevos pendientes. El
[checklist completo](AGENT_HARNESS_OFFLINE.md#pendientes-por-abordar) conserva el
orden de trabajo; la [estrategia](AGENT_HARNESS_STRATEGY.md) define sus criterios de cierre.
