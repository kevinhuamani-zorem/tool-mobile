# Recuperación progresiva de referencias golden

El recorder conserva todos los casos y su evidencia en Git. Desde
golden-selection/v4 prepara el contexto de cada rol por cobertura de la tarea.
Los ejemplos con la misma estructura se agrupan y el resto permanece consultable
durante la misma invocación del agente. No se reinstala un tope de bytes o de
cantidad de casos: cada archivo solicitado se devuelve completo.

## Índice incremental

GoldenRetrievalIndex deriva acciones, palabras del objetivo, patrones de código
por capa, características de aserciones y parámetros, reglas corregidas,
relaciones entre archivos y hashes de dependencias. La agrupación es estructural,
no una certificación de equivalencia funcional ni una búsqueda con embeddings.

ApprovedGoldenStore sigue siendo la autoridad. Lee la cadena de publicaciones y
verifica los snapshots. Dentro del proceso reutiliza una verificación solamente
si el árbol conserva nombres, tamaños, dispositivo, inode, mtime y ctime. Un
cambio obliga a comprobar otra vez todos los hashes. Restaurar mtime no oculta
una edición. Los manifiestos retornados son copias; se descartan verificaciones
de versiones inactivas al actualizar el índice.

La metadata se reconstruye para aprobaciones nuevas o cambiadas. El archivo
local tests/golden/retrieval-index.json está ignorado por Git y es descartable.
Nunca se confía en su contenido para conceder acceso: al reiniciar, la metadata
se reconstruye desde publicaciones verificadas. Un checkout de solo lectura
permite mantener el índice en memoria. Golden:seed-memory y Reconstruir índice
aprobado actualizan también esta proyección.

La compatibilidad conserva squad, plataforma, ambiente, subruta Feature,
contrato y hashes actuales del framework. Las lecturas compartidas de hashes
se deduplican durante cada búsqueda. Se excluyen versiones retiradas, casos
reservados para evaluación. En generación, la referencia aprobada del propio
recording/caseId tiene prioridad y se identifica como `same-case-approved`.
Sus archivos propios pueden diferir del checkout porque se está regenerando; las
dependencias ajenas mantienen la comprobación de hashes. Esto no habilita la
reutilización automática de fragmentos ni sustituye el código QA actual.

Para un ensayo independiente, inicia el Recorder con
`RECORDER_GOLDEN_PURPOSE=evaluation`: excluye el propio recording/caseId en la
selección inicial y en cada consulta de ambas pasadas. Sin esta variable, el
pipeline usa `generation`. Las APIs de consulta directa conservan por defecto
la exclusión, salvo propósito explícito. El propósito queda en el contexto
histórico; una regeneración asistida por su solución no es una prueba independiente.

## Selección inicial

El recorder identifica necesidades mediante acciones, palabras del objetivo,
aserciones, parámetros y códigos de errores de la pasada. Ordena candidatos por
coincidencia y correcciones pertinentes; a igualdad de puntuación prefiere la
aprobación más reciente. Añade otro ejemplo si aporta una necesidad aún no cubierta,
con un representante por patrón. Es una heurística determinista, no una medida
de suficiencia del razonamiento del modelo.

Lorem recibe Feature/Steps; Zorem Screen/Locators. Los archivos propios permanecen
íntegros. Las dependencias se describen por ruta, símbolos, hash y relación con
las capas del rol. Sumrak recibe solamente relaciones verificadas y lecciones
asociadas a sus errores o gaps abiertos. Un grafo con asociaciones pendientes
sigue siendo referencia QA para los autores y se identifica como no verificado.

El paquete general contiene metadata de descubrimiento. Los archivos de ejemplo
se materializan por rol al iniciar su etapa; no se cargan todos los cuerpos del
corpus como contexto inicial. La reutilización de fragmentos exactos filtra
primero por trazas y acciones compatibles antes de abrir evidencia completa.

## Consulta durante la misma pasada

golden-examples.json describe un protocolo de archivos. El agente utiliza las
herramientas create/edit/view que ya tenía disponibles:

1. Escribe golden-request.json con un id nuevo y una operación autorizada.
2. El recorder responde de forma atómica en golden-response.json.
3. El agente lee la respuesta cuyo requestId coincida. Puede continuar otro
   trabajo mientras llega y no debe publicar su entrega final antes de recibir
   los detalles necesarios.

