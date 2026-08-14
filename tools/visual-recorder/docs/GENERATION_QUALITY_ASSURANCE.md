# Control de calidad de la generación local

El recorder genera Feature, Steps, Screen Object y Locators mediante reglas
deterministas locales. No envía código, credenciales ni grabaciones a servicios
de inteligencia artificial.

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

## Control manual

1. Grabar al menos una acción de click, escritura y validación.
2. Crear el Gherkin y enlazar todas las acciones.
3. Validar que los nombres de Feature, archivo, módulo, métodos y locators sean
   editables desde la revisión.
4. Revisar Feature, Steps, Screen Object y Locators en el visor de código.
5. Modificar un archivo y confirmar que el estado cambie a `Editado`.
6. Probar `Copiar contenido`, `Copiar ruta` y `Descartar cambios`.
7. Introducir JSON o Gherkin inválido y comprobar que la generación se bloquee.
8. Generar y confirmar que todos los archivos permanezcan dentro del workspace
   activo.
