# Operación y troubleshooting

## Inicio rápido

Integrado:

```bash
cd tools/visual-recorder
./run.sh
```

Standalone:

```bash
RECORDER_MODE=standalone ./run.sh
```

Framework externo:

```bash
RECORDER_MODE=fwk-mobile TARGET_PROJECT=/ruta/al/proyecto ./run.sh
```

El modo activo y la raíz deben confirmarse en la pantalla inicial antes de
grabar. La plataforma queda fija al crear la sesión.

## Diagnóstico por síntomas

### El puerto 4723 está ocupado

`run.sh` se detiene para no matar una sesión desconocida. Localiza y cierra la
instancia Appium que posee el puerto, o reutiliza conscientemente un servidor
compatible. No automatices un borrado indiscriminado de procesos.

### Appium falla con `AppiumIpc is not a constructor`

Suele indicar versiones incompatibles o una caché de drivers que apunta a otra
ruta del proyecto. Confirma versiones de Appium/WebdriverIO, ejecuta instalación
desde esta carpeta y deja que `run.sh` regenere su caché. No copies `node_modules`
entre ubicaciones distintas.

### `unknown mobile command` o HTTP 404

El proveedor/driver no implementa el comando solicitado. Usa fallback W3C
(acciones de puntero) o un comando anunciado por el driver. Verifica Android,
iOS, local y BrowserStack por separado antes de generalizar una solución.

### Selector Android recuperado no funciona

Un valor UiAutomator debe conservar `android=` para que WebdriverIO seleccione
la estrategia correcta, por ejemplo:

```text
android=new UiSelector().text("Mostrar movimientos")
```

Un valor sin prefijo puede interpretarse como CSS o estrategia incorrecta.

### Elementos iOS no se detectan al hacer click visual

En iOS muchos controles visibles están dentro de padres `Other`, `Cell` o
contenedores no accesibles. El hit testing debe elegir el descendiente
interactivo/semántico (`TextField`, `Button`, etc.) más específico dentro de las
coordenadas, no solo el primer contenedor. Refresca XML y screenshot juntos para
evitar geometría desfasada.

### Scroll de una lista del renderer no aparece

El elemento con `overflow-y: auto` necesita una altura limitada y sus ancestros
flex/grid deben permitir encogimiento (`min-height: 0`). Evita depender del
scroll de `body` dentro de modales o columnas; la lista debe ser el contenedor
scrollable y acciones críticas deben quedar fuera de ella.

### La selección de escenario desaparece al conectar

La conexión no debe reinicializar el estado de onboarding/cobertura. Conserva
la selección por ID estable y vuelve a cargar catálogos sin reemplazar la
elección si todavía existe.

### Se reporta conflicto para un archivo eliminado

La caché o el registro no reemplazan una comprobación actual del filesystem.
Reescanea antes de generar. Un registro huérfano puede conservar auditoría, pero
no debe bloquear la creación de una ruta que ya no existe.

### Solo se genera Feature

Confirma que el adaptador soporte `supportsLayerGeneration`, que cada fila
Gherkin tenga acciones enlazadas y que Preview incluya Feature, Steps, Screen
Object y Locators. En neutral es esperado obtener export portable; en
fwk-mobile/standalone es un error si el caso requiere capas nuevas.

## Logs y secretos

Los logs pueden incluir modo, plataforma, dispositivo, canal y mensajes de
error. No deben incluir:

- valores de `.env`;
- BrowserStack username/access key;
- contraseñas, teléfonos, cuentas o tarjetas de datasets;
- contenido sensible escrito durante un step.

Sanitiza errores de APIs antes de enviarlos al renderer.

## Recuperación de generación

La escritura normal es atómica. Si una generación falla:

1. conserva el mensaje y las rutas afectadas;
2. verifica que no haya archivos temporales o parciales;
3. no borres archivos existentes para “desbloquear” el flujo;
4. corrige el generator/validator y repite Preview;
5. confirma hashes del registro antes de actualizar un archivo previo.

## Evidencia mínima para reportar un bug

- modo de workspace y plataforma;
- local o BrowserStack, dispositivo y versiones (sin credenciales);
- acción exacta y mensaje completo;
- selector con estrategia, si aplica;
- screenshot/XML de la misma captura;
- resultado de `npm run typecheck`, prueba focalizada y `git status --short`.

