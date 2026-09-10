# F4 — Recuperar correcciones del framework

**Recuperar cambios del framework** compara el código del caso con la última
exportación y guarda una revisión QA del mismo recording. No hace falta conectar
un dispositivo, commitear los cambios, abrir GitHub ni esperar aprobación o merge.
La recuperación lee el framework; no modifica sus archivos.

## Uso

1. En el inicio, abre **Revisión QA y golden → Revisar cambios del framework**.
   También puedes recuperarlos desde Revisión o el selector de una grabación
   existente. Elige el caso del ambiente/squad activos.
2. Añade opcionalmente URL del PR y notas, y pulsa **Comparar cambios**.
3. Revisa cada archivo: baseline previo, versión exportada, cambios del caso,
   cambios ajenos y código que se guardará. También se muestran repo/rama/commit
   locales y si hay cambios sin commit. La URL del PR es una referencia aportada
   por el QA; no se consulta ni se certifica su estado remoto.
4. Si una asociación no puede determinarse, usa `ruta anterior → ruta actual`
   para un archivo movido, o `ruta # símbolo1, símbolo2` para añadir símbolos del
   caso. `*` asocia el archivo completo: úsalo solo cuando todo sea parte del caso.
   Compara nuevamente para revisar esa selección. Las asociaciones pendientes
   no impiden guardar los demás cambios.
5. Pulsa **Guardar revisión QA**. El recorder conserva el código asociado, las
   relaciones, parámetros, procedencia y pendientes en una revisión histórica.
   Las asociaciones y referencia PR se conservan al volver a recuperar el caso.
6. Pulsa **Revisar como golden** para abrir los archivos recuperados y aprobar esa
   versión explícitamente. La guía indica qué paso sigue y explica por qué una
   acción todavía está deshabilitada. Cambiar el caso o los metadatos requiere
   comparar de nuevo. Los errores permiten reintentar; los resultados obsoletos
   y envíos duplicados no avanzan el flujo.

## Identidad y evidencia

`FrameworkRecoveryService` vive en `core/automation/infrastructure/frameworkRecovery/`.
Parte de `application-receipt.json`, el plan y la respuesta exportada. Cuando hay
historial, comprueba el recibo y lee la respuesta de ese evento inmutable. La copia
mutable solo sirve como fallback legado cuando coincide con el hash del recibo.
Nunca reconstruye la versión exportada leyendo el framework actual.

Desde F4, el evento de exportación incluye `exported-files.json` con los bytes
anteriores y exportados de todos los destinos, incluidos completions externos.
En paquetes F3 anteriores pueden recuperarse las baselines desde `reuse-context`;
si no hay evidencia íntegra del baseline previo, se marca como no disponible.
Se admiten recibos v1/v2 y exportaciones parciales. No se fabrican capas faltantes.

Al guardar se crea `history/v1` → `revision-created` con `source: framework-import`,
conservando recordingId, caseId, revisión padre e intento de origen. El artefacto
inmutable y la vista `framework-recovery.json` incluyen:

- archivos del caso y dependencias auxiliares, rutas previas/actuales y hashes;
- código recuperado y alcance por símbolo en archivos compartidos;
- relaciones Gherkin → definition → método/getter → locator/import;
- parámetros de Examples y las trazas originales del agente;
- asociaciones de acciones que pueden mantenerse y las que quedan pendientes;
- usuario local que guardó, fecha, notas y contexto opcional de PR/Git.

Los valores y declaraciones siguen disponibles en los archivos para reconstruir
las relaciones. Cambiar código no inventa eventos, XML, capturas, selectores
verificados ni ejecuciones Appium. `actions.json`, el escenario original y la
respuesta del agente permanecen como evidencia de origen; la versión corregida
vive en la revisión QA. El fallo autónomo, aprobación golden y verificación
funcional siguen siendo estados separados. **Guardar esta revisión no aprueba
un golden ni alimenta memoria.**

## Relaciones y archivos compartidos

La selección parte del recibo. Encuentra Features movidos por caseId único y
Steps por las expresiones Gherkin/Cucumber, expandiendo Examples. Sigue referencias
`this`, imports locales relativos o aliases del `tsconfig.json`, llamadas a Screen
Objects, claves de plataforma y helpers alcanzados por el caso. Un archivo movido
no necesita conservar el basename ni el sufijo `.steps.ts`/`.screen.ts`: las
relaciones reconocidas también determinan su capa. Helpers son dependencias del
caso, sin convertirse en una quinta capa obligatoria.

En un archivo creado por el caso se conserva el contenido completo revisado. En
un módulo compartido, el código guardado incorpora los símbolos aportados en la
exportación y los alcanzados desde el caso, conservando como contexto la versión
exportada de los demás. Las ediciones actuales ajenas se muestran en el diff,
pero sus cuerpos no entran en la revisión QA; solo queda su identificación como
excluidas. Un helper nuevo compartido conserva los símbolos e imports necesarios.
`currentHash` identifica el archivo completo en el checkout; `content` puede ser
la proyección del caso y no debe usarse como reemplazo directo del módulo.

Una relación ambigua, import local no resuelto, acceso dinámico, cambio de
estructura o sintaxis no reconocida queda pendiente. No se ejecuta código para
adivinarla ni se presume que los cambios de Git pertenezcan al caso. Si el QA
asocia explícitamente todo el archivo, puede conservar también código inválido.
La recuperación no exige score 100 ni declara que el caso haya funcionado.

## Guardado y límites

Los canales `preview-framework-recovery` y `save-framework-recovery` están
expuestos mediante funciones específicas del preload; el renderer no recibe
acceso genérico al filesystem. Main resuelve el caso dentro de recordings y
mantiene el contexto de framework, squad y ambiente.

Cada preview tiene un token y hashes de los archivos consultados, metadatos y
revisión fuente. Guardar vuelve a comprobarlos y rechaza cambios concurrentes,
cambios de checkout o token sustituido. Se rechazan rutas fuera del workspace,
symlinks (incluidos enlaces rotos), archivos no regulares y contenido no UTF-8.
No se normalizan los bytes: NFD/CRLF permanecen en el código recuperado.

La lectura se limita a código TS/TSX, JSON y Feature; excluye node_modules,
outputs, tools, runtime y rutas de credenciales/ambientes. Los archivos tienen un
límite de transporte de 4 MiB, el inventario 10000 entradas y el grafo 100
archivos. Un límite no trunca silenciosamente código ni convierte un caso en éxito.
Si falla la publicación del evento histórico se restaura la vista mutable previa.
No se trata de una garantía de recuperación frente a corte de energía.

## Regeneración y siguientes fases

F5 usa el código actual recuperado como baseline de regrabación/regeneración y
reexportación durante el PR, conciliando las partes compartidas con el checkout.
Ver [AUTOMATION_RECONCILIATION.md](AUTOMATION_RECONCILIATION.md). F6 añadirá
aprobación golden explícita; F7 realizará el piloto real.
