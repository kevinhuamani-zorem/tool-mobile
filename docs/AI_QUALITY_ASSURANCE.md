# Control de calidad de la generación asistida por Gemini

Gemini propone el Feature, Scenario y los enlaces entre Gherkin y acciones. No
escribe archivos. La estructura TypeScript, JSON y Gherkin continúa a cargo del
generador determinista y de sus validaciones existentes.

## Puertas automáticas

Ejecutar antes de integrar un cambio:

```bash
npm run quality
```

El comando exige:

- TypeScript válido en proceso principal y renderer;
- pruebas unitarias del contrato de IA, sanitización y cliente Gemini;
- 100 % de acciones enlazadas;
- 100 % de líneas Gherkin enlazadas;
- cero líneas duplicadas;
- score de calidad mínimo de 90/100;
- cobertura de generación 4/4: Feature, Steps, Locators y Screen Object;
- build completo de Electron y React.

## Procedimiento QA manual

1. Ejecutar el recorder sin `GEMINI_API_KEY` y comprobar que la grabación manual
   continúa disponible y el botón IA explica cómo habilitarse.
2. Configurar la clave únicamente en `tools/visual-recorder/.env` y comprobar
   que nunca aparece en DevTools, logs, renderer ni `localStorage`.
3. Grabar CLICK, TYPE y VERIFY_TEXT; solicitar la propuesta y confirmar que
   todas las acciones quedan enlazadas y editables.
4. Presionar Continuar en Gherkin y verificar que recién entonces se analiza el
   impacto contra otros escenarios y squads.
5. Corregir una línea con conflicto, volver a validar y comprobar que no se
   reutilizan ni modifican definiciones ajenas.
6. Revisar Preview: rutas bajo el squad, ID `TC-<número>`, bloques Android/iOS,
   JSON válido y Screen Object sin lógica Appium dentro del step.
7. Borrar un archivo propuesto antes de Generar y confirmar que el preview se
   recalcula desde el filesystem, sin conflictos obsoletos.
8. Probar error HTTP, timeout y JSON inválido de Gemini; el flujo manual debe
   permanecer operativo y no debe escribirse ningún archivo.

## Criterios de aceptación

- La IA no puede escribir ni sobrescribir archivos directamente.
- Un plan incompleto o inválido es rechazado antes del Preview.
- Los nombres propuestos usan kebab-case para archivos/módulos y camelCase para
  métodos/locators; se rechazan nombres genéricos basados en índices.
- La generación conserva el patrón `[TC-10239][Happy Path][AUTO-FRONT]`.
- Los secretos y datos personales se redactan antes de salir del proceso.
- La generación final sigue requiriendo revisión humana y validación local.
