# Control de calidad de la generación local

El recorder resuelve localmente las decisiones repetibles y, cuando existen
gaps, puede invocar Copilot o Claude con un paquete mínimo y sin secretos. La
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
- generación de las cuatro capas cuando el caso las necesita;
- build completo de Electron y React;
- reducción de contexto mínima para los grafos locales.
- cuatro rutas exactas, traza completa y score 100 para promover memoria;
- contexto máximo de 20 KB, timeout de 5 minutos y una sola reparación.
- detección de casos equivalentes sin invocar al agente;
- bloqueo de expresiones Gherkin, escenarios y selectores duplicados contra
  squad/Home;
- equivalencia de selectores con o sin prefijos `id=`, `~` y `android=`.
- protocolo Inspector v3 estricto, segunda validación contra el mismo
  `elementId`, roundtrip de TypeLocator y cap compacto de cuatro candidatos;
- `locator-candidates.json` como única allowlist de backups en el paquete, sin
  XML, screenshots, source ni atributos;
- reuse por alternativas verificadas con ranking determinista, gap QA ante
  ambigüedad y rechazo de selectores inventados por el agente;
- imports internos por `@screenobjects`, `@utils` y `@locators`, sin rutas
  relativas ni imports de `browser` sin uso.
- limpieza de placeholders vacíos al arrancar sin eliminar recordings con
  scenario, acciones o evidencia adicional.
- proyección determinística de hints/gaps sin sustituir plan ni contextos;
- política `NO SEARCH WITHOUT GAP`, allowlist por gap, límite de consultas,
  deduplicación y rechazo de gaps resueltos o bloqueantes;
- cero consultas al framework cuando el scenario queda completamente resuelto.

## Control manual

1. Grabar al menos una acción de click, escritura y validación.
2. Definir objetivo y resultado esperado; preparar el paquete mínimo.
3. Confirmar que selectores verificados y reuse squad/Home quedaron resueltos
   antes de abrir el agente.
4. Revisar `reuse-context.json` y `collision-report.json`; ningún candidato debe
   obligar al agente a explorar el framework.
   Revisar primero `hints.json` y `gaps.json`: si `gaps` está vacío no debe
   existir ninguna consulta permitida y `blocked-qa` debe tener presupuesto cero.
5. Confirmar que “Abrir Terminal del agente” esté habilitado, abra la carpeta
   mostrada y no ejecute ningún CLI automáticamente.
6. Copiar el prompt inicial mostrado y comprobar que limita al agente al paquete.
7. Revisar Feature, Steps, Screen Object y Locators en el visor de código.
8. Modificar un archivo y confirmar que el estado cambie a `Editado`.
9. Probar `Copiar contenido`, `Copiar ruta` y `Descartar cambios`.
10. Introducir JSON o Gherkin inválido y comprobar que la generación se bloquee.
11. Introducir un step como `And el usuario desplaza la pantalla hacia abajo`
    y comprobar que se rechace; enlazar el scroll al step funcional adyacente y
    comprobar que la traza completa sea válida.
12. Generar y confirmar que todos los archivos permanezcan dentro del workspace
   activo.
13. Confirmar que solo la generación validada al 100% aparece en memoria.
14. Regenerar un caso importado, confirmar la copia en `history`, un `planId`
    nuevo y las mismas cuatro rutas.
15. Modificar externamente uno de sus archivos y comprobar que el refinamiento
    validado no lo sobrescriba y reporte el conflicto del registry.
16. Generar un caso Android y comprobar `@android` sin `@ios`; completar todos
    los locators iOS y comprobar que el Feature y la respuesta guardada añadan
    `@ios` conservando `@android`.
17. Generar un módulo `cuentas-tapp` y comprobar clase `CuentasTappScreen`,
    singleton e import `cuentasTappScreen`; reemplazarlo por `generatedScreen`
    y comprobar que la validación bloquee la importación.
18. Generar un caso solo con click y comprobar que no importe `browser`;
    añadir una acción que use `browser.` y comprobar que lo importe una vez.
19. Sustituir un alias por una ruta relativa en Steps o Screen Object y
    comprobar que tanto `verify-package.js` como la importación lo rechacen.
