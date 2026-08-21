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
- generación de las cuatro capas cuando el caso las necesita;
- build completo de Electron y React;
- reducción de contexto mínima para los grafos locales.
- cuatro rutas exactas, traza completa y score 100 para promover memoria;
- contexto máximo de 20 KB, timeout de 5 minutos y una sola reparación.

## Control manual

1. Grabar al menos una acción de click, escritura y validación.
2. Definir objetivo y resultado esperado; preparar el paquete mínimo.
3. Confirmar que selectores verificados y reuse squad/Home quedaron resueltos
   antes de abrir el agente.
4. Revisar Feature, Steps, Screen Object y Locators en el visor de código.
5. Modificar un archivo y confirmar que el estado cambie a `Editado`.
6. Probar `Copiar contenido`, `Copiar ruta` y `Descartar cambios`.
7. Introducir JSON o Gherkin inválido y comprobar que la generación se bloquee.
8. Generar y confirmar que todos los archivos permanezcan dentro del workspace
   activo.
9. Confirmar que solo la generación validada al 100% aparece en memoria.
