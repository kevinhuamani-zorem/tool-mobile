# Control de calidad de la generación local

El recorder resuelve localmente las decisiones repetibles y, cuando existen
gaps, puede invocar Copilot CLI con paquetes por rol y sin secretos. La
respuesta no se escribe hasta superar validación determinista y revisión.

## Puerta automática

Ejecutar desde `tools/visual-recorder`:

```bash
npm run quality
```

La puerta exige:

- typecheck de main y renderer;
- todas las pruebas unitarias aprobadas;
- cobertura del 100 % de acciones enlazadas;
- ausencia de líneas Gherkin duplicadas;
- Gherkin declarativo, sin narrar clicks, botones, campos, scrolls, swipes ni
  esperas como pasos del escenario;
- acciones técnicas consecutivas agrupadas en steps funcionales, manteniendo
  trazabilidad de todas las secuencias;
- ciclos repetidos de interacción y validación expresados como una sola
  expectativa funcional, sin plantillas genéricas por cada variante;
- generación de las cuatro capas cuando el caso las necesita;
- build completo de Electron y React;
- reducción de contexto mínima para los grafos locales.
- cuatro rutas exactas, traza completa y ausencia de aprendizaje por exportación;
- historial inmutable por revisión/intento, originales previos a normalización,
  recibos v2 y rollback del framework si falla publicar el evento de exportación;
- medición de objetivos de 120 000 bytes y 300 000 ms por etapa (avisos, no
  cortes); hang stop independiente de una hora por defecto y reparación acotada
  según el plan;
- detección de casos equivalentes sin invocar al agente;
- bloqueo de expresiones Gherkin, escenarios y selectores duplicados contra
  squad/Home;
- equivalencia de selectores con o sin prefijos `id=`, `~` y `android=`.
- protocolo Inspector v3 estricto, segunda validación contra el mismo
  `elementId` y roundtrip de TypeLocator;
- selector único verificado por acción (sin backups persistidos), sin XML,
  screenshots, source ni atributos;
- reuse por coincidencia exacta del selector verificado y rechazo de selectores
  inventados por el agente;
- imports internos por `@screenobjects`, `@utils` y `@locators`, sin rutas
  relativas ni imports de `browser` sin uso.
- limpieza de placeholders vacíos al arrancar sin eliminar recordings con
  scenario, acciones o evidencia adicional.
- proyección determinística de hints/gaps sin sustituir plan ni contextos;
- política `NO SEARCH WITHOUT GAP`, allowlist por gap, límite de consultas,
  deduplicación y rechazo de gaps resueltos o bloqueantes;
- cero consultas al framework cuando el scenario queda completamente resuelto.
- round-trip UTF-8/NFC de tildes y eñes desde recording hasta Locators, incluso
  cuando el stream del agente divide un carácter multibyte entre chunks;
- diagnóstico de bytes inválidos, U+FFFD y mojibake; F3 conserva el contenido revisado al exportar.

## Control manual

### Comprobación semántica (fase 3)

`tests/frameworkCompilation.test.js` cubre overlay sin escrituras, aliases,
configuración heredada, NodeNext, imports JSON, métodos y argumentos inválidos,
claves ausentes, deuda preexistente, cambios de dependencias y estados no
comprobables. `tests/preparedAutomation.test.js` y `automationDraftExport.test.js`
comprueban que el handler exporta código con errores de tipos conservando sus
diagnósticos y que revierte el conjunto ante un fallo de escritura/finalización.
Aplicar nunca promociona memoria, tampoco con score 100.

En la app, importar un caso, introducir una llamada a un método inexistente y
revalidar: debe conservar los archivos para edición, indicar código TypeScript,
ruta y posición, y permitir **Exportar al framework** con observaciones. Corregir y revalidar vuelve a
comprobar los contenidos finales. Repetir después de cambiar una firma de una
dependencia fuera del recorder para confirmar que aplicar no usa un aprobado viejo.

El informe `framework-compilation.json` no equivale a un test ejecutado en el
dispositivo ni a un build completo del framework. `unavailable` nunca se acepta
como éxito; errores heredados quedan separados de regresiones del preview.

### Interfaz entre autores (fase 4)

`tests/screenApiContract.test.js` comprueba extracción tipada, estabilidad ante
cambios de redacción, tipos desconocidos, caché, Screens homónimos, shadowing,
export por defecto, métodos/argumentos/retornos incompatibles y firmas
opcionales/rest/overloads válidas. `tests/layeredGenerationOrchestrator.test.js`
ejecuta además el pipeline con proveedores simulados: cambiar solo Gherkin
conserva una ejecución de cada autor; cambiar el tipo de un argumento sin
cambiar `actionTrace` resincroniza únicamente Zorem. El handoff y la integración
deben incluir `screen-api.json` con los tipos definitivos.

Para prueba manual con Copilot, inspeccionar ese artefacto en
`agents/zorem` y `agents/sumrak`; ante una firma incompatible en la salida de
Zorem, la integración y su reparación deben mostrar un diagnóstico
`screen-api-mismatch` atribuido a Screen sin perder el borrador.
La revalidación del preview usa la compilación de fase 3. No interpretar una interfaz compatible como
una ejecución exitosa en el dispositivo.

### Recorrido manual general