Operaciones:

| Operación | Parámetros | Resultado |
| --- | --- | --- |
| catalog | cursor opcional, need del contexto inicial opcional | Grupos pertinentes |
| variants | groupId, cursor opcional | Casos conservados en ese grupo |
| example | goldenId, versionHash | Código propio y lecciones del rol |
| graph | goldenId, versionHash | Nodos y relaciones alcanzables desde sus capas |
| dependency | goldenId, versionHash, path de dependencies | Código aprobado completo de una dependencia autorizada |

Los listados tienen páginas de 20 referencias, total y nextCursor. La paginación
no descarta casos; los cuerpos de código no se truncan. El sobre de solicitud
tiene validación de esquema, ID y tamaño; no admite rutas arbitrarias ni queries
de framework. Las lecturas se restringen a referencias que ya eran pertinentes
al preparar esa tarea, y vuelven a comprobar aprobación y compatibilidad en cada
solicitud. Una nueva versión requiere preparar de nuevo el contexto de una etapa.

Las dependencias de los autores deben estar vinculadas a sus capas y ser de esas
capas o bibliotecas auxiliares. Sumrak no puede abrir cuerpos completos de código.
Las rutas absolutas, recorridos fuera de la carpeta y symlinks no conceden acceso.

El canal se abre exclusivamente alrededor de la invocación existente del proveedor
y se cierra también ante error o cancelación. No abre otra sesión, concede shell
a otros roles ni agrega pasadas. Expandir una referencia ya autorizada es una
lectura de contexto conocido; las nuevas búsquedas del framework siguen pasando
por GapQueryPolicy y requieren un gap abierto. Los golden no autorizan selectores,
no cierran gaps y no bloquean la exportación de borradores.

## Medición y comprobación

Las solicitudes, respuestas y métricas quedan en el historial inmutable bajo
golden-retrieval/. Se incluyen como procedencia al aprobar un golden nuevo,
sin modificar versiones anteriores.

LayeredGenerationStageReport.goldenRetrieval y agents:evaluate registran candidatos,
grupos, ejemplos iniciales, bytes, consultas, rechazos, tiempos del índice y de
recuperación, casos reconstruidos/reutilizados y referencias entregadas.
contextBytes incorpora las respuestas puestas a disposición durante la invocación.
No mide qué archivos leyó realmente el modelo ni equivale a tokens consumidos.

La evaluación conserva errores por regla, resultados de cada pasada,
intervención QA y tiempos. No cambia un intento fallido por una aprobación
posterior. Las ejecuciones antiguas sin estas métricas se marcan sin medición;
no se les atribuye cero uso de contexto.

Pruebas: goldenRetrieval.test.js comprueba índice incremental, caché adulterada,
edición con mtime restaurado, revocaciones y reservas durante una sesión,
permisos por rol, grafos, cuerpos completos, paginación de 23 casos, cobertura
sobre 2 000 candidatos sintéticos y cierre del canal tras fallo. El test del
orquestador comprueba que Lorem, Zorem y Sumrak consultan durante sus tres
invocaciones existentes.

Estos resultados comprueban selección y entrega. Para afirmar una mejora de los
agentes falta comparar sobre casos reservados, con el mismo modelo y framework,
las variantes con/sin referencias, medir fallos y correcciones QA y resolver la
discrepancia previa del replay de TC-10239. Las pruebas de ese replay siguen
activas y el snapshot aprobado no se cambia para hacerlas pasar.

## Datos del caso

`test-data-context.json` informa a Lorem si existen los nombres ya solicitados
o presentes en el baseline QA. Solo se leen nombres de `resources/data/**/*.yml`,
con comparación sin distinguir mayúsculas como `ScenarioSession`; no se incluyen
credenciales ni nombres ajenos. No certifica ausencia de ventas ni ejecución.
No se agregan filas de Examples para conciliar metadata obsoleta con el baseline.

La regla `test-data-user-missing` comprueba cada ejecución del login del caso
en el Feature propuesto y dirige el diagnóstico a Lorem. Si falta el catálogo,
un YAML no puede leerse o hay enlaces, se informa `test-data-unavailable` en
lugar de afirmar que el usuario no existe. La comprobación se repite al validar
el preview y al exportar; el QA puede exportar el borrador con observaciones.