1. Grabar al menos una acción de click, escritura y validación.
2. Definir objetivo y resultado esperado; preparar el paquete mínimo.
3. Confirmar que selectores verificados y reuse squad/Home quedaron resueltos
   antes de abrir el agente.
4. Revisar `reuse-context.json` y `collision-report.json`; ningún gap debe
   obligar al agente a explorar el framework fuera de `allowedQueries`.
   Revisar primero `hints.json` y `gaps.json`: si `gaps` está vacío no debe
   existir ninguna consulta permitida y `blocked-qa` debe tener presupuesto cero.
5. Confirmar que “Abrir Terminal del agente” esté habilitado, abra la carpeta
   mostrada y no ejecute ningún CLI automáticamente.
6. Copiar el prompt inicial mostrado y comprobar que limita al agente al paquete.
   En modo automático sobre macOS, confirmar además que PASS 2 abre Copilot en
   Terminal, recibe el prompt sin pegarlo manualmente y que una respuesta válida
   lleva el wizard a Revisión de forma automática.
7. Revisar Feature, Steps, Screen Object y Locators en el visor de código.
8. Modificar un archivo y confirmar que el estado cambie a `Editado`.
9. Probar `Copiar contenido`, `Copiar ruta` y `Descartar cambios`.
10. Introducir JSON o Gherkin inválido y comprobar que se conserva el diagnóstico
    y se permite exportar el borrador revisado en una ruta autorizada.
11. Introducir un step como `And el usuario desplaza la pantalla hacia abajo`
    y comprobar que se rechace; enlazar el scroll al step funcional adyacente y
    comprobar que la traza completa sea válida.
12. Generar y confirmar que todos los archivos permanezcan dentro del workspace
   activo.
13. Confirmar que aplicar no crea memoria y que un nuevo intento no usa cachés legacy.
14. Regenerar un caso exportado con observaciones, confirmar la copia en `history`,
    un `planId` nuevo y las rutas vigentes recuperadas.
15. Cambiar un método ajeno después de preparar y comprobar que se conserve al
    reimportar; cambiar la misma región que el agente y resolver el conflicto
    en el editor. Un cambio posterior al preview debe impedir aplicar.
16. Generar un caso Android y comprobar `@android` sin `@ios`; completar todos
    los locators iOS y comprobar que el Feature y la respuesta guardada añadan
    `@ios` conservando `@android`.
17. Generar un módulo `cuentas-tapp` y comprobar clase `CuentasTappScreen`,
    singleton e import `cuentasTappScreen`; reemplazarlo por `generatedScreen`
    y comprobar que la validación lo señale sin impedir exportar el borrador revisado.
18. Generar un caso solo con click y comprobar que no importe `browser`;
    añadir una acción que use `browser.` y comprobar que lo importe una vez.
19. Sustituir un alias por una ruta relativa en Steps o Screen Object y
    comprobar que tanto `verify-package.js` como la importación lo rechacen.

## Pipeline por capas

La evolución multiagente se introduce sin reemplazar todavía el flujo estable:

1. Derek es el owner determinístico y fija orden, identidad y handoffs.
2. Lorem (`behavior-author`) produce únicamente Feature y Steps.
3. Zorem (`interaction-author`) produce únicamente Screen Object y Locators.
4. Sumrak (`integration-reviewer`) consume ambos resultados, valida la trazabilidad
   cruzada y produce el `agent-response.json` que verá el QA.

Cada delegado trabaja en `generation/automation/agents/<nombre>`, recibe un manifiesto
acotado y publica un handoff por ruta, tamaño y SHA-256. El integrador rechaza
un resultado si cambió después del handoff. Los tres delegados son headless,
usan perfiles custom-agent y sesiones nombradas bajo Derek, y el pipeline es
la estrategia predeterminada. El recorder reemplaza cualquier
contenido reescrito por el integrador con las salidas exactas de los autores.
Lorem entrega a Zorem la interfaz de métodos por handoff. Si el validador
rechaza una capa, Derek dirige el feedback al autor responsable en la segunda
pasada. Cada rol participa como máximo una vez por pasada; no hay correcciones
internas de sesión ni relanzamientos adicionales. Las pruebas cubren fallos de
autores/integración, JSON inválido, límites de tamaño y recuperación sin Feature. La integración tampoco puede
contradecir una decisión determinista del plan: `reuse` solo es válido con
`TypeLocator` y selector normalizado idénticos.
El modo anterior permanece disponible con
`RECORDER_AGENT_PIPELINE=deterministic`.

### Recuperación QA desde el framework (F4)

La suite usa frameworks aislados para comprobar recuperación de las cuatro capas
y dependencias sin capturar cambios ajenos, preservando historial y evidencia
Appium. Prueba rutas movidas, asociación manual, guardado con pendientes y rechazo
de snapshots obsoletos o checkout cambiado. El piloto del `.app` con QA/Copilot
y ejecución en dispositivo sigue pendiente de F7; una revisión recuperada no lo
sustituye ni acredita aprobación golden.

### Regeneración con correcciones QA (F5)

`automationReconciliation.test.js` ejercita servicios reales de importación y
exportación, la preparación desde QA y regrabación, protecciones compartidas,
concurrencia, integridad y rollback. Prueba ciclos después de rebase/merge en Git
local. Las respuestas del agente están simuladas; el piloto real sigue en F7.
